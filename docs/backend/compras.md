# Backend Module: Compras

## Overview

Módulo responsável pelo cadastro de fornecedores e gestão de ordens de compra. Ao concluir uma ordem, integra automaticamente com Estoque (entrada de itens) e Financeiro (conta a pagar + movimentação).

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Fornecedores

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/compras/fornecedores` | Lista fornecedores (paginação: skip, limit) |
| `POST` | `/api/compras/fornecedores` | Cria fornecedor |
| `GET` | `/api/compras/fornecedores/{id}` | Detalhe do fornecedor |
| `PUT` | `/api/compras/fornecedores/{id}` | Atualiza fornecedor |
| `DELETE` | `/api/compras/fornecedores/{id}` | Soft delete do fornecedor |

### Ordens de Compra

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/compras/ordens` | Lista ordens (filtros: `status`, `supplier_id`, paginação) |
| `POST` | `/api/compras/ordens` | Cria ordem com itens |
| `GET` | `/api/compras/ordens/{id}` | Detalhe da ordem com itens |
| `PATCH` | `/api/compras/ordens/{id}/status` | Atualiza status da ordem |
| `DELETE` | `/api/compras/ordens/{id}` | Soft delete (somente se `em_andamento`) |

## Schemas

### SupplierCreate / SupplierUpdate
```json
{
  "name": "Fornecedor ABC",
  "document": "12.345.678/0001-99",
  "email": "contato@abc.com",
  "phone": "(11) 99999-9999",
  "address": "Rua X, 100",
  "notes": "opcional"
}
```

### PurchaseOrderCreate
```json
{
  "supplier_id": "uuid",
  "notes": "opcional",
  "ordered_at": "2026-04-15T10:00:00Z",
  "items": [
    {
      "stock_item_id": "uuid",
      "quantity": 10,
      "unit_price": 450.00,
      "description": "opcional"
    }
  ]
}
```

- Mínimo de 1 item
- `total_amount` calculado automaticamente (soma dos subtotais)
- `subtotal` por item = `quantity × unit_price`
- `ordered_at` opcional (default: now)

### PurchaseOrderStatusUpdate
```json
{ "status": "concluida" }
```

### PurchaseOrderOut
- Inclui `supplier_name` e `items` com `stock_item_name` e `subtotal`

## Regras de Negócio

### Status e Transições

```
em_andamento → concluida (status final)
em_andamento → cancelada (status final)
```

- `concluida` e `cancelada` são **status finais** — alteração retorna `400`
- Soft delete permitido apenas em ordens com status `em_andamento`

### Ao Concluir uma Ordem (`status = concluida`)

Executado em sequência no `service.update_status()`:

1. **Entrada no Estoque** — para cada item da ordem:
   ```python
   estoque_service.registrar_entrada(
       db,
       stock_item_id=item.stock_item_id,
       quantity=item.quantity,
       unit_cost=item.unit_price,
       description=f"Recebimento da ordem de compra #{order.id}",
       source_module="compras",
       reference_id=order.id,
   )
   ```

2. **Conta a Pagar** — vencimento em 30 dias:
   ```python
   fin_service.criar_conta_pagar(
       db,
       description=f"Ordem de compra — {supplier.name}",
       amount=order.total_amount,
       due_date=date.today() + timedelta(days=30),
       supplier_id=order.supplier_id,
       source_module="compras",
       reference_id=order.id,
   )
   ```

3. **Movimentação Financeira** (R$0,00 — rastreabilidade interna):
   ```python
   fin_service.registrar_movimento(
       db,
       movement_type=MovementType.SAIDA,
       category=FinancialCategory.COMPRA,
       amount=Decimal("0"),
       description=f"Ordem de compra concluída — {supplier.name}",
       source_module="compras",
       reference_id=order.id,
   )
   ```

### Ao Cancelar (`status = cancelada`)
- Nenhum efeito colateral — apenas atualiza o status
- Estoque e financeiro **não** são afetados

### Validações na Criação
- `supplier_id` deve existir e não estar deletado (404 se não encontrado)
- Todos os `stock_item_id` nos itens devem existir (404 identificando o item ausente)

## Database Schema

### `suppliers`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) |
| `document` | VARCHAR(32) (nullable) |
| `email` | VARCHAR(255) (nullable) |
| `phone` | VARCHAR(32) (nullable) |
| `address` | VARCHAR(500) (nullable) |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `purchase_orders`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `supplier_id` | UUID FK → suppliers |
| `status` | enum (`em_andamento` / `concluida` / `cancelada`) |
| `total_amount` | NUMERIC(12,2) |
| `ordered_at` | TIMESTAMPTZ |
| `received_at` | TIMESTAMPTZ (nullable — setado ao concluir) |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `purchase_order_items`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `purchase_order_id` | UUID FK → purchase_orders (cascade delete) |
| `stock_item_id` | UUID FK → stock_items |
| `description` | VARCHAR(255) (nullable) |
| `quantity` | NUMERIC(12,3) |
| `unit_price` | NUMERIC(12,2) |
| `subtotal` | NUMERIC(12,2) — calculado na criação |
| `created_at`, `updated_at` | TIMESTAMPTZ |
