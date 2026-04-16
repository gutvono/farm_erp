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
| `GET` | `/api/comercial/clientes` | Lista clientes (filtros: `is_delinquent`, paginação) |
| `POST` | `/api/comercial/clientes` | Cria cliente |
| `GET` | `/api/comercial/clientes/{id}` | Detalhe do cliente |
| `PUT` | `/api/comercial/clientes/{id}` | Atualiza dados do cliente |
| `PUT` | `/api/comercial/clientes/{id}/inadimplente` | Marca cliente como inadimplente |
| `PUT` | `/api/comercial/clientes/{id}/reverter-inadimplencia` | Reverte inadimplência manualmente |
| `DELETE` | `/api/comercial/clientes/{id}` | Soft delete do cliente |

### Vendas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/comercial/vendas` | Lista vendas (filtros: `status`, `client_id`, paginação) |
| `POST` | `/api/comercial/vendas` | Cria venda com itens (dispara integrações) |
| `GET` | `/api/comercial/vendas/{id}` | Detalhe da venda com itens |
| `PATCH` | `/api/comercial/vendas/{id}/status` | Atualiza status da venda |
| `DELETE` | `/api/comercial/vendas/{id}` | Soft delete (somente se `realizada`) |

## Schemas

### ClientCreate / ClientUpdate
```json
{
  "name": "Cooperativa Café do Vale",
  "document": "12.345.678/0001-99",
  "email": "contato@cafedovale.com",
  "phone": "(11) 99999-9999",
  "address": "Rua X, 100",
  "notes": "opcional"
}
```

### ClientOut — campos principais
- `id`, `name`, `document`, `email`, `phone`, `address`, `notes`
- `is_delinquent` (bool) — campo real no model (`is_delinquent`, não `is_defaulter`)

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
  ]
}
```

- Mínimo de 1 item
- `total_amount` calculado automaticamente (soma dos subtotais)
- `subtotal` por item = `quantity × unit_price`
- `sold_at` opcional (default: now)
- Status inicial sempre `realizada`

### SaleStatusUpdate
```json
{ "status": "entregue" }
```

### SaleOut — campos principais
- Inclui `client_name` e `items` com `stock_item_name` e `subtotal`

## Regras de Negócio

### Status e Transições

```
realizada → entregue
realizada → cancelada (status final)
entregue  → cancelada (status final)
```

- `cancelada` é status final — tentativa de alterar retorna `400`
- `entregue` não pode retornar para `realizada`
- Soft delete permitido apenas em vendas com status `realizada`
- Ao entregar: `delivered_at` é preenchido automaticamente com `datetime.now()`

### Ao Criar uma Venda

Executado em sequência no `service.create_sale()`:

1. **Validação de disponibilidade** — para cada item:
   ```python
   estoque_service.verificar_disponibilidade(db, stock_item_id, quantity)
   # Se insuficiente: HTTPException 400 com nome do item e quantidade disponível
   ```

2. **Criação da venda** — `repository.create_sale()` com status `realizada`

3. **Baixa no Estoque** — para cada item:
   ```python
   estoque_service.registrar_saida(
       db,
       stock_item_id=item.stock_item_id,
       quantity=item.quantity,
       description=f"Venda #{sale.id}",
       source_module="comercial",
       reference_id=sale.id,
   )
   ```

4. **Fatura** (placeholder — Faturamento não implementado):
   ```python
   faturamento_service.criar_fatura(db, sale_id=sale.id, client_id=..., ...)
   ```

5. **Conta a Receber** (vencimento em 30 dias):
   ```python
   fin_service.criar_conta_receber(
       db,
       client_id=sale.client_id,
       description=f"Venda — {client.name}",
       amount=sale.total_amount,
       due_date=date.today() + timedelta(days=30),
       source_module="comercial",
       reference_id=sale.id,
   )
   ```

6. **Movimentação Financeira** (entrada/venda):
   ```python
   fin_service.registrar_movimento(
       db,
       movement_type=MovementType.ENTRADA,
       category=FinancialCategory.VENDA,
       amount=sale.total_amount,
       description=f"Venda — {client.name}",
       source_module="comercial",
       reference_id=sale.id,
   )
   ```

### Inadimplência de Clientes
- Controlada pelo campo `is_delinquent` (Boolean) em `Client`
- Pode ser marcada manualmente via `PUT /clientes/{id}/inadimplente`
- Pode ser revertida manualmente via `PUT /clientes/{id}/reverter-inadimplencia`
- O módulo Financeiro também atualiza `is_delinquent` ao marcar conta a receber como inadimplente (`mark_as_defaulter`)

## Database Schema

### `clients`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) |
| `document` | VARCHAR(32) (nullable) |
| `email` | VARCHAR(255) (nullable) |
| `phone` | VARCHAR(32) (nullable) |
| `address` | VARCHAR(500) (nullable) |
| `is_delinquent` | BOOLEAN default false |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `sales`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `client_id` | UUID FK → clients |
| `status` | enum (`realizada` / `entregue` / `cancelada`) |
| `total_amount` | NUMERIC(12,2) |
| `sold_at` | TIMESTAMPTZ |
| `delivered_at` | TIMESTAMPTZ (nullable) |
| `notes` | TEXT (nullable) |
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

## Campos Importantes vs. Spec

| Spec | Model real |
|------|-----------|
| `is_defaulter` | `is_delinquent` |
| `total_price` (item) | `subtotal` |

## Nota sobre SaleItem

`SaleItem` não possui relationship `stock_item` no model. O `repository._load_relations()` executa uma query manual por todos os `StockItem` IDs dos itens e injeta via `item.__dict__["stock_item"]`, sem alterar o model.
