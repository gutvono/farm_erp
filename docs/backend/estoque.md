# Backend Module: Estoque

## Overview

Módulo responsável pela gestão de itens de estoque, movimentações (append-only) e inventário geral.

Toda movimentação de estoque gera automaticamente uma entrada na tabela `financial_movements` via `registrar_movimento()` do módulo Financeiro. Isso garante rastreabilidade financeira de 100% das operações.

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Itens de Estoque

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/estoque/itens` | Lista itens (filtros: `category`, `below_minimum`) |
| `POST` | `/api/estoque/itens` | Cria novo item |
| `GET` | `/api/estoque/itens/{id}` | Detalhe do item |
| `PUT` | `/api/estoque/itens/{id}` | Atualiza item |
| `DELETE` | `/api/estoque/itens/{id}` | Soft delete do item |

### Movimentações

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/estoque/movimentacoes` | Lista (filtros: `stock_item_id`, `movement_type`, `source_module`; ordenação: `order_by`, `order_dir`) |
| `POST` | `/api/estoque/movimentacoes` | Registra movimentação manual |
| `GET` | `/api/estoque/movimentacoes/{id}` | Detalhe da movimentação |

### Inventário

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/estoque/inventario` | Todos os itens com `quantity_on_hand`, `unit_cost` e `total_value`; grand total |

## Schemas

### StockItemCreate
```json
{
  "sku": "CAFE-ESP-001",
  "name": "Café Especial",
  "category": "cafe",
  "unit": "saca",
  "minimum_stock": 10,
  "unit_cost": 450.00,
  "description": "opcional"
}
```

### StockItemOut (campos extras em relação ao create)
- `id`, `quantity_on_hand`, `created_at`, `updated_at`
- `is_below_minimum` (bool calculado: `quantity_on_hand < minimum_stock`)

### StockMovementCreate
```json
{
  "stock_item_id": "uuid",
  "movement_type": "entrada" | "saida",
  "quantity": 5,
  "unit_cost": 450.00,
  "description": "Compra fornecedor X",
  "source_module": "manual",
  "reference_id": "uuid (opcional)",
  "occurred_at": "2026-04-15T10:00:00Z (opcional)"
}
```

### StockMovementOut (campos extras)
- `stock_item_name` (string do item relacionado)
- `total_value` = `quantity × unit_cost`

### InventoryOut
```json
{
  "items": [
    {
      "id": "uuid",
      "sku": "CAFE-ESP-001",
      "name": "Café Especial",
      "category": "cafe",
      "unit": "saca",
      "quantity_on_hand": 42,
      "unit_cost": 450.00,
      "total_value": 18900.00,
      "is_below_minimum": false
    }
  ],
  "total_value": 18900.00,
  "generated_at": "2026-04-15T10:00:00Z"
}
```

## Funções Públicas (uso por outros módulos)

Importar de `app.modules.estoque.service`:

```python
from app.modules.estoque import service as estoque_service

# Compras / PCP: registrar entrada
estoque_service.registrar_entrada(
    db,
    stock_item_id=item.id,
    quantity=Decimal("10"),
    unit_cost=Decimal("450.00"),
    description="Entrada compra #0042",
    source_module="compras",
    reference_id=purchase_order.id,
)

# Comercial / PCP: registrar saída
estoque_service.registrar_saida(
    db,
    stock_item_id=item.id,
    quantity=Decimal("5"),
    description="Venda #0010",
    source_module="comercial",
    reference_id=sale.id,
)

# Comercial: verificar disponibilidade antes de confirmar venda
disponivel = estoque_service.verificar_disponibilidade(
    db,
    stock_item_id=item.id,
    quantity=Decimal("5"),
)
if not disponivel:
    raise HTTPException(400, "Estoque insuficiente")
```

## Regras de Negócio

### Nunca estoque negativo
- `repository.create_movement()` lança `ValueError` se `movimento_type == saida` e `quantity > quantity_on_hand`
- O service converte `ValueError` em `HTTPException 400`

### Movimentações são append-only
- `stock_movements` não tem `deleted_at` — nunca são editadas ou removidas
- `quantity_on_hand` em `stock_items` é o campo de leitura rápida (mantido sincronizado)

### Integração com Financeiro
- `entrada` com `unit_cost > 0` → movimento `saida/compra` no Financeiro com `amount = quantity × unit_cost`
- `entrada` com `unit_cost == 0` OU `saida` → movimento `saida/ajuste` no Financeiro com `amount = 0`
- Cadastro de item → movimento `saida/ajuste` no Financeiro com `amount = 0`

### Alerta de estoque mínimo
- Após cada movimentação, se `quantity_on_hand < minimum_stock` → chama `dashboard.service.criar_notificacao()`
- Atualmente é placeholder (Dashboard não implementado); será funcional ao implementar o módulo Dashboard

### SKU
- Campo obrigatório e único
- Validado na criação (409 se duplicado)

### Custo unitário
- Na entrada, se `unit_cost > 0`, o `unit_cost` do item é atualizado para o novo valor

## Database Schema

### `stock_items`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `sku` | VARCHAR(64) unique |
| `name` | VARCHAR(255) |
| `category` | enum (`cafe` / `insumo` / `veiculo` / `equipamento` / `outro`) |
| `unit` | enum (`saca` / `litro` / `kg` / `unidade`) |
| `minimum_stock` | NUMERIC(12,3) |
| `unit_cost` | NUMERIC(12,2) |
| `quantity_on_hand` | NUMERIC(12,3) |
| `description` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `stock_movements` (append-only)
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `stock_item_id` | UUID FK → stock_items |
| `movement_type` | enum (`entrada` / `saida`) |
| `quantity` | NUMERIC(12,3) |
| `unit_cost` | NUMERIC(12,2) |
| `total_value` | NUMERIC(12,2) |
| `description` | VARCHAR(500) |
| `source_module` | VARCHAR(50) |
| `reference_id` | UUID (nullable) |
| `occurred_at` | TIMESTAMPTZ |
| `created_at`, `updated_at` | TIMESTAMPTZ |

## Campos Importantes vs. Spec

| Spec | Model real |
|------|-----------|
| `minimum_quantity` | `minimum_stock` |
| `current_quantity` | `quantity_on_hand` |
| `type` (movimento) | `movement_type` |
| `reason` (movimento) | `description` |
