# Backend Module: Comercial

## Overview

Módulo responsável pela gestão de clientes e vendas diretas. Ao criar uma venda, integra automaticamente com Estoque (baixa), Faturamento (fatura — placeholder) e Financeiro (conta a receber + movimentação).

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Clientes

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/comercial/clientes` | Lista clientes **paginada `Page[ClientOut]`** (`search` nome/documento; `order_by`: `name`/`created_at`). Filtro `is_delinquent=true` = inadimplência **efetiva** (manual OU vencida — 9.B); `false`/ausente = comportamento atual (só flag manual) |
| `POST` | `/api/comercial/clientes` | Cria cliente |
| `GET` | `/api/comercial/clientes/{id}` | Detalhe do cliente |
| `PUT` | `/api/comercial/clientes/{id}` | Atualiza dados do cliente |
| `PUT` | `/api/comercial/clientes/{id}/inadimplente` | Marca cliente como inadimplente |
| `PUT` | `/api/comercial/clientes/{id}/reverter-inadimplencia` | Reverte inadimplência manualmente |
| `DELETE` | `/api/comercial/clientes/{id}` | Soft delete do cliente |

### Vendas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/comercial/vendas` | Lista vendas **paginada `Page[SaleOut]`** (filtros `status`, `client_id`; `order_by`: `sold_at`/`status`) |
| `POST` | `/api/comercial/vendas` | Cria venda com itens (dispara integrações) |
| `GET` | `/api/comercial/vendas/{id}` | Detalhe da venda com itens |
| `PATCH` | `/api/comercial/vendas/{id}/status` | Atualiza status da venda (**não** aceita `cancelada` — ver abaixo) |
| `POST` | `/api/comercial/vendas/{id}/cancelar` | **Cancelar venda**: estorna estoque e financeiro ponta a ponta |
| `DELETE` | `/api/comercial/vendas/{id}` | Soft delete / "Excluir" (somente se já `cancelada` — ver abaixo) |

## Paginação server-side (Demanda 8)

`GET /clientes` e `GET /vendas` retornam o envelope **`Page[T]` cru** (não embrulhado em
`SuccessResponse`), no padrão de `app/shared/pagination.py`:
`{ items, total, page, page_size, pages }`. Parâmetros comuns: `page` (≥1, default 1),
`page_size` (1–100, default 20), `order_by`, `order_dir` (`asc`/`desc`), `search`.

| Endpoint | Filtros preservados | `search` (ILIKE) | `order_by` allowlist (default) |
|----------|---------------------|------------------|--------------------------------|
| `GET /clientes` | `is_delinquent` (efetiva quando `true`, ver Inadimplência) | nome, documento | `name` (default), `created_at` |
| `GET /vendas` | `status`, `client_id` | — | `sold_at` (default desc, indexado), `status` |

`order_by` é validado por allowlist: valor fora da lista cai no default (responde 200,
**nunca 500**). A PK é usada como `tiebreaker` (estabilidade entre páginas). `total` reflete
o conjunto filtrado completo (`deleted_at IS NULL`).

## Schemas

### ClientCreate / ClientUpdate
```json
{
  "name": "Cooperativa Café do Vale",
  "document": "12.345.678/0001-99",
  "email": "contato@cafedovale.com",
  "phone": "(11) 99999-9999",
  "address": "Rua X, 100",
  "cep": "01310-100",
  "street": "Avenida Paulista",
  "number": "1000",
  "complement": "Conjunto 52",
  "neighborhood": "Bela Vista",
  "city": "São Paulo",
  "state": "SP",
  "notes": "opcional"
}
```

- **`document` (CPF/CNPJ) — validado no backend (Demanda 7, paridade com Fornecedor):**
  continua **opcional**; quando informado, precisa ser um CPF **ou** CNPJ válido (dígitos
  verificadores oficiais). A validação fica no **Service** (`_validate_document_or_400`,
  reusa `validate_document` de `app/shared/br_documents.py`), não no schema. Documento
  inválido → **400 "CPF/CNPJ inválido"**. No `PUT`, só é revalidado se `document` vier no
  corpo (PATCH-like).
