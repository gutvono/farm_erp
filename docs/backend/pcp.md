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
| `POST` | `/api/pcp/ordens` | Cria ordem planejada com insumos, funcionários e serviços externos; gera `order_number` e calcula `estimated_cost` |
| `GET` | `/api/pcp/ordens/funcionarios-em-producao` | Lista UUIDs de funcionários vinculados a ordens ativas (para bloqueio no frontend). **Deve preceder `/ordens/{id}` no router** |
| `GET` | `/api/pcp/ordens/{id}` | Detalhe com inputs, colheitas, funcionários e serviços |
| `POST` | `/api/pcp/ordens/{id}/iniciar` | Inicia a produção (`planejada → em_execucao`); cria `accounts_payable` para cada serviço externo |
| `POST` | `/api/pcp/ordens/{id}/colher` | Registra colheita parcial (`percentage_harvested` no body) |
| `POST` | `/api/pcp/ordens/{id}/produzir` | Alias: colhe o percentual restante (mantido para compatibilidade) |
| `DELETE` | `/api/pcp/ordens/{id}` | Soft delete (apenas `planejada`) |

### Relatórios

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/relatorios` | Relatório consolidado (produção por talhão, consumo de insumos, resumo de status, custo previsto vs realizado) |

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
  "details": "opcional",
  "hours_spent": 4.5,
  "employee_id": "uuid (opcional)",
  "quantity_applied": 25.5,
  "quantity_unit": "kg",
  "result": "concluida | parcial | reagendada"
}
```

### ProductionOrderCreate
```json
{
  "plot_id": "uuid",
  "planned_date": "2026-05-20",
  "start_date": "2026-05-12",
  "expected_end_date": "2026-05-25",
  "notes": "opcional",
  "inputs": [
    { "stock_item_id": "uuid", "quantity": 300.000 },
    { "stock_item_id": "uuid", "quantity": 100.000 }
  ],
  "workers": [
    { "employee_id": "uuid", "is_responsible": true },
    { "employee_id": "uuid", "is_responsible": false }
  ],
  "services": [
    { "supplier_id": "uuid", "description": "Colheita manual", "amount": 3500.00, "due_date": "2026-06-25" }
  ]
}
```

- Status inicial: `planejada`
- `order_number` gerado automaticamente no padrão `OP-{ANO}-{SEQ:03d}` (ex: `OP-2026-001`)
- `unit_cost` e `subtotal` dos inputs são resolvidos a partir do `StockItem.unit_cost` no momento da criação
- `total_cost` = soma dos subtotais dos inputs

**Funcionários internos (`workers`)** — opcional:
- Cada worker referencia um `employee_id` da Folha; `salary_snapshot` é capturado a
  partir de `employee.base_salary` no momento da criação (imutável depois)
- No máximo **um** worker pode ter `is_responsible=true` (HTTP 400 se mais de um)
- Cada `employee_id` deve existir (HTTP 404 caso contrário)
- Um funcionário já vinculado a uma ordem **ativa** (status `planejada`,
  `em_producao`, `em_execucao` ou `pausada`) não pode ser adicionado a outra
  ordem ativa (HTTP 409 com o nome do funcionário)

**Serviços externos (`services`)** — opcional:
- Contratação de equipes/serviços terceirizados; cada serviço tem `supplier_id`,
  `description`, `amount` (`> 0`) e `due_date`
- O `supplier_id` deve existir e não estar deletado (HTTP 404 caso contrário)
- A `accounts_payable` **não** é criada na criação da ordem — apenas quando a
  produção é iniciada (`POST /ordens/{id}/iniciar`). Enquanto `planejada`, o
  serviço existe só no PCP, sem reflexo financeiro

**`estimated_cost`** = insumos + funcionários + serviços:
- insumos = soma dos subtotais dos inputs
- funcionários = `SUM(salary_snapshot / 22 × max(1, dias))` para todos os workers,
  onde `dias = (expected_end_date - start_date)` (0 se faltar alguma data ou se negativo)
- serviços = soma dos `amount` dos serviços externos

### HarvestCreate
```json
{
  "percentage_harvested": 50.0
}
```
- `0 < percentage_harvested <= (100 - harvest_progress atual)`

### HarvestOut
```json
{
  "id": "uuid",
  "production_order_id": "uuid",
  "harvest_number": 1,
  "percentage_harvested": 50.00,
  "sacks_total": 49.37,
  "sacks_especial": 9.42,
  "sacks_superior": 27.05,
  "sacks_tradicional": 12.90,
  "inputs_consumed": [
    { "stock_item_id": "uuid", "name": "Adubo Orgânico", "quantity": 5.0, "unit": "kg" }
  ],
  "is_final": false,
  "harvested_at": "2026-05-13T02:46:41Z"
}
```

