# Backend Module: Faturamento

## Overview

Módulo responsável pela gestão de faturas. Faturas podem ser criadas automaticamente ao registrar uma venda (via Comercial) ou manualmente pelo usuário. A integração com o Financeiro garante rastreabilidade de emissões, pagamentos e cancelamentos.

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/faturamento/faturas` | Lista faturas (filtros: `status`, `client_id`, `order_id`, `sale_id`, paginação) |
| `POST` | `/api/faturamento/faturas` | Cria fatura manual |
| `GET` | `/api/faturamento/faturas/{id}` | Detalhe com itens |
| `PATCH` | `/api/faturamento/faturas/{id}/status` | Atualiza status (sem estorno — apenas movimento de rastreabilidade R$0) |
| `POST` | `/api/faturamento/faturas/{id}/cancelar` | **Cancela com estorno** por tipo de NF (ver abaixo). Body opcional `{ "reason": "..." }` |
| `DELETE` | `/api/faturamento/faturas/{id}` | Soft delete (somente se `emitida`) |

### Filtro por ordem de compra (`?order_id=<uuid>`, Demanda 1.1)

As NFs de compra **não** têm FK para a ordem — o vínculo é o texto `order_id=<uuid>`
gravado em `invoices.notes` (mesmo padrão usado por `existe_nota_recebimento`). O
filtro `order_id` em `GET /faturas` aplica `Invoice.notes ILIKE '%order_id=<uuid>%'`,
retornando todas as NFs daquela ordem (recebimento/transporte/devolução/serviço).
Combinável com `status` e `client_id`; ordenação e envelope inalterados.

> **Débito técnico:** uma coluna FK `purchase_orders` em `invoices` fica para uma
> demanda futura de limpeza — por ora o vínculo permanece textual para não alterar
> o schema (head segue `0012`).

### Filtro por venda (`?sale_id=<uuid>`, Demanda 7)

Diferente das NFs de compra, as NFs de **venda** têm FK real `invoices.sale_id`. O
filtro `sale_id` em `GET /faturas` aplica `Invoice.sale_id == <uuid>`, retornando
**toda a cadeia** de NFs da venda — as N notas de venda (parcelas) **mais** a NF de
transporte/frete. Serve ao front para "Ver notas fiscais da venda" (espelha o "Ver
notas relacionadas" da Compra). Combinável com `status` e `client_id`; ordenação e
envelope inalterados.

## Schemas

### InvoiceCreate (fatura manual)
```json
{
  "client_id": "uuid",
  "notes": "opcional",
  "due_date": "2026-05-15",
  "items": [
    {
      "description": "Café Especial 10 sacas",
      "quantity": 10,
      "unit_price": 900.00
    }
  ]
}
```

- Mínimo de 1 item
- `subtotal` por item = `quantity × unit_price`
- `due_date` opcional (default: hoje + 30 dias)
- `number` gerado automaticamente (INV-0001, INV-0002, ...)

### InvoiceStatusUpdate
```json
{ "status": "paga" }
```

### InvoiceOut
- Inclui `client_name`, `number`, `issue_date`, `due_date`, itens com `subtotal`.
- **`parcelas` (Demanda 9.0):** o **bloco de cobrança** da nota — lista das contas a
  receber (`accounts_receivable`) ligadas à nota por `invoice_id`. Cada parcela:
  `id`, `number`, `installment_number`, `installment_total`, `due_date`, `amount`,
  `amount_received`, `status`, `payment_method`. AR canceladas são omitidas. Para notas
  sem AR (transporte/serviço/etc.) o bloco vem **vazio**.
- **`status` é derivado** (ver "Status derivado das parcelas" abaixo) — não reflete
  cegamente `invoices.status`.

## Modelo 1 NF + N parcelas (Demanda 9.0)

A venda **parcelada** deixou de cunhar **N notas** (uma por parcela, itens duplicados,
encadeadas por `parent_invoice_id`). Agora toda venda gera **1 nota de venda** (total cheio,
itens uma vez) e as **parcelas vivem só na `accounts_receivable`** (N AR, todas com
`invoice_id` = a nota única, `installment_number/total` na AR). À vista = 1 nota + 1 AR.

- A divisão de valores/vencimentos é feita no `comercial.create_sale` (dirige as AR), não
  mais no Faturamento. `base_share` igual; a última parcela absorve o centavo residual.
- `invoice.installment_number/installment_total/parent_invoice_id` ficam **NULL/mortos** no
  fluxo de venda (mantidos nullable; **não** setados, **não** dropados nesta etapa).
- A NF de transporte (frete) continua emitida à parte quando há `shipping_cost > 0`.

## Regras de Negócio

### Status e Transições

```
emitida → paga      (derivado das parcelas — ver abaixo)
emitida → cancelada (status final)
```

- `cancelada` é **status final** — tentativa de alterar retorna `400`.
- Soft delete apenas em faturas com status `emitida`.

### Status derivado das parcelas (Demanda 9.0)

A nota de venda **nasce `emitida`** no ato da venda e é considerada **`paga` quando TODAS as
suas parcelas (AR) estiverem `quitado`** — **nunca por parcela**. O cálculo é **derivado na
leitura** (`InvoiceOut.from_model` + `service.serialize_invoice`, que consulta as AR da nota
via `financeiro_service.get_receivables_by_invoice`); o campo `invoices.status` no banco
permanece `emitida` (não é reescrito a cada baixa). `cancelada` é preservado e tem
precedência. Notas sem AR mantêm o status do banco.

> **Limitação conhecida:** como o status "paga" é derivado e **não** persistido, o filtro
> `GET /faturas?status=paga` (que usa a coluna do banco) **não** retorna notas de venda
> quitadas-por-derivação. Aceitável na 9.0 (decisão "derivar na leitura"); revisitar se o
> filtro por status virar requisito.

### Ao Marcar como Paga
```python
fin_service.registrar_movimento(
    db,
    movement_type=MovementType.ENTRADA,
    category=FinancialCategory.RECEBIMENTO,
    amount=invoice.total_amount,
    description=f"Pagamento de fatura {invoice.number}",
    source_module="faturamento",
    reference_id=invoice.id,
)
```

### Ao Cancelar
```python
fin_service.registrar_movimento(
    db,
    movement_type=MovementType.SAIDA,
    category=FinancialCategory.AJUSTE,
    amount=Decimal("0"),
    description=f"Fatura cancelada: {invoice.number}",
    source_module="faturamento",
    reference_id=invoice.id,
)
```

## Função Pública — `criar_fatura` (toda venda: à vista E parcelada)

Chamada pelo Comercial em **toda** venda (Demanda 9.0 — não há mais caminho de N notas).
Emite **uma** nota de venda com o **total cheio** e os itens **uma vez**.

```python
from app.modules.faturamento import service as fat_service

