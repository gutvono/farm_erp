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
| `GET` | `/api/faturamento/faturas` | Lista faturas (filtros: `status`, `client_id`, paginação) |
| `POST` | `/api/faturamento/faturas` | Cria fatura manual |
| `GET` | `/api/faturamento/faturas/{id}` | Detalhe com itens |
| `PATCH` | `/api/faturamento/faturas/{id}/status` | Atualiza status |
| `DELETE` | `/api/faturamento/faturas/{id}` | Soft delete (somente se `emitida`) |

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

Chamadas por `compras.complete_order_after_payment` quando a conta a pagar de uma ordem é quitada. Diferentemente da fatura comercial, essas NFs representam o **fluxo fiscal interno** de um recebimento de fornecedor e ficam com `client_id = NULL`. Elas são identificadas no campo `notes` por prefixo + `order_id=<uuid>`.

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

## Função Pública — `criar_nota_transporte` (frete)

Emite uma NF de transporte representando o custo de frete (`shipping_cost`) de uma venda ou de uma ordem de compra de produto. Sempre **à vista** (1 item, `quantity=1`, `unit_price=shipping_cost`), mesmo quando a venda/ordem é parcelada.

### `criar_nota_transporte(db, shipping_cost, sale_id=None, order_id=None, client_id=None) → Invoice`
- `invoice_type`: `"transporte"`
- 1 item fixo: `description="Custo de transporte — <ref>"`, `quantity=1`, `unit_price=shipping_cost`, `subtotal=shipping_cost`
- `total_amount`: `shipping_cost`
- `due_date`: `date.today()`
- **Para vendas** (chamada pelo Comercial na criação da venda): `sale_id=<venda.id>`, `client_id=<venda.client_id>`, `movement_type=ENTRADA`, `category=VENDA`
- **Para compras** (chamada por `complete_order_after_payment`): `order_id=<ordem.id>`, `client_id=NULL`, `movement_type=SAIDA`, `category=COMPRA`
- `notes`: `"[NF-TRANSPORTE] sale_id=<uuid> — Custo de transporte — Venda #<uuid>"` ou `"[NF-TRANSPORTE] order_id=<uuid> — Custo de transporte — Ordem de compra #<uuid>"`
- Registra `financial_movement` `amount=0` para rastreabilidade.

> Prefixo: `_NF_TRANSPORTE_PREFIX = "[NF-TRANSPORTE]"` no `service.py`. A NF de transporte só é emitida quando `shipping_cost > 0`.

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
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

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