### ProductionOrderOut
```json
{
  "id": "uuid",
  "plot_id": "uuid",
  "plot_name": "Talhão A - Bourbon Amarelo",
  "order_number": "OP-2026-001",
  "planned_date": "2026-05-20",
  "start_date": "2026-05-12",
  "expected_end_date": "2026-05-25",
  "executed_at": null,
  "total_sacas": 0.000,
  "especial_sacas": 0.000,
  "superior_sacas": 0.000,
  "tradicional_sacas": 0.000,
  "total_cost": 8500.00,
  "estimated_cost": 9500.00,
  "realized_cost": 0.00,
  "harvest_progress": 0.00,
  "status": "planejada",
  "is_overdue": false,
  "notes": null,
  "inputs": [ ... ],
  "harvests": [ ... ],
  "workers": [
    {
      "id": "uuid",
      "employee_id": "uuid",
      "employee_name": "João Silva",
      "salary_snapshot": 6000.00,
      "is_responsible": true
    }
  ],
  "services": [
    {
      "id": "uuid",
      "supplier_id": "uuid",
      "supplier_name": "AgroInsumos do Brasil S.A.",
      "description": "Colheita manual",
      "amount": 3500.00,
      "due_date": "2026-06-25",
      "accounts_payable_id": null
    }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

- `is_overdue` = `expected_end_date < hoje` e status não em `concluida | cancelada`
- `workers` / `services`: listas dos funcionários internos e serviços externos da ordem
- `services[].accounts_payable_id`: `null` enquanto `planejada`; preenchido após `/iniciar`

### ProductionResult
Retorno do endpoint `/colher` (e `/produzir`):
```json
{
  "order_id": "uuid",
  "harvest": { ...HarvestOut },
  "order": { ...ProductionOrderOut atualizada },
  "items_below_minimum": ["Fungicida de contato"]
}
```

## Colheitas Parciais (`registrar_colheita`)

O método central do módulo. Cada chamada registra uma colheita parcial; a ordem
é fechada automaticamente quando o `harvest_progress` acumulado atinge 100%.

### 1. Validações
- Ordem existe e não está em `concluida`/`cancelada` (HTTP 400 se estiver).
- `percentage_harvested > 0` (HTTP 400).
- `harvest_progress + percentage_harvested <= 100` (HTTP 400 com o restante disponível).

### 2. Consumo proporcional dos insumos
Para cada `ProductionInput`, calcula `qty_proporcional = input.quantity × (percentage / 100)`
(3 casas decimais) e verifica disponibilidade. Se algum insumo falhar:
`HTTPException 400 "Estoque insuficiente para: {name}. Disponível: ..."`.

Em seguida, registra a saída via `estoque_service.registrar_saida` com
`source_module="pcp"`, gerando movimento agregado de consumo no Financeiro
(`amount=0`).

### 3. Simulação parcial
- `base = plot.capacity_sacas × (percentage_harvested / 100)`
- `total = base × random.uniform(0.90, 1.10)` (±10%)
- Distribuição entre qualidades: especial 15–25%, superior 45–55%, tradicional restante.

### 4. Entrada no estoque (por qualidade)
Identifica os itens de café cujo nome contenha a palavra-chave (`especial`,
`superior`, `tradicional`) e registra entrada com `unit_cost=0`. Em seguida,
registra movimento agregado de entrada no Financeiro.

> **Demanda 3 — categoria por papel:** a categoria deixou de ser enum fixo
> (`StockItem.category == StockCategory.CAFE`). Os "itens de café" passam a ser
> resolvidos pelo **papel `produto_final`** da categoria, via
> `configuracoes.service.get_item_ids_by_role(db, SystemRole.PRODUTO_FINAL)`
> (`_find_quality_item`). Adotou-se `produto_final` porque o café é o **produto
> final** da produção de safra — preserva exatamente a semântica anterior (a
> categoria "Café" recebe os papéis `produto_final` + `produto_vendavel` no
> seed/migration). Para o PCP enxergar a produção, a categoria dos itens de café
> precisa ter o papel `produto_final` atribuído em Configurações. A refatoração
> profunda do PCP é a Demanda 5; aqui o objetivo foi apenas não quebrar.

### 5. Snapshot e persistência
Persiste um `ProductionHarvest` com:
- `harvest_number` sequencial (contador atual + 1).
- `inputs_consumed` (snapshot serializado: stock_item_id, name, quantity, unit).
- `is_final = True` se a colheita atual fecha 100%.

### 6. Atualiza ordem
- `harvest_progress += percentage_harvested`.
- `total_sacas`, `especial_sacas`, `superior_sacas`, `tradicional_sacas` acumulam
  os totais desta colheita.
- Transição automática de status:
  - `planejada → em_execucao` na primeira colheita parcial.
  - `→ concluida` quando `harvest_progress >= 100`.
- `executed_at` é preenchido no fechamento.

### 7. Cálculo de `realized_cost` (apenas no fechamento)
Quando `is_final=True`:
- Custo de insumos: `SUM(input.quantity × stock_item.unit_cost)` — usa o `unit_cost`
  corrente, que pode ter sido recalculado por média ponderada após compras intermediárias.
- Custo de funcionários: `SUM(salary_snapshot / 22 × max(1, dias))` sobre os `workers`
  da ordem, onde `dias = (executed_at.date() - start_date)` (0 se negativo ou sem datas).
- Custo de serviços: soma dos `amount` dos serviços externos da ordem.
- `realized_cost = insumos + funcionários + serviços` (R$ 0,01 de precisão).
- Lança movimento financeiro `SAIDA / PRODUCAO` com `amount=realized_cost`.

### 8. Notificação de estoque baixo
Após o consumo, percorre os insumos da ordem e devolve em `items_below_minimum`
os nomes daqueles que ficaram abaixo de `minimum_stock`.

### 9. Retorno
`ProductionResult` contendo:
- `order_id`
- `harvest`: registro recém-criado
- `order`: ordem atualizada
- `items_below_minimum`

## Alias `produzir_safra`

Mantido para compatibilidade com clientes existentes. Equivale a
`registrar_colheita(db, order_id, 100 - harvest_progress)` — colhe todo o
percentual restante numa única chamada. Retorna o mesmo `ProductionResult`.

## Registro de Atividades (`add_activity`)

1. Valida que o talhão existe
2. Valida `employee_id` (se informado, deve existir)
3. Cria registro em `plot_activities` com todos os novos campos:
   `hours_spent`, `employee_id`, `quantity_applied`, `quantity_unit`, `result`
4. Registra movimentação financeira:
   - `movement_type=SAIDA`
   - `category=PRODUCAO`
   - `amount=activity.cost` (R$0,00 se mão de obra interna)
   - `description=f"Atividade no talhão {plot.name}: {activity_type}"`
   - `source_module="pcp"`, `reference_id=plot.id`

## Relatórios (`gerar_relatorios`)

Endpoint `GET /api/pcp/relatorios` consolida quatro visões a partir das ordens
não-deletadas:

### `producao_por_talhao`
Agrupa ordens com status `concluida` por talhão, somando sacas por qualidade e
contando ordens.

### `consumo_insumos`
Agrupa `production_inputs` de todas as ordens não-canceladas por `stock_item_id`,
somando `quantity` e `subtotal`.

### `ordens_resumo`
Contagem por status (`planejada`, `em_producao`, `em_execucao`, `pausada`,
`concluida`, `cancelada`) + `atrasadas` (ordens com `expected_end_date < hoje` e
status não-final).

### `custo_previsto_vs_realizado`
Para cada ordem: `order_id`, `order_number`, `plot_name`, `status`,
`estimated_cost`, `realized_cost`, `diferenca = realized - estimated`.

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
| Financeiro | `criar_conta_pagar` | Ao **iniciar** a produção (`/iniciar`), cria uma `accounts_payable` por serviço externo (`supplier_id`, `amount`, `due_date`), com `source_module="pcp"` e `reference_id` = id da ordem; o `accounts_payable_id` gerado é gravado de volta no serviço (guard contra duplicidade) |
| Folha | `get_employee` | Validação de funcionários e captura de `salary_snapshot` na criação da ordem |
| Compras | `Supplier` (query direta) | Validação de fornecedor dos serviços externos e resolução de `supplier_name` |

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

### `production_order_workers`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `production_order_id` | UUID FK → production_orders (cascade delete) |
| `employee_id` | UUID FK → employees (RESTRICT) |
| `salary_snapshot` | NUMERIC(12,2) — `base_salary` capturado na criação |
| `is_responsible` | BOOLEAN default false |
| `created_at`, `updated_at` | TIMESTAMPTZ |

Constraint `uq_pow_order_employee` (`production_order_id`, `employee_id`) — um
funcionário não se repete na mesma ordem.

### `production_order_services`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `production_order_id` | UUID FK → production_orders (cascade delete) |
| `supplier_id` | UUID FK → suppliers (RESTRICT) |
| `description` | VARCHAR(500) |
| `amount` | NUMERIC(12,2) |
| `due_date` | DATE |
| `accounts_payable_id` | UUID FK → accounts_payable (SET NULL) nullable — preenchido ao iniciar |
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
- A detecção de qualidade (especial/superior/tradicional) usa match por substring case-insensitive no `StockItem.name` entre os itens com o papel `produto_final` (Demanda 3 — antes era a categoria enum `cafe`; ver fluxo "Entrada no estoque por qualidade")