invoice = fat_service.criar_fatura(
    db,
    sale_id=sale.id,
    client_id=sale.client_id,
    items=sale.items,           # SaleItem ORM objects
    total_amount=sale.total_amount,   # total cheio (à vista ou parcelado)
    source_module="comercial",
)
```

Internamente:
1. Resolve nomes dos itens via `StockItem` (buscado por `stock_item_id`).
2. Cria `Invoice` + `InvoiceItem` com `number` auto-gerado, `issue_date = today()`,
   `due_date = today + 30d`, `invoice_type="venda"`.
3. Registra movimentação financeira `ENTRADA/VENDA, amount=0` (rastreabilidade de emissão) —
   **uma vez**.

Retorna o `Invoice` criado; o Comercial usa o `invoice.id` para ligar as parcelas (AR).

> **Removido na Demanda 9.0:** `criar_faturas_parceladas` (cunhava N notas, uma por parcela,
> com itens duplicados e `parent_invoice_id`). O split de valores/vencimentos passou a
> **dirigir as AR** no `comercial.create_sale` (helper `_calcular_vencimentos` migrou para o
> Comercial). Não existe mais caminho que cria N notas de venda.

## Função Pública — `serialize_invoice(db, invoice) → InvoiceOut`

Ponto único de serialização (usado pelo router). Busca as parcelas da nota
(`financeiro_service.get_receivables_by_invoice`, omitindo as canceladas) e monta o
`InvoiceOut` com o **bloco `parcelas`** e o **status derivado**.

## Fatura Manual vs. Automática

| | Automática (via Comercial) | Manual |
|--|---|---|
| Origem | `criar_fatura()` chamada por `comercial.service` | `POST /api/faturamento/faturas` |
| `sale_id` | ID da venda | `null` |
| Conta a Receber | Criada pelo Comercial | Criada pelo Faturamento |
| Itens | Gerados a partir dos `SaleItem` | Informados pelo usuário |

## Funções Públicas — NF de Recebimento e Devolução (Compras)

A partir da **Demanda 1.1**, são chamadas por `compras.finalize_receipt` no momento da **conferência** (não mais no pagamento), via `_gerar_estoque_e_nf_da_conferencia` — idempotente (guard `existe_nota_recebimento`). Diferentemente da fatura comercial, essas NFs representam o **fluxo fiscal interno** de um recebimento de fornecedor e ficam com `client_id = NULL`. Elas são identificadas no campo `notes` por prefixo + `order_id=<uuid>`.

### `existe_nota_recebimento(db, order_id) → bool`
- `True` se já existe uma NF de recebimento (qualquer status) para a ordem. Usado por Compras para manter a emissão de NF/estoque na conferência idempotente (evita re-entrada).

### `criar_nota_recebimento(db, order_id) → Invoice`
- Origem: itens da ordem com `quantity_accepted > 0`
- `client_id`: `NULL` (NF fiscal de recebimento, não vinculada a cliente)
- `invoice_type`: `"recebimento"`
- `total_amount`: `Σ (quantity_accepted × unit_price)` (= `receipt_total_amount` da ordem)
- `notes`: `"[NF-RECEBIMENTO] order_id=<uuid> — <supplier_name> — Nota fiscal de recebimento — Ordem de compra #<order_id>"`
- Itens: `description = "{stock_item_name} — {quantity_accepted} {unit}"`
- Registra `financial_movement` `ENTRADA/COMPRA, amount=0` para rastreabilidade.

### `criar_nota_devolucao(db, order_id) → Optional[Invoice]`
- Origem: itens da ordem com `quantity_rejected > 0`
- Retorna `None` se não houver itens recusados
- `client_id`: `NULL`
- `invoice_type`: `"devolucao"`
- `total_amount`: `Σ (quantity_rejected × unit_price)`
- `notes`: `"[NF-DEVOLUCAO] order_id=<uuid> — <supplier_name> — Devolução vinculada à NF recebimento #<INV-XXXX> — Fornecedor notificado"` (referência à NF de recebimento localizada via `ILIKE` sobre o `order_id` no `notes`)
- Itens: `description = "DEVOLUÇÃO: {stock_item_name} — {quantity_rejected} {unit} — Motivo: {rejection_reason}"`
- Registra `financial_movement` `SAIDA/COMPRA, amount=0`.

> Prefixos: `_NF_RECEBIMENTO_PREFIX = "[NF-RECEBIMENTO]"` e `_NF_DEVOLUCAO_PREFIX = "[NF-DEVOLUCAO]"` no `service.py`. O vínculo recebimento ↔ devolução é feito buscando o prefixo + `order_id=<uuid>` no campo `notes` — não há FK dedicada, intencionalmente, para evitar alterar o schema de `invoices` por causa do fluxo de compras.

## Função Pública — `criar_nota_servico` (Compras, Demanda 1.1)

Emite a NF fiscal de uma **ordem de serviço**. Chamada por `compras.complete_service_order` (`/concluir-servico`) — ou por `finalize_receipt` como fallback — no **aceite**, nunca no pagamento.

### `criar_nota_servico(db, order_id) → Invoice`
- `client_id`: `NULL`
- `invoice_type`: `"servico"`
- 1 item: `description = order.service_description`, `quantity=1`, `unit_price = total_amount`
- `total_amount`: `order.total_amount`
- `due_date`: `order.first_due_date` se houver, senão `date.today()`
- `notes`: `"[NF-SERVICO] order_id=<uuid> — <supplier_name> — <service_description>"`
- **Idempotente:** não emite uma 2ª NF se já existir uma `servico` para a ordem (retorna a existente).
- Registra `financial_movement` `SAIDA/COMPRA, amount=0` para rastreabilidade (o débito real é o pagamento da conta a pagar).

> Prefixo: `_NF_SERVICO_PREFIX = "[NF-SERVICO]"` no `service.py`.

## Função Pública — `criar_nota_folha` (Folha, Demanda 4)

Emite a NF fiscal de **pagamento de folha** — 1 por funcionário/holerite. Chamada pelo **Financeiro** ao **aprovar** uma solicitação de pagamento de folha (`POST /api/financeiro/aprovacoes-folha/{id}/aprovar`), nunca direto pela Folha. Molde de `criar_nota_servico`.

### `criar_nota_folha(db, entry, period) → Invoice`
- `client_id`: `NULL` (não é cliente)
- `invoice_type`: `"folha_pagamento"`
- 1 item: `description = "Salário MM/AAAA — {nome do funcionário}"`, `quantity=1`, `unit_price = entry.net_amount`
- `total_amount`: `entry.net_amount`
- `due_date`: `date.today()`
- `notes`: `"[NF-FOLHA] entry_id=<uuid> employee=<nome>"` (vínculo ao holerite pelo texto, mesmo estilo das NFs de compra)
- Registra `financial_movement` `SAIDA/FOLHA, amount=0` para rastreabilidade. **O débito real é o `saida/folha` (= `net_amount`) lançado pelo Financeiro na aprovação**, não esta NF.

> Prefixo: `_NF_FOLHA_PREFIX = "[NF-FOLHA]"` no `service.py`. Import lazy de `folha.model.Employee` para evitar ciclo.

## Função Pública — `criar_nota_transporte` (frete)

Emite uma NF de transporte representando o custo de frete (`shipping_cost`) de uma venda ou de uma ordem de compra de produto. Sempre **à vista** (1 item, `quantity=1`, `unit_price=shipping_cost`), mesmo quando a venda/ordem é parcelada.

### `criar_nota_transporte(db, shipping_cost, sale_id=None, order_id=None, client_id=None) → Invoice`
- `invoice_type`: `"transporte"`
- 1 item fixo: `description="Custo de transporte — <ref>"`, `quantity=1`, `unit_price=shipping_cost`, `subtotal=shipping_cost`
- `total_amount`: `shipping_cost`
- `due_date`: `date.today()`
- **Para vendas** (chamada pelo Comercial na criação da venda): `sale_id=<venda.id>`, `client_id=<venda.client_id>`, `movement_type=ENTRADA`, `category=VENDA`
- **Para compras** (chamada na **conferência**, via `_gerar_estoque_e_nf_da_conferencia`): `order_id=<ordem.id>`, `client_id=NULL`, `movement_type=SAIDA`, `category=COMPRA`
- `notes`: `"[NF-TRANSPORTE] sale_id=<uuid> — Custo de transporte — Venda #<uuid>"` ou `"[NF-TRANSPORTE] order_id=<uuid> — Custo de transporte — Ordem de compra #<uuid>"`
- Registra `financial_movement` `amount=0` para rastreabilidade.

> Prefixo: `_NF_TRANSPORTE_PREFIX = "[NF-TRANSPORTE]"` no `service.py`. A NF de transporte só é emitida quando `shipping_cost > 0`.

## Função Pública — `get_invoices_by_sale` (integração Comercial, Demanda 7)

### `get_invoices_by_sale(db, sale_id) → list[Invoice]`

Lista **todas** as NFs (não deletadas) vinculadas a uma venda, por `sale_id`
(qualquer `invoice_type`/status). É o ponto de integração para o Comercial
localizar a NF de venda e acionar o cancelamento (`cancel_sale` → `cancelar_fatura`)
**sem** acessar o repository do Faturamento diretamente — a integração entre módulos
passa pelo Service.

## Cancelamento de NF com estorno (`POST /faturas/{id}/cancelar`) — Demanda 1 + 1.1

Endpoint **dedicado** (não confundir com o `PATCH /status`, que só registra um
movimento R$0 de rastreabilidade). Reverte os efeitos da NF conforme o
`invoice_type`, despachando em `service.cancelar_fatura()`. Body opcional
`InvoiceCancel { reason?: str }` — gravado em `invoices.cancellation_reason`.

> **Princípio Demanda 1.1 — "o dinheiro só se move no pagamento":** para NFs de
> **compra** (recebimento/transporte/serviço), o tratamento financeiro é
> centralizado em `_reverter_financeiro_ordem_compra(db, order_id)`:
> - **parte já paga** da ordem → estorno `ENTRADA/AJUSTE` do **valor pago**
>   (`fin_service.total_pago_por_ordem`), registrado **uma única vez** por ordem
>   (guard `fin_service.existe_estorno_ordem`);
> - **parte em aberto** → as contas a pagar `em_aberto` são **canceladas**
>   (`fin_service.cancelar_contas_pagar_em_aberto_por_ordem`) — o dinheiro nunca
>   saiu, então não há estorno.
>
> A idempotência por ordem evita estorno duplicado quando recebimento **e**
> transporte da mesma ordem são cancelados.

**Quando é permitido:** a partir de `emitida` **e** `paga`. Se já `cancelada` →
`400 "Nota fiscal já está cancelada"`. A marcação `status=cancelada` +
`cancelled_at` (carimbada em `repository.cancel_invoice`) é a **guarda de
idempotência** — re-cancelar é bloqueado, então nenhum efeito é estornado duas vezes.

### Efeitos por tipo

| Tipo | Efeito ao cancelar |
|------|--------------------|
| **`venda`** | Ponta a ponta (D4): (a) devolve cada item da venda ao estoque via `estoque_service.registrar_entrada` com **`unit_cost=0`** (entrada gera ajuste R$0, **sem** movimento de "compra" e **sem** alterar o CMP — o lado financeiro fica nas contas a receber); `reference_id` da movimentação = `sale.id`. (b) `sales.status = cancelada` (via `comercial_service.mark_sale_cancelled` — setter interno; ver nota abaixo). (c) **Todas** as `accounts_receivable` da venda → `cancelada`; para `amount_received > 0`, gera estorno `SAIDA/AJUSTE` com a descrição `"Estorno cancelamento NF {number}"`. (d) as NFs da venda com o mesmo `sale_id` são marcadas `cancelada` — desde a **Demanda 9.0** isso é **1 nota de venda** (+ a NF de transporte se houver frete, com estorno do frete `SAIDA/AJUSTE`), não mais N notas. As parcelas (AR) já foram canceladas no passo (c), pelo `sale_id`. |
| **`recebimento`** | (a) Estoque: **sempre** remove as `quantity_accepted` (resolve `order_id` no `notes` → `purchase_order_receipts/items` → `registrar_saida` com `unit_cost=0`, `reference_id = invoice.id`). (b) Financeiro: `_reverter_financeiro_ordem_compra` — **antes de pagar** só cancela as contas a pagar em aberto (sem estorno); **depois de pago** estorna `ENTRADA/AJUSTE` do **valor pago** (uma única vez por ordem). |
| **`transporte`** | NF de **compra** (`order_id` no `notes`): o frete está embutido na(s) conta(s) a pagar da ordem → usa `_reverter_financeiro_ordem_compra` (mesmo princípio do recebimento, idempotente — não duplica se a NF de recebimento da mesma ordem também for cancelada). NF de **venda** (`sale_id`): estorno do frete `SAIDA/AJUSTE` = `total_amount`. Descrição `"Estorno NF transporte {number}"`. Sem efeito de estoque. |
| **`servico`** | Sem estoque. Financeiro via `_reverter_financeiro_ordem_compra`: **antes de pagar** cancela a conta a pagar em aberto; **depois de pago** estorna `ENTRADA/AJUSTE` do valor pago (uma única vez). |
| **`devolucao`** | Para cada item recusado (`order_id` no `notes` → receipts com `quantity_rejected > 0`): resolve o `stock_item` original, monta o SKU `"{sku}-AVARIADO"`, **busca**; se não existir, cria `stock_item` `"{name} (AVARIADO)"` (mesma unidade/categoria, `unit_cost=0`); registra `entrada` da `quantity_rejected` (`unit_cost=0`). O item AVARIADO é **reaproveitado por SKU** (idempotente — nunca duplica). |

### SKU AVARIADO

Padrão `"{sku_original}-AVARIADO"`. A criação/reuso fica em
`estoque_service.obter_ou_criar_item_avariado(db, original)`: busca por
`get_item_by_sku`; reaproveita se existir, senão cria via `create_item`.

### Orquestração e camadas

Tudo orquestrado no `faturamento.service` (Router → Service → Repository, sem
pular camadas), reusando os services dos demais módulos:
`comercial_service.mark_sale_cancelled`, `fin_service.cancelar_contas_receber`,
`fin_service.registrar_movimento`, `estoque_service.registrar_entrada/
registrar_saida/obter_ou_criar_item_avariado`.

> **Atualização (Demanda 7):** o Comercial passou a ter a ação **"Cancelar venda"**
> (`POST /api/comercial/vendas/{id}/cancelar` → `comercial_service.cancel_sale`),
> que é o ponto de entrada pelo lado da venda. Ela **não** duplica o estorno: localiza
> uma NF `venda` do `sale_id` (via `faturamento_service.get_invoices_by_sale`) e chama
> `cancelar_fatura` **uma vez** — o motor `_cancelar_nf_venda` continua sendo o único
> que estorna estoque/financeiro e cancela a cadeia. Além disso, como
> `comercial_service.update_status` passou a **recusar** a transição para `cancelada`
> (o caminho "pelado" sem estorno foi fechado), o motor grava o status final da venda
> pelo setter interno **`comercial_service.mark_sale_cancelled`** (e não mais por
> `update_status`).

> **Nota sobre transação:** seguindo o padrão do projeto (cada operação de
> service/repo faz `commit` próprio — ver `comercial.create_sale`), o
> cancelamento valida tudo no início (NF existe, não está cancelada, venda/ordem
> resolvidas) e só então executa os estornos. A guarda `status/cancelled_at`
> impede dupla execução no caso normal de re-cancelamento.

### Resumo dos sinais de estorno

| NF | Movimento de estorno | Estoque |
|----|----------------------|---------|
| venda (recebido > 0) | `SAIDA/AJUSTE` = recebido | `entrada` (volta), `unit_cost=0` |
| recebimento | `ENTRADA/AJUSTE` = **valor pago** (só se pago); contas em aberto canceladas | `saida` das aceitas, `unit_cost=0` |
| transporte (compra) | `ENTRADA/AJUSTE` = **valor pago** (só se pago); contas em aberto canceladas | — |
| transporte (venda) | `SAIDA/AJUSTE` = frete | — |
| servico | `ENTRADA/AJUSTE` = **valor pago** (só se pago); conta em aberto cancelada | — |
| devolucao | — | `entrada` no item AVARIADO |

> **Nota (compra, 1.1):** o estorno financeiro é por **ordem** (idempotente via
> `existe_estorno_ordem`) e reflete apenas o que já foi efetivamente pago —
> coerente com "o dinheiro só se move no pagamento". Cancelar recebimento +
> transporte da mesma ordem **não** duplica o estorno.

## Database Schema

### `invoices`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `number` | VARCHAR(32) unique (INV-0001) |
| `client_id` | UUID FK → clients (nullable — `NULL` em NFs de recebimento/devolução geradas por Compras) |
| `sale_id` | UUID FK → sales (nullable) |
| `issue_date` | DATE |
| `due_date` | DATE (nullable) |
| `total_amount` | NUMERIC(12,2) |
| `status` | enum (`emitida` / `paga` / `cancelada`) |
| `notes` | TEXT (nullable) |
| `invoice_type` | VARCHAR(50) default `'venda'` — discriminador: `venda` / `recebimento` / `devolucao` / `transporte` |
| `installment_number` | INT (nullable) — 1-based |
| `installment_total` | INT (nullable) |
| `parent_invoice_id` | UUID FK → invoices ON DELETE SET NULL (aponta para a 1ª fatura da cadeia parcelada) |
| `cancelled_at` | TIMESTAMPTZ (nullable) — carimbo do cancelamento (Demanda 1; distinto de `deleted_at`) |
| `cancellation_reason` | TEXT (nullable) — motivo informado no `POST /cancelar` |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

Índices relevantes: `idx_invoices_invoice_type` (despacho do cancelamento por tipo), `idx_invoices_issue_date` (ordenação default da lista).

### `invoice_items`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `invoice_id` | UUID FK → invoices (cascade delete) |
| `description` | VARCHAR(500) |
| `quantity` | NUMERIC(12,3) |
| `unit_price` | NUMERIC(12,2) |
| `subtotal` | NUMERIC(12,2) — calculado na criação |
| `created_at`, `updated_at` | TIMESTAMPTZ |

## Nota sobre Client

`Invoice` não possui relationship `client` no model. O `client_name` é resolvido via query manual em `service._get_client_name()` a cada serialização. Quando `client_id IS NULL` (NF de recebimento/devolução), a função retorna `""` para preservar a forma do payload.