- **Endereço estruturado (`cep, street, number, complement, neighborhood, city, state`):**
  todos opcionais, espelham o cadastro de fornecedor. O backend apenas persiste o que
  recebe — a busca por CEP (ViaCEP) é feita no front. O campo legado `address` (texto livre)
  é mantido por compatibilidade, sem parsing/backfill.

### ClientOut — campos principais
- `id`, `name`, `document`, `email`, `phone`, `address`, `notes`
- Endereço estruturado: `cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `state`
- `is_delinquent` (bool) — flag **manual** (override D7); campo real no model (`is_delinquent`,
  não `is_defaulter`).
- **`has_overdue` (bool, Demanda 9.A)** — derivado: o cliente tem ≥1 parcela vencida (conta a
  receber com `due_date < hoje`, saldo em aberto e não cancelada). Calculado na leitura.
- **`is_delinquent_effective` (bool, Demanda 9.A)** — `is_delinquent` **OU** `has_overdue`. É o
  sinal que o front usa para **avisar** na venda e no badge da lista (ver "Inadimplência").
  Na listagem `GET /clientes` o `has_overdue` é anotado com **uma** query (sem N+1); no
  `GET /clientes/{id}` é consultado para aquele cliente.

### SaleCreate
```json
{
  "client_id": "uuid",
  "notes": "opcional",
  "sold_at": "2026-04-15T10:00:00Z",
  "items": [
    {
      "stock_item_id": "uuid",
      "quantity": 5,
      "unit_price": 900.00,
      "description": "opcional"
    }
  ],
  "installments": 1,
  "first_due_date": null,
  "installment_interval_days": 30,
  "payment_method": "a_vista" | "parcelado" | "pix" | "boleto",
  "shipping_cost": 150.00,
  "discount_percent": 10
}
```

- Mínimo de 1 item
- `total_amount` calculado automaticamente: **subtotal dos itens − desconto + `shipping_cost`**
- `discount_percent` (Demanda 9.C): desconto de **cabeçalho**, só **%** (0–100, default 0).
  Aplicado sobre o **subtotal dos itens** (não por item) — o `unit_price`/`subtotal` de cada
  item **permanece intacto** (preço de tabela preservado, modelo ERP auditável). Ver
  "Desconto de cabeçalho" nas regras de negócio
- `shipping_cost`: opcional (`>= 0`), custo de transporte. Quando `> 0`, é somado ao `total_amount` e dispara a emissão de uma NF de transporte (ver "Ao Criar uma Venda")
- `subtotal` por item = `quantity × unit_price`
- `sold_at` opcional (default: now)
- Status inicial sempre `realizada`
- `installments`: 1 a 24 (default 1 — pagamento à vista, fluxo atual inalterado)
- `first_due_date`: obrigatório quando `installments >= 2`
- `installment_interval_days`: dias entre parcelas (default 30)
- `payment_method`: default `a_vista`. Quando `"parcelado"`, exige `installments >= 2`. O valor escolhido é propagado para a(s) `accounts_receivable` gerada(s)

### SaleStatusUpdate
```json
{ "status": "entregue" }
```
- **Não aceita `"cancelada"`**: o Service recusa essa transição com **400** (o cancelamento
  é feito pela ação "Cancelar venda", que estorna estoque e financeiro).

### SaleCancelRequest (corpo da ação "Cancelar venda")
```json
{ "reason": "motivo opcional do cancelamento" }
```
- Corpo **opcional** (pode-se chamar `POST .../cancelar` sem body). `reason` é registrado nas
  NFs estornadas (`cancellation_reason`).

### SaleOut — campos principais
- Inclui `client_name`, `items` (com `stock_item_name` e `subtotal`), `payment_method` e `shipping_cost` (default `0`)
- **Desconto (Demanda 9.C):** `items_subtotal` (subtotal **bruto** dos itens, soma a preço de
  tabela), `discount_percent` e `discount_amount` (R$). Expostos para o front/NF montarem
  **Subtotal → Desconto → Total líquido** sem recomputar. `total_amount` já é o **líquido**
  (`items_subtotal − discount_amount + shipping_cost`).

## Regras de Negócio

### Status e Transições

```
realizada → entregue
realizada → cancelada  (somente via ação "Cancelar venda")
entregue  → cancelada  (somente via ação "Cancelar venda")
```

- `cancelada` é status final/irreversível — tentativa de alterar retorna `400`.
- **`PATCH /vendas/{id}/status` não realiza o cancelamento.** A transição para `cancelada`
  por esse endpoint é recusada com **400 "Para cancelar uma venda use a ação 'Cancelar
  venda', que estorna estoque e financeiro."** Isso fecha o buraco de integridade em que
  virar o status "pelado" deixava estoque baixado, contas a receber em aberto e NF emitida.
- `entregue` não pode retornar para `realizada`.
- **Soft delete ("Excluir") permitido apenas em vendas já `cancelada`** (ver "Excluir uma
  Venda" abaixo).
- Ao entregar: `delivered_at` é preenchido automaticamente com `datetime.now()`.

### Excluir uma Venda (`DELETE /vendas/{id}`)

"Excluir" é apenas **esconder** (soft delete: seta `deleted_at`) um registro **já
neutralizado** — nunca um atalho para descartar uma venda com efeitos fiscais vivos.
Por isso o guard é o inverso do que parece intuitivo:

- Só é permitido quando a venda já está **`cancelada`** (estoque devolvido, NFs e contas a
  receber já estornados pelo `cancel_sale`). Aí o `deleted_at` é seguro — não há nada a
  estornar, apenas se oculta o registro.
- Para qualquer outro status (`realizada`, `entregue`) → **409 "Vendas com efeitos fiscais
  não podem ser excluídas. Cancele a venda primeiro (a ação 'Cancelar venda' estorna estoque
  e financeiro)."** A venda **continua ativa** (`deleted_at IS NULL`).
- O soft delete **não** estorna nada (quem estorna é `cancel_sale`); ele só marca
  `deleted_at`. Fluxo coerente: **cancelar** (neutraliza) → **opcionalmente excluir** (esconde).

### Cancelar uma Venda (`POST /vendas/{id}/cancelar`)

Cancelamento é **evento fiscal, ancorado na NF**, e usa **um único motor de estorno** — o do
Faturamento (`cancelar_fatura` → `_cancelar_nf_venda`). O Comercial **não** duplica o estorno;
apenas localiza a NF da venda e delega. Passo a passo do `service.cancel_sale()`:

1. **`_get_sale_or_404`.** Se a venda já estiver `cancelada` → **400 "Venda já está
   cancelada"** (idempotência: no-op, sem segundo estorno).
2. **Localiza a NF de venda** ativa do `sale_id`, perguntando ao Faturamento
   (`faturamento_service.get_invoices_by_sale` — integração via Service, sem acessar o
   repository do outro módulo). Pega uma NF `invoice_type == "venda"` ainda não cancelada.
   Se não houver (estado anômalo — `create_sale` sempre emite NF de venda) → **409**.
3. **Chama `cancelar_fatura(db, invoice.id, reason=reason)` uma única vez.** O motor do
   Faturamento cancela a **cadeia inteira** pelo `sale_id`:
   - devolve cada item ao estoque (movimento `entrada` de estorno, `unit_cost=0`, sem mexer no CMP);
   - marca a `Sale` como `cancelada` (via `mark_sale_cancelled`, setter interno que contorna a
     guarda de `update_status`);
   - cancela **todas** as contas a receber da venda (e estorna o que já tiver sido recebido);
   - cancela **todas** as NFs da cadeia (parcelas **e** a NF de transporte/frete, com estorno do frete).

> **Por que `mark_sale_cancelled` e não `update_status`?** Como `update_status` passou a recusar
> a transição para `cancelada`, o motor do Faturamento usa um setter interno dedicado
> (`comercial_service.mark_sale_cancelled`) para gravar o status final — o estorno completo é
> orquestrado pelo próprio motor, então não há caminho "pelado" aqui.

### Ao Criar uma Venda

Executado em sequência no `service.create_sale()`:

1. **Validação de disponibilidade** — para cada item:
   ```python
   estoque_service.verificar_disponibilidade(db, stock_item_id, quantity)
   # Se insuficiente: HTTPException 400 com nome do item e quantidade disponível
   ```

2. **Criação da venda** — `repository.create_sale()` com status `realizada`. Aqui o
   **desconto de cabeçalho** é aplicado (Demanda 9.C): `discount_amount = subtotal_itens ×
   discount_percent / 100` (quantizado a R$ 0,01) e `total_amount = subtotal_itens −
   discount_amount + shipping_cost`. `discount_percent`/`discount_amount` ficam persistidos na
   venda (fonte única de verdade do desconto); o `subtotal` de cada item não muda.

3. **Baixa no Estoque** — para cada item:
   ```python
   estoque_service.registrar_saida(
       db,
       stock_item_id=item.stock_item_id,
       quantity=item.quantity,
       unit_cost=Decimal(str(stock_item.unit_cost)),  # CMP atual do item
       description=f"Venda #{sale.id}",
       source_module="comercial",
       reference_id=sale.id,
   )
   ```
   O `unit_cost` passado é o CMP (custo médio móvel) atual do item, para que a
   saída carregue o custo e viabilize o cálculo de CMV (Custo da Mercadoria
   Vendida). O `StockItem` é reaproveitado da validação de disponibilidade
   (etapa 1), sem query redundante. A movimentação financeira da saída continua
   em `amount=0` / `AJUSTE` — a receita é registrada apenas no recebimento da
   Conta a Receber.

4. **1 Nota Fiscal (Demanda 9.0)** — **sempre uma** nota de venda via
   `faturamento_service.criar_fatura(...)`, com o **total cheio** e os itens **uma vez**
   (`invoice_type="venda"`), emitida **no ato da venda** (invariante de timing). Não há mais
   `criar_faturas_parceladas` nem N notas. Retorna a nota; o `invoice.id` liga as parcelas.

5. **Conta(s) a Receber = as parcelas** — todas apontando `invoice_id` para a **nota única**:
   - **À vista (`installments <= 1`):** 1 AR com o total, `due_date = first_due_date` ou
     `today + 30d`.
   - **Parcelado (`installments >= 2`):** N AR (parcelas). `total_amount` dividido em
     `base_share` iguais; a **última parcela absorve o centavo residual** (soma fecha exata).
     Cada AR recebe `installment_number` (1-based), `installment_total`, `payment_method` e
     `due_date = first_due_date + n * installment_interval_days`. A divisão é feita no
     Comercial (`_calcular_vencimentos` migrou do Faturamento na 9.0).
   - As parcelas vivem **só na AR**; `invoice.installment_*`/`parent_invoice_id` ficam mortos.

6. **NF de Transporte** (somente se `shipping_cost > 0`) — via `faturamento_service.criar_nota_transporte(...)` com `sale_id`, `client_id`, sempre à vista (1 item, `quantity=1`, `unit_price=shipping_cost`), independente de a venda ser parcelada. Emitida após a(s) fatura(s) de itens.

7. **Movimentação Financeira** (rastreabilidade):
   - **À vista e Parcelado:** movimentação placeholder de R$0.
   - O valor real é registrado exclusivamente no recebimento da Conta a Receber
     (via `financeiro.receive_payment`).

### Desconto de cabeçalho na venda (Demanda 9.C)

Desconto **explícito e auditável de ponta a ponta** (modelo ERP correto): o preço de
tabela do item permanece intacto e o desconto é registrado **à parte**, no cabeçalho da
venda, **só em %** (sobre o subtotal dos itens, não por item). Sem roles/alçada (decisão
do usuário 2026-06-09 — é TCC).

**Efeito observável** — ao informar `discount_percent = X` na venda, o sistema:
1. mantém o `unit_price`/`subtotal` de cada item no **preço de tabela** (nada é reescrito);
2. calcula `discount_amount = subtotal_itens × X / 100` (R$, arredondado a 0,01) e grava
   `discount_percent` + `discount_amount` na venda;
3. fecha `total_amount = subtotal_itens − discount_amount + frete` (o **líquido**);
4. **a nota e as parcelas (contas a receber) derivam do líquido** — a NF de venda nasce com
   `total_amount` líquido e exibe **Subtotal → Desconto → Total líquido** (lendo o desconto da
   venda vinculada; ver `docs/backend/faturamento.md`); na venda parcelada, a soma das N
   parcelas fecha o líquido.

A venda é a **fonte única do desconto**: a NF **não** tem coluna própria de desconto (não se
duplica `sales.discount_amount`) e o valor **não** é derivado por subtração `Σitens − total`
(quebraria com frete, que entra no `total_amount` da NF de venda). O **cancelamento** estorna o
**líquido** (motor único do Faturamento intacto — estoque + todas as AR + nota; ver "Cancelar
uma Venda").

> **Frete (débito técnico pré-existente — fora do escopo da 9.C):** a NF de venda inclui o
> `shipping_cost` no `total_amount` **e** existe uma NF de transporte separada com o mesmo
> frete (`criar_nota_transporte`) — possível dupla contagem do frete. A 9.C **não** alterou o
> tratamento de frete; apenas registra a observação para uma demanda futura.

### Inadimplência de Clientes — AVISAR, não bloquear (D7) + DERIVADA (Demanda 9.A)
- **Efetiva = manual OU vencida.** O cliente é inadimplente **efetivo**
  (`is_delinquent_effective`) se o flag manual `is_delinquent` está ligado **OU** se tem
  alguma parcela vencida (`has_overdue`, derivado das contas a receber).
- **Manual (override D7, inalterado):** `is_delinquent` em `Client`; marcado via
  `PUT /clientes/{id}/inadimplente`, revertido via `PUT /clientes/{id}/reverter-inadimplencia`;
  o Financeiro também liga o flag ao `mark_as_defaulter`. Continua funcionando como override.
- **Derivada (9.A):** `has_overdue` é calculado **na leitura** (sem job/scheduler) consultando o
  Financeiro (`financeiro_service.get_client_ids_with_overdue` em lote para a lista;
  `client_has_overdue` para um cliente). Uma parcela está vencida se `due_date < hoje`, tem
  saldo em aberto (`amount_received < amount`) e não está cancelada.
- **`create_sale` NÃO consulta inadimplência e NÃO recusa a venda** — vender para cliente
  inadimplente (manual ou vencido) é concluído normalmente (201). **Avisar** é responsabilidade
  do front (badge + confirmação antes de finalizar), agora dirigido por `is_delinquent_effective`.
- **Filtro efetivo (9.B):** `GET /clientes?is_delinquent=true` retorna os **efetivamente**
  inadimplentes = flag manual **OU** `id ∈ get_client_ids_with_overdue` (uma query, reusada
  para a anotação — sem N+1). `is_delinquent=false`/ausente mantém o comportamento atual
  (apenas o flag manual), conforme decisão do PO.

## Database Schema

### `clients`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) |
| `document` | VARCHAR(32) (nullable) |
| `email` | VARCHAR(255) (nullable) |
| `phone` | VARCHAR(32) (nullable) |
| `address` | VARCHAR(500) (nullable) — endereço legado (texto livre) |
| `cep` | VARCHAR(9) (nullable) — endereço estruturado (D7) |
| `street` | VARCHAR(255) (nullable) |
| `number` | VARCHAR(20) (nullable) |
| `complement` | VARCHAR(120) (nullable) |
| `neighborhood` | VARCHAR(120) (nullable) |
| `city` | VARCHAR(120) (nullable) |
| `state` | VARCHAR(2) (nullable) — UF |
| `is_delinquent` | BOOLEAN default false |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `sales`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `client_id` | UUID FK → clients |
| `status` | enum (`realizada` / `entregue` / `cancelada`) |
| `total_amount` | NUMERIC(12,2) — **líquido**: subtotal itens − `discount_amount` + `shipping_cost` |
| `discount_percent` | NUMERIC(5,2) NOT NULL default 0 (Demanda 9.C) — % do desconto de cabeçalho |
| `discount_amount` | NUMERIC(12,2) NOT NULL default 0 (Demanda 9.C) — valor do desconto em R$ |
| `shipping_cost` | NUMERIC(12,2) (nullable, default 0) — custo de transporte |
| `sold_at` | TIMESTAMPTZ |
| `delivered_at` | TIMESTAMPTZ (nullable) |
| `notes` | TEXT (nullable) |
| `installments` | INT default 1 |
| `first_due_date` | DATE (nullable) |
| `installment_interval_days` | INT default 30 |
| `payment_method` | enum `payment_method` (`a_vista` / `parcelado` / `pix` / `boleto`, default `a_vista`) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `sale_items`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `sale_id` | UUID FK → sales (cascade delete) |
| `stock_item_id` | UUID FK → stock_items |
| `description` | VARCHAR(255) (nullable) |
| `quantity` | NUMERIC(12,3) |
| `unit_price` | NUMERIC(12,2) |
| `subtotal` | NUMERIC(12,2) — calculado na criação |
| `created_at`, `updated_at` | TIMESTAMPTZ |

## Migrations

`0007_add_shipping_cost` (arquivo `alembic/versions/20260528_0007_add_shipping_cost.py`):
- Adiciona `sales.shipping_cost NUMERIC(12,2) nullable, server_default '0'`.
- Adiciona `purchase_orders.shipping_cost NUMERIC(12,2) nullable, server_default '0'` (a mesma migration cobre Comercial e Compras).

Reversível via `downgrade()` (drop das duas colunas).

`0023_sale_discount` (arquivo `alembic/versions/20260611_0023_sale_discount.py`, Demanda 9.C / DBA):
- Adiciona à tabela `sales` o desconto de cabeçalho: `discount_percent NUMERIC(5,2)` e
  `discount_amount NUMERIC(12,2)`, ambos `NOT NULL DEFAULT 0`. O preço de tabela dos itens
  (`sale_items.subtotal`) permanece intacto; o `total_amount` passa a ser o líquido. O Backend
  (esta etapa) **não** criou migration — apenas aplica o desconto no `create_sale` e expõe os
  campos nos schemas. Reversível via `downgrade()` (drop das duas colunas).

`0021_client_address` (arquivo `alembic/versions/20260608_0021_client_address.py`, Demanda 7 / DBA):
- Adiciona à tabela `clients` o endereço estruturado (`cep, street, number, complement,
  neighborhood, city, state`), espelhando o que a D6 fez em `suppliers`. Mantém `address`
  legado. O Backend (esta etapa) **não** criou migration — apenas expôs os campos nos
  schemas/Service e os persiste no repository.

## Limitações conhecidas / Débito técnico

- **✅ Resolvido (D7): guard de "Excluir venda" invertido.** Antes, `soft_delete_sale` exigia
  status `realizada` e apenas marcava `deleted_at`, deixando NF de venda, contas a receber em
  aberto e a saída de estoque órfãs apontando para uma venda soft-deleted — e ainda proibia
  excluir a venda já `cancelada` (que seria inofensivo). Agora o soft delete só é permitido em
  venda **já `cancelada`** (efeitos já estornados pelo `cancel_sale`); qualquer outro status
  retorna **409**. Ver "Excluir uma Venda" na seção de regras de negócio. O cancelamento
  continua sendo o único caminho que estorna estoque/financeiro.

## Campos Importantes vs. Spec

| Spec | Model real |
|------|-----------|
| `is_defaulter` | `is_delinquent` |
| `total_price` (item) | `subtotal` |

## Nota sobre SaleItem

`SaleItem` não possui relationship `stock_item` no model. O `repository._load_relations()` executa uma query manual por todos os `StockItem` IDs dos itens e injeta via `item.__dict__["stock_item"]`, sem alterar o model.
