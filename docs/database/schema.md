# Coffee Farm ERP — Documentação do Schema

## Visão Geral

O banco de dados do Coffee Farm ERP é modelado em PostgreSQL, acessado via
SQLAlchemy 2.0, com migrações via Alembic. Todas as 22 tabelas seguem os
mesmos padrões de chave primária, auditoria e, quando aplicável, soft delete.

---

## Padrões Globais

### Tipos e campos obrigatórios

Todas as tabelas aplicam estes mixins (definidos em `app/shared/base_model.py`):

- **`UUIDMixin`** — `id UUID PRIMARY KEY` (gerado via `uuid4()`).
- **`TimestampMixin`** — `created_at` e `updated_at` `TIMESTAMPTZ` preenchidos
  automaticamente pelo banco (`NOW()`), com `onupdate` em `updated_at`.
- **`SoftDeleteMixin`** — `deleted_at TIMESTAMPTZ NULL` (apenas tabelas de
  negócio). Consultas normais **devem** filtrar `deleted_at IS NULL`.

### Nomenclatura

| Elemento | Padrão | Exemplo |
|----------|--------|---------|
| Tabelas | plural snake_case | `stock_items`, `accounts_payable` |
| Colunas | snake_case | `total_amount`, `hire_date` |
| FKs | `<entidade>_id` | `client_id`, `stock_item_id` |
| Índices FK | automáticos (via `index=True`) | — |

### Enums

Definidos em `app/shared/enums.py` como subclasses de `(str, enum.Enum)`, são
materializados como tipos `ENUM` nativos do PostgreSQL. O helper `sa_enum_values`
garante que o banco armazene o valor **lowercase** (`.value`) do membro, não o
nome do enum.

### Monetário e quantidades

- Valores em reais: `NUMERIC(12, 2)` (até R$ 9.999.999.999,99).
- Quantidades: `NUMERIC(12, 3)` — suporta três casas decimais para unidades
  como sacas, litros e kg.

### Soft Delete vs Hard Delete

| Tabela | Soft delete | Observação |
|--------|-------------|------------|
| `users`, `clients`, `suppliers`, `employees` | ✅ | entidades cadastrais |
| `stock_items`, `plots` | ✅ | cadastros base |
| `sales`, `purchase_orders`, `invoices`, `accounts_payable`, `accounts_receivable`, `production_orders`, `plot_activities`, `payroll_periods` | ✅ | operações de negócio |
| `sale_items`, `purchase_order_items`, `invoice_items`, `production_inputs`, `payroll_entries` | ❌ | itens filhos (cascateados pelo pai) |
| `stock_movements`, `financial_movements` | ❌ | ledger imutável — auditoria |
| `notifications` | ❌ | efêmeras por design |

---

## Tabelas por Módulo

### Auth

#### `users`
Usuários do sistema com autenticação por senha (bcrypt).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `email` | `VARCHAR(255)` UNIQUE | Login único |
| `name` | `VARCHAR(255)` | Nome de exibição |
| `hashed_password` | `VARCHAR(255)` | Hash bcrypt |
| `is_admin` | `BOOLEAN` | Acesso total |
| `is_active` | `BOOLEAN` | Ativo para login |

---

### Notifications (shared)

#### `notifications`
Notificações persistidas exibidas no sino do header.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `type` | ENUM `notification_type` | `info` \| `warning` \| `error` \| `success` |
| `title` | `VARCHAR(255)` | Título curto |
| `message` | `VARCHAR(1000)` | Mensagem completa |
| `module` | `VARCHAR(50)` | Módulo de origem |
| `link` | `VARCHAR(500)` | Rota frontend opcional |
| `is_read` | `BOOLEAN` | Status lida/não lida |
| `user_id` | FK `users.id` (nullable) | Destinatário (NULL = broadcast) |

---

### Comercial

#### `clients`
Clientes compradores de café.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `name` | `VARCHAR(255)` | Razão social / nome |
| `document` | `VARCHAR(32)` | CPF ou CNPJ |
| `email`, `phone`, `address` | `VARCHAR` | Contato |
| `is_delinquent` | `BOOLEAN` | Inadimplência (definida no cancelamento de AR) |
| `notes` | `TEXT` | Observações |

#### `sales`
Vendas realizadas. Segue fluxo `realizada → entregue → cancelada`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `client_id` | FK `clients.id` | Cliente comprador |
| `status` | ENUM `sale_status` | `realizada` \| `entregue` \| `cancelada` |
| `total_amount` | `NUMERIC(12,2)` | Soma dos itens |
| `sold_at` | `TIMESTAMPTZ` | Data da venda |
| `delivered_at` | `TIMESTAMPTZ` NULL | Data de entrega |

#### `sale_items`
Itens de uma venda.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `sale_id` | FK `sales.id` (CASCADE) | Venda pai |
| `stock_item_id` | FK `stock_items.id` | Produto vendido |
| `quantity` | `NUMERIC(12,3)` | Quantidade |
| `unit_price` | `NUMERIC(12,2)` | Preço unitário |
| `subtotal` | `NUMERIC(12,2)` | Subtotal |

