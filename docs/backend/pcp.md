# Backend Module: PCP (Planejamento e Controle de Produção)

## Overview

Módulo responsável pela gestão de talhões, atividades de campo e ordens de produção de safra. Toda safra consome insumos do Estoque, produz café (distribuído entre três qualidades) e registra movimentações no Financeiro, garantindo rastreabilidade completa do ciclo produtivo.

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Talhões

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/talhoes` | Lista talhões (paginação) |
| `POST` | `/api/pcp/talhoes` | Cria talhão |
| `GET` | `/api/pcp/talhoes/{id}` | Detalhe do talhão |
| `PUT` | `/api/pcp/talhoes/{id}` | Atualiza talhão |
| `DELETE` | `/api/pcp/talhoes/{id}` | Soft delete |

### Atividades

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/atividades` | Lista atividades (filtro: `plot_id`) |
| `POST` | `/api/pcp/atividades` | Registra atividade |

### Ordens de Produção

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/ordens` | Lista ordens (filtro: `status`) |
| `POST` | `/api/pcp/ordens` | Cria ordem planejada com insumos |
| `GET` | `/api/pcp/ordens/{id}` | Detalhe com inputs |
| `POST` | `/api/pcp/ordens/{id}/produzir` | Executa safra (consome insumos, produz café, retorna `ProductionResult`) |
| `DELETE` | `/api/pcp/ordens/{id}` | Soft delete (apenas `planejada`) |

## Schemas

### PlotCreate
```json
{
  "name": "Talhão C - Catuaí Amarelo",
  "location": "Setor Leste, 8 ha",
  "variety": "Arábica Catuaí Amarelo",
  "capacity_sacas": 80.000,
  "notes": "opcional"
}
```

### PlotActivityCreate
```json
{
  "plot_id": "uuid",
  "activity_type": "plantio | adubacao | poda | colheita | irrigacao | outra",
  "activity_date": "2026-04-15",
  "labor_type": "interna | externa",
  "cost": 0.00,
  "details": "opcional"
}
```

### ProductionOrderCreate
```json
{
  "plot_id": "uuid",
  "planned_date": "2026-05-20",
  "notes": "opcional",
  "inputs": [
    { "stock_item_id": "uuid", "quantity": 300.000 },
    { "stock_item_id": "uuid", "quantity": 100.000 }
  ]
}
```

- Status inicial: `planejada`
- `unit_cost` e `subtotal` dos inputs são resolvidos a partir do `StockItem.unit_cost` no momento da criação
- `total_cost` = soma dos subtotais dos inputs

### ProductionOrderOut
```json
{
  "id": "uuid",
  "plot_id": "uuid",
  "plot_name": "Talhão A - Bourbon Amarelo",
  "planned_date": "2026-05-20",
  "executed_at": null,
  "total_sacas": 0.000,
  "especial_sacas": 0.000,
  "superior_sacas": 0.000,
  "tradicional_sacas": 0.000,
  "total_cost": 8500.00,
  "status": "planejada",
  "notes": null,
  "inputs": [
    {
      "id": "uuid",
      "stock_item_id": "uuid",
      "stock_item_name": "Fertilizante NPK 20-05-20",
      "unit": "kg",
      "quantity": 300.000,
      "unit_cost": 12.00,
      "subtotal": 3600.00
    }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

### ProductionResult
```json
{
  "order_id": "uuid",
  "total_sacas": 104.123,
  "especial_sacas": 21.456,
  "superior_sacas": 52.321,
  "tradicional_sacas": 30.346,
  "inputs_consumed": [ ... ],
  "items_below_minimum": ["Fungicida de contato"],
  "executed_at": "2026-04-16T10:00:00Z"
}
```

## Algoritmo de Simulação de Safra (`produzir_safra`)

O método central do módulo. Executa instantaneamente as seguintes etapas, na ordem:

### 1. Validação de status
- A ordem deve estar em `planejada` ou `em_producao`.
- Se já estiver `concluida` ou `cancelada` → `HTTPException 400 "Ordem já finalizada"`.

### 2. Validação de disponibilidade
Para cada `ProductionInput`:
```python
estoque_service.verificar_disponibilidade(db, stock_item_id, quantity)
```
Se qualquer insumo não tiver estoque suficiente →
`HTTPException 400 "Estoque insuficiente para: {name}. Disponível: {quantity_on_hand} {unit}"`.

### 3. Consumo dos insumos
Para cada input, chama `estoque_service.registrar_saida` com `source_module="pcp"`. Isso:
- Cria movimentação no Estoque
- Gera `saida/ajuste` no Financeiro (R$0,00) automaticamente via cadeia Estoque→Financeiro
- Dispara notificação de estoque baixo se `quantity_on_hand < minimum_stock`

Ao final do consumo, registra um movimento agregado:
```python
fin_service.registrar_movimento(
    movement_type=SAIDA,
    category=PRODUCAO,
    amount=0,
    description=f"Consumo de insumos — Safra #{order_id}",
    source_module="pcp",
    reference_id=order_id,
)
```

### 4. Simulação de resultado
- **Base:** `plot.capacity_sacas`
- **Variação total:** `random.uniform(0.90, 1.10)` → total = base × variação
- **Distribuição entre qualidades:**
  - Especial: 15%–25% aleatório
  - Superior: 45%–55% aleatório
  - Tradicional: restante (`total - especial - superior`)
- Todos os valores arredondados para 3 casas decimais
- Garante que `especial + superior + tradicional = total`

Exemplo para talhão com capacity_sacas=100:
- Total aleatório: 103.456 sacas
- Especial: ~20.691 (≈20%)
- Superior: ~52.243 (≈50%)
- Tradicional: 30.522 (resto)

### 5. Entrada no estoque (por qualidade)
Para cada qualidade (`especial`, `superior`, `tradicional`), busca em `stock_items` onde `category='cafe'` um item cujo nome contenha a palavra (case-insensitive). Se encontrado, registra entrada:

```python
estoque_service.registrar_entrada(
    stock_item_id=cafe_item.id,
    quantity=quantity_produzida,
    unit_cost=0,
    description=f"Produção de safra #{order_id} — {cafe_item.name}",
    source_module="pcp",
    reference_id=order_id,
)
```

Em seguida, registra movimento agregado:
```python
fin_service.registrar_movimento(
    movement_type=ENTRADA,
    category=PRODUCAO,
    amount=0,
    description=f"Café produzido — Safra #{order_id}: {total} sacas",
    source_module="pcp",
    reference_id=order_id,
)
```

### 6. Atualização da ordem
- `status = concluida`
- `executed_at = datetime.utcnow()`
- `total_sacas`, `especial_sacas`, `superior_sacas`, `tradicional_sacas` atualizados
- **Reload obrigatório** via `repository.get_order()` — múltiplos commits sequenciais expiram o `__dict__` dos objetos em memória.

### 7. Retorno
`ProductionResult` contendo:
- `order_id`, `total_sacas`, `especial_sacas`, `superior_sacas`, `tradicional_sacas`
- `inputs_consumed`: lista detalhada dos insumos consumidos
- `items_below_minimum`: nomes dos insumos que ficaram abaixo do mínimo após o consumo
- `executed_at`

## Registro de Atividades (`add_activity`)

1. Valida que o talhão existe
2. Cria registro em `plot_activities`
3. Registra movimentação financeira:
   - `movement_type=SAIDA`
   - `category=PRODUCAO`
   - `amount=activity.cost` (R$0,00 se mão de obra interna)
   - `description=f"Atividade no talhão {plot.name}: {activity_type}"`
   - `source_module="pcp"`, `reference_id=plot.id`

## Regras de Negócio

### Ordens de Produção
- Status finais: `concluida` e `cancelada` — tentativas de nova execução/alteração retornam 400
- Soft delete apenas em ordens `planejada`
- Inputs imutáveis após criação (não há endpoint de update de inputs)
- `unit_cost` de cada input é resolvido no momento da criação a partir do `StockItem.unit_cost` corrente
- `total_cost` da ordem = soma dos subtotais dos inputs planejados

### Talhões
- `capacity_sacas` ≥ 0 (obrigatório)
- Soft delete disponível via `DELETE /talhoes/{id}`

### Atividades
- Sempre geram movimento financeiro (mesmo que R$0,00)
- Soft delete disponível (via coluna `deleted_at`); não há workflow de status

## Integrações

| Destino | Chamada | Efeito |
|---------|---------|--------|
| Estoque | `verificar_disponibilidade` | Validação pré-produção |
| Estoque | `registrar_saida` | Consumo de insumos |
| Estoque | `registrar_entrada` | Entrada de café produzido |
| Financeiro | `registrar_movimento` | Rastreabilidade: atividade, consumo agregado, produção agregada |

## Database Schema

### `plots`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) |
| `location` | VARCHAR(255) nullable |
| `variety` | VARCHAR(100) |
| `capacity_sacas` | NUMERIC(12,3) |
| `notes` | TEXT nullable |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `production_orders`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `plot_id` | UUID FK → plots |
| `planned_date` | DATE nullable |
| `executed_at` | TIMESTAMPTZ nullable |
| `total_sacas`, `especial_sacas`, `superior_sacas`, `tradicional_sacas` | NUMERIC(12,3) |
| `total_cost` | NUMERIC(12,2) |
| `status` | enum (`planejada` / `em_producao` / `concluida` / `cancelada`) |
| `notes` | TEXT nullable |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `production_inputs`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `production_order_id` | UUID FK → production_orders (cascade delete) |
| `stock_item_id` | UUID FK → stock_items |
| `quantity` | NUMERIC(12,3) |
| `unit_cost` | NUMERIC(12,2) |
| `subtotal` | NUMERIC(12,2) |
| `created_at`, `updated_at` | TIMESTAMPTZ |

### `plot_activities`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `plot_id` | UUID FK → plots |
| `activity_type` | enum (`plantio` / `adubacao` / `poda` / `colheita` / `irrigacao` / `outra`) |
| `activity_date` | DATE |
| `labor_type` | enum (`interna` / `externa`) |
| `cost` | NUMERIC(12,2) |
| `details` | TEXT nullable |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

## Migrations

Migração `0002_pcp_planejada_status` (arquivo `alembic/versions/20260416_0002_pcp_planejada_status.py`):

1. Adiciona os valores `planejada` e `em_producao` ao enum `production_order_status` (via `ALTER TYPE ADD VALUE` em autocommit block)
2. Torna `production_orders.executed_at` nullable
3. Adiciona coluna `planned_date` (DATE nullable) em `production_orders`

## Observações

- Mensagens de erro e resposta em português
- Todas as respostas usam `SuccessResponse` do `app.shared.responses`
- Validação de entrada via Pydantic (`schemas.py`)
- Ordens retornam sempre com `inputs` populados (via `repository` que força o carregamento)
- A detecção de qualidade (especial/superior/tradicional) usa match por substring case-insensitive no `StockItem.name` dentro da categoria `cafe`
