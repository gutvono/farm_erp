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

## Função Pública — `criar_fatura`

Chamada pelo Comercial ao criar uma venda:

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
2. Cria `Invoice` + `InvoiceItem` com `number` auto-gerado e `issue_date = today()`
3. Registra movimentação financeira `ENTRADA/VENDA, amount=0` — rastreabilidade de emissão

## Fatura Manual vs. Automática

| | Automática (via Comercial) | Manual |
|--|---|---|
| Origem | `criar_fatura()` chamada por `comercial.service` | `POST /api/faturamento/faturas` |
| `sale_id` | ID da venda | `null` |
| Conta a Receber | Criada pelo Comercial | Criada pelo Faturamento |
| Itens | Gerados a partir dos `SaleItem` | Informados pelo usuário |

## Database Schema

### `invoices`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `number` | VARCHAR(32) unique (INV-0001) |
| `client_id` | UUID FK → clients |
| `sale_id` | UUID FK → sales (nullable) |
| `issue_date` | DATE |
| `due_date` | DATE (nullable) |
| `total_amount` | NUMERIC(12,2) |
| `status` | enum (`emitida` / `paga` / `cancelada`) |
| `notes` | TEXT (nullable) |
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

`Invoice` não possui relationship `client` no model. O `client_name` é resolvido via query manual em `service._get_client_name()` a cada serialização.