---

### Compras

#### `suppliers`
Fornecedores de insumos, café verde e equipamentos.

#### `purchase_orders`
Ordens de compra. Fluxo `em_andamento → concluida → cancelada`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `supplier_id` | FK `suppliers.id` | Fornecedor |
| `status` | ENUM `purchase_order_status` | Estado da ordem |
| `total_amount` | `NUMERIC(12,2)` | Valor total |
| `ordered_at`, `received_at` | `TIMESTAMPTZ` | Datas |

#### `purchase_order_items`
Itens da ordem (CASCADE no pai).

---

### Estoque

#### `stock_items`
Itens de estoque (café, insumos, veículos, equipamentos).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `sku` | `VARCHAR(64)` UNIQUE | Código interno |
| `category` | ENUM `stock_category` | `cafe` \| `insumo` \| `veiculo` \| `equipamento` \| `outro` |
| `unit` | ENUM `stock_unit` | `saca` \| `litro` \| `kg` \| `unidade` |
| `minimum_stock` | `NUMERIC(12,3)` | Gatilho de alerta |
| `unit_cost` | `NUMERIC(12,2)` | Custo médio |
| `quantity_on_hand` | `NUMERIC(12,3)` | Saldo atual (denormalizado; ledger é `stock_movements`) |

#### `stock_movements`
Ledger imutável de entradas/saídas de estoque.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `stock_item_id` | FK `stock_items.id` | Item |
| `movement_type` | ENUM `stock_movement_type` | `entrada` \| `saida` |
| `quantity` | `NUMERIC(12,3)` | Quantidade |
| `unit_cost`, `total_value` | `NUMERIC(12,2)` | Valor da movimentação |
| `source_module`, `reference_id` | `VARCHAR`, `UUID` | Rastreabilidade |
| `occurred_at` | `TIMESTAMPTZ` | Quando ocorreu |

---

### Faturamento

#### `invoices`
Faturas emitidas (automáticas ou avulsas). Fluxo `emitida → paga → cancelada`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `number` | `VARCHAR(32)` UNIQUE | Número sequencial |
| `client_id`, `sale_id` | FK | Cliente e venda opcional |
| `issue_date`, `due_date` | `DATE` | Datas |
| `total_amount` | `NUMERIC(12,2)` | Total |

#### `invoice_items`
Itens da fatura (CASCADE).

---

### Financeiro

#### `financial_movements`
Ledger imutável de todas as movimentações financeiras. Saldo da conta corrente
é `SUM(entrada) - SUM(saida)`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `movement_type` | ENUM `financial_movement_type` | `entrada` \| `saida` |
| `category` | ENUM `financial_category` | venda, compra, folha, produção, ajuste, recebimento, pagamento, saldo_inicial, outro |
| `amount` | `NUMERIC(12,2)` | Valor (pode ser 0 para registros sem impacto) |
| `source_module`, `reference_id` | Rastreabilidade |
| `occurred_at` | `TIMESTAMPTZ` | Data efetiva |

#### `accounts_payable`
Contas a pagar. Status: `em_aberto → paga → cancelada`.

#### `accounts_receivable`
Contas a receber. Status: `em_aberto → quitado | parcialmente_pago → cancelada`.
O cancelamento por inadimplência marca `clients.is_delinquent = TRUE`.

---

### Folha

#### `employees`
Funcionários. Contratos: CLT, PJ, Temporário.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `document` | `VARCHAR(32)` UNIQUE | CPF |
| `contract_type` | ENUM `contract_type` | `clt` \| `pj` \| `temporario` |
| `base_salary` | `NUMERIC(12,2)` | Salário base |
| `hire_date`, `termination_date` | `DATE` | Admissão e demissão |
| `photo_path` | `VARCHAR(500)` | Caminho em `/uploads` |
| `is_active` | `BOOLEAN` | Ativo (FALSE após demissão) |

#### `payroll_periods`
Competências mensais. UNIQUE (`competency_year`, `competency_month`).
Status: `aberta → fechada`.

#### `payroll_entries`
Lançamentos por funcionário/competência. UNIQUE
(`payroll_period_id`, `employee_id`). Status: `pendente → pago`.

Fórmula do `net_amount`:
```
net = base_salary + extras_value - absences_value - deductions_value
```

---

### PCP (Produção)

#### `plots`
Talhões da fazenda.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `name`, `location`, `variety` | `VARCHAR` | Identificação |
| `capacity_sacas` | `NUMERIC(12,3)` | Capacidade em sacas de 60kg |

#### `production_orders`
Execuções de safra. Distribui o total em três qualidades.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `plot_id` | FK `plots.id` | Talhão |
| `executed_at` | `TIMESTAMPTZ` | Data da produção |
| `total_sacas` | `NUMERIC(12,3)` | Total produzido |
| `especial_sacas`, `superior_sacas`, `tradicional_sacas` | `NUMERIC(12,3)` | Por qualidade |
| `total_cost` | `NUMERIC(12,2)` | Custo dos insumos |

