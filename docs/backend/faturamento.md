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
| `GET` | `/api/faturamento/faturas` | Lista faturas (filtros: `status`, `client_id`, `order_id`, paginação) |
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
- Inclui `client_name`, `number`, `issue_date`, `due_date`, itens com `subtotal`

## Regras de Negócio

### Status e Transições

```
emitida → paga     (status final)
emitida → cancelada (status final)
```

- `paga` e `cancelada` são **status finais** — tentativa de alterar retorna `400`
- Soft delete apenas em faturas com status `emitida`

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

## Função Pública — `criar_fatura` (venda à vista)

Chamada pelo Comercial quando `installments <= 1`. **Fluxo inalterado** em relação à versão anterior, exceto pela atribuição explícita `invoice_type="venda"`.

```python
from app.modules.faturamento import service as fat_service

fat_service.criar_fatura(
    db,
    sale_id=sale.id,
    client_id=sale.client_id,
    items=sale.items,           # SaleItem ORM objects
    total_amount=sale.total_amount,
    source_module="comercial",
)
```

Internamente:
1. Resolve nomes dos itens via `StockItem` (buscado por `stock_item_id`)
2. Cria `Invoice` + `InvoiceItem` com `number` auto-gerado, `issue_date = today()`, `due_date = today + 30d`, `invoice_type="venda"`
3. Registra movimentação financeira `ENTRADA/VENDA, amount=0` — rastreabilidade de emissão

## Função Pública — `criar_faturas_parceladas` (venda parcelada)

Chamada pelo Comercial quando `installments >= 2`. Gera **uma fatura por parcela**.

```python
fat_service.criar_faturas_parceladas(
    db,
    sale_id=sale.id,
    client_id=sale.client_id,
    items=sale.items,
    total_amount=sale.total_amount,
    installments=3,
    first_due_date=date(2026, 6, 1),
    installment_interval_days=30,
)
```

Regras:
- `total_amount` é dividido igualmente pelo número de parcelas. A **última parcela** absorve o resíduo de centavos para garantir que a soma feche exatamente.
- Os vencimentos seguem `first_due_date + n * installment_interval_days`.
- Cada fatura recebe `installment_number` (1-based) e `installment_total`.
- `parent_invoice_id` aponta para a **primeira** fatura da cadeia (a primeira tem `parent_invoice_id = None`).
- Todas com `invoice_type="venda"`.
- Para cada fatura, registra um `financial_movement` `ENTRADA/VENDA, amount=0` para rastreabilidade.

## Helper interno — `_calcular_vencimentos(first_due_date, installments, interval_days)`
Retorna uma lista de `date` com os vencimentos sucessivos. Usado por `criar_faturas_parceladas` e potencialmente por outros fluxos que sigam o mesmo critério.

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
| **`venda`** | Ponta a ponta (D4): (a) devolve cada item da venda ao estoque via `estoque_service.registrar_entrada` com **`unit_cost=0`** (entrada gera ajuste R$0, **sem** movimento de "compra" e **sem** alterar o CMP — o lado financeiro fica nas contas a receber); `reference_id` da movimentação = `sale.id`. (b) `sales.status = cancelada` (via `comercial_service.update_status`). (c) **Todas** as `accounts_receivable` da venda → `cancelada`; para `amount_received > 0`, gera estorno `SAIDA/AJUSTE` com a descrição `"Estorno cancelamento NF {number}"`. (d) **Toda a cadeia** de NFs com o mesmo `sale_id` (parcelas + NF de transporte da venda) é marcada `cancelada`; a NF de transporte da venda tem o frete estornado (`SAIDA/AJUSTE`). Cancelar **qualquer** parcela cancela a venda inteira. |
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
`comercial_service.update_status`, `fin_service.cancelar_contas_receber`
(novo), `fin_service.registrar_movimento`, `estoque_service.registrar_entrada/
registrar_saida/obter_ou_criar_item_avariado`. Não foi criado um "cancelar
venda" no Comercial — não existia; a orquestração ponta a ponta mora no
Faturamento, apenas mudando o status da venda via service.

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