#### `production_inputs`
Insumos consumidos na produção (CASCADE).

#### `plot_activities`
Atividades em talhões (plantio, adubação, poda, colheita etc.).

---

## Diagrama de Relacionamentos

```
users ──────────────┐ (notification user_id)
                    ▼
            notifications

clients ──────┬───── sales ──── sale_items ─── stock_items
              │                                    ▲
              ├───── accounts_receivable ──┐       │
              │                            │       │
              └───── invoices ─────── invoice_items│
                         ▲                         │
                         └── sale_id (nullable) ──▶sales

suppliers ────┬──── purchase_orders ── purchase_order_items ──▶ stock_items
              └──── accounts_payable

stock_items ──── stock_movements (ledger)

employees ──── payroll_entries ──── payroll_periods

plots ──┬──── production_orders ──── production_inputs ──▶ stock_items
        └──── plot_activities

financial_movements (ledger, referencia opcional por source_module + reference_id)
```

---

## Decisões de Design

### Por que `Base.metadata.create_all` na migration inicial?

A revisão `0001_initial_schema` usa `Base.metadata.create_all(bind)` em vez de
operações `op.create_table()` explícitas. Motivos:

1. **Evita duplicação**: os 22 modelos já são a fonte de verdade no SQLAlchemy;
   reescrever cada `op.create_table()` seria ~700 linhas duplicadas.
2. **Bootstrap limpo**: para a primeira revisão, onde ainda não há schema
   versionado, `create_all` produz exatamente o mesmo DDL que Alembic geraria.
3. **Migrations futuras usam autogenerate**: a partir daí, toda alteração deve
   vir de `alembic revision --autogenerate -m "..."` com diffs explícitos.

### Enum nativo do Postgres

Usamos `SAEnum(..., values_callable=sa_enum_values)` para:

- Ter **validação em nível de banco** (falha no INSERT com valor fora da lista).
- Armazenar o **valor lowercase** (`.value`), mais natural para joins, filtros
  e API responses.
- Permitir introspecção via `information_schema.`

### Ledgers imutáveis

`financial_movements` e `stock_movements` não têm `deleted_at` nem UPDATE: são
anexadas (append-only), e representam a fonte de verdade histórica. Saldos
denormalizados (`stock_items.quantity_on_hand`) podem ser recalculados a
partir delas.

### Saldo e inadimplência

- `clients.is_delinquent` é flag manual/gatilho de processo — setado quando
  AR é cancelada por não pagamento, revertível via UI.
- `stock_items.quantity_on_hand` deve ser mantido pela service layer ao
  registrar cada `stock_movement`.

---

## Como rodar

### Pré-requisitos

- PostgreSQL 14+ rodando em `localhost:5432`
- Usuário `postgres` / senha `postgres` (ou ajustar `.env`)
- Poetry instalado e dependências via `poetry install`

### Resetar e popular o banco

```bash
cd backend
python -m poetry run python scripts/reset_db.py
```

Esse script:
1. Termina conexões existentes;
2. Drop/recreate do database `coffee_farm_erp`;
3. Roda `alembic upgrade head` (aplica `0001_initial_schema`);
4. Aplica `scripts/seed.sql` via `psql`.

### Alternativa via Make

```bash
make reset-db
```

### Adicionar novas migrations

```bash
cd backend
python -m poetry run alembic revision --autogenerate -m "adicionar_campo_x"
python -m poetry run alembic upgrade head
```

---

## Credenciais iniciais (seed)

| Usuário | Senha |
|---------|-------|
| `admin@fazenda.com` | `admin123` |

---

## Inventário do seed

- **1** usuário admin
- **3** clientes (1 inadimplente: Mercearia Dona Rita)
- **3** fornecedores
- **8** funcionários — 3 CLT (R$ 2.200–6.000), 3 PJ (R$ 4.000–5.500), 2 Temporários (R$ 1.800)
- **9** itens de estoque — 3 qualidades de café em sacas de 60kg, 4 insumos, 1 trator, 1 colheitadeira
- **2** talhões e **3** atividades registradas
- **1** ordem de produção concluída (100 sacas: 19 especial, 52 superior, 29 tradicional)
- **1** ordem de compra concluída (R$ 7.600)
- **2** vendas (1 entregue quitada, 1 realizada em aberto)
- **2** faturas
- **2** contas a pagar (1 paga, 1 em aberto)
- **3** contas a receber (1 quitada, 1 em aberto, 1 cancelada)
- **3** períodos de folha (01/2026 e 02/2026 fechadas e pagas, 03/2026 aberta) — **24** lançamentos
- **17** movimentações de estoque
- **25** movimentações financeiras cobrindo os últimos 3 meses
- **3** notificações

**Saldo inicial:** R$ 150.000,00 (movimentação `saldo_inicial` em 2026-01-01)
**Saldo projetado ao final do seed:** ~R$ 103.156,67
