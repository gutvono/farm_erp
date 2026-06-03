# Backend Module: Folha de Pagamento

## Overview

Módulo responsável pela gestão de **cargos**, funcionários, criação de períodos mensais de folha (holerites), ajustes de horas extras/descontos, pagamento individual ou em lote e demissões. Toda operação que movimenta dinheiro (pagamento, demissão) gera movimentos financeiros e, quando aplicável, contas a pagar.

A partir da **Demanda 2**, o cargo do funcionário deixou de ser texto livre e passou a ser uma **entidade cadastrável** (`job_positions`), referenciada por FK (`employees.position_id`). O antigo campo `employees.role` foi removido fisicamente (migration `0014`).

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

Obedece à regra do projeto: router valida entrada e retorna resposta; service orquestra lógica e integra com o Financeiro; repository apenas acessa o banco. Nunca pular camadas.

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Cargos (Job Positions)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/folha/cargos` | Lista cargos **paginados** (envelope `Page[T]` cru). Params: `page`, `page_size`, `order_by` (`name`/`base_salary`), `order_dir`, `search` (por `name`) |
| `POST` | `/api/folha/cargos` | Cria cargo (JSON). Nome único → `400` se duplicado |
| `GET` | `/api/folha/cargos/{id}` | Detalhe do cargo |
| `PUT` | `/api/folha/cargos/{id}` | Atualiza cargo (campos opcionais; renomear para nome já usado → `400`) |
| `DELETE` | `/api/folha/cargos/{id}` | Soft delete. **Bloqueado** (`400`) se houver funcionário ativo vinculado |

A listagem usa a infra de paginação compartilhada (Demanda 0): `order_by` é validado por allowlist (`name`, `base_salary`); valor inválido cai no default (`name asc`) — nunca `500`. `search` filtra por `name` (ILIKE). Diferente das demais listagens do módulo, retorna o **envelope `Page[T]` cru** (não `SuccessResponse`), como as outras telas paginadas do sistema.

### Funcionários

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/folha/funcionarios` | Lista funcionários (filtros: `is_active`, `contract_type`, paginação) |
| `POST` | `/api/folha/funcionarios` | Cria funcionário (multipart/form-data; foto opcional) |
| `GET` | `/api/folha/funcionarios/{id}` | Detalhe do funcionário |
| `PUT` | `/api/folha/funcionarios/{id}` | Atualiza dados cadastrais (sem foto) |
| `POST` | `/api/folha/funcionarios/{id}/demitir` | Demite funcionário, lança saída no Financeiro + conta a pagar |

O endpoint de criação recebe `multipart/form-data` com campos `name`, `cpf`, **`position_id`** (UUID do cargo, no lugar do antigo `role`), `contract_type`, `admission_date`, **`base_salary` (opcional)**, `email` e `phone`, mais o arquivo opcional `photo_file` (somente `image/jpeg` ou `image/png`). 

- **`position_id`** deve referenciar um cargo existente e **ativo** — caso contrário `404 "Cargo não encontrado"`.
- **`base_salary` é opcional:** quando omitido, o funcionário nasce com o `base_salary` **sugerido pelo cargo**; quando enviado, o valor informado **prevalece** (o do cargo é só sugestão). Ex.: cargo "Colhedor" tem base 1800 → criar sem `base_salary` ⇒ funcionário com 1800; enviar 2000 ⇒ fica 2000.

A foto é gravada em `settings.upload_dir/employees/{uuid}_{filename}` e exposta no `EmployeeOut.photo_url` como `/uploads/{photo_path}`. Se nenhuma foto for enviada, `photo_url` retorna `null` e cabe ao front-end usar o fallback (silhueta default).

### Períodos de Folha

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/folha/periodos` | Lista períodos (ordem DESC por ano/mês) |
| `POST` | `/api/folha/periodos` | Cria ou recupera o período para `reference_month`/`reference_year`. Idempotente. |
| `GET` | `/api/folha/periodos/{id}` | Detalhe com entries populadas |
| `POST` | `/api/folha/periodos/{id}/fechar` | Fecha o período (exige todos os holerites pagos) |
| `POST` | `/api/folha/periodos/{id}/pagar-todos` | Pagamento em lote dos holerites pendentes |

### Holerites (Payroll Entries)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/folha/periodos/{period_id}/entries` | Lista holerites do período |
| `PATCH` | `/api/folha/entries/{id}` | Atualiza `overtime_amount` e `deductions`; recalcula `total_amount` |
| `POST` | `/api/folha/entries/{id}/pagar` | Paga o holerite individual (valida saldo) |
| `GET` | `/api/folha/eventos` | Lista eventos de folha ativos |
| `GET` | `/api/folha/entries/{id}/itens` | Lista itens detalhados do holerite |
| `POST` | `/api/folha/entries/{id}/itens` | Lança/atualiza item manual |
| `POST` | `/api/folha/entries/{id}/calculos/preview` | Simula cálculo automático sem gravar |
| `POST` | `/api/folha/entries/{id}/calculos/aplicar` | Calcula e grava/atualiza item automático |
| `DELETE` | `/api/folha/entries/{id}/itens/{item_id}` | Remove item do holerite |

## Schemas principais

### JobPositionCreate / JobPositionUpdate (JSON)
```json
{
  "name": "Tratorista",
  "description": "Operação de tratores",
  "base_salary": 2500.00,
  "is_active": true
}
```
- `name` obrigatório (≤ 120 chars), único entre cargos não-excluídos.
- `description` opcional; `base_salary ≥ 0` (default `0`); `is_active` default `true`.
- No `JobPositionUpdate` todos os campos são opcionais.

### JobPositionOut
```json
{
  "id": "uuid",
  "name": "Tratorista",
  "description": "Operação de tratores",
  "base_salary": "2500.00",
  "is_active": true,
  "created_at": "...",
  "updated_at": "..."
}
```

### EmployeeCreate (form-data)
```
name: string
cpf: string
position_id: uuid            # cargo (substitui o antigo role)
contract_type: clt | pj | temporario
admission_date: date
base_salary?: Decimal ≥ 0    # opcional: default = base_salary do cargo
email?: string
phone?: string
termination_cost_override?: Decimal ≥ 0
photo_file?: image/jpeg|image/png
```

### EmployeeOut
```json
{
  "id": "uuid",
  "name": "João Silva",
  "cpf": "111.222.333-01",
  "email": "joao@fazenda.com",
  "phone": "(35) 98100-0001",
  "position_id": "uuid",
  "position_name": "Gerente Agrícola",
  "base_salary": "6000.00",
  "contract_type": "clt",
  "admission_date": "2020-03-01",
  "termination_date": null,
  "termination_cost_override": null,
  "photo_url": "/uploads/employees/abc_foto.jpg",
  "is_active": true,
  "created_at": "...",
  "updated_at": "..."
}
```
`position_name` é resolvido a partir do cargo vinculado (`employees.position` → `job_positions.name`). O campo `role` **não existe mais**.

### PayrollPeriodCreate
```json
{ "reference_month": 4, "reference_year": 2026 }
```

### PayrollEntryUpdate
```json
{ "overtime_amount": 500.00, "deductions": 200.00 }
```
`total_amount` é recalculado automaticamente como `base_salary + overtime_amount − deductions` (nunca persiste o valor enviado pelo cliente).

### PayrollAutoCalculationRequest
```json
{
  "calculation_type": "inss | fgts | transport_voucher | overtime | night_shift",
  "event_id": null,
  "base_amount": null,
  "quantity": 10,
  "percentage": 50,
  "start_time": "22:00",
  "end_time": "05:00",
  "rule": "urbana",
  "real_transport_cost": 220.00
}
```

`event_id` é opcional. Se omitido, o backend usa o evento padrão compatível com `calculation_type`.

### PayrollPeriodOut
```json
{
  "id": "uuid",
  "reference_month": 4,
  "reference_year": 2026,
  "status": "aberta | fechada",
  "closed_at": null,
  "total_amount": "29600.00",
  "entries": [ /* PayrollEntryOut[] */ ],
  "created_at": "...",
  "updated_at": "..."
}
```

### PayrollBatchResult
```json
{
  "paid_count": 6,
  "total_paid": 21600.00,
  "insufficient_balance": true,
  "failed_employees": ["Ana Pereira"]
}
```

## Regras de Negócio

### Cargos
- **Unicidade:** `name` é único entre cargos não-excluídos. Criar/renomear para um nome já usado → `400 "Já existe um cargo com este nome"`.
- **Salário sugerido:** `base_salary` do cargo é apenas a sugestão usada para prefillar o salário do funcionário na criação. O salário efetivo vive em `employees.base_salary` e pode divergir; alterar o cargo depois **não** retroage aos funcionários.
- **Exclusão bloqueada:** `DELETE` só faz o soft delete se **nenhum** funcionário ativo (`deleted_at IS NULL`) estiver vinculado àquele `position_id`. Havendo vínculo ativo → `400 "Não é possível excluir um cargo com funcionários vinculados"`. Após demitir/desvincular os funcionários, o `DELETE` passa a funcionar.
- **Soft delete:** cargo excluído some das listagens e do `GET` por id; o histórico permanece (funcionários antigos continuam referenciando o `position_id`).
- A contagem de funcionários por cargo (que o PCP consome) sai de `COUNT(employees) GROUP BY position_id` — relação 1:N, sem M:N.

### Funcionários
- CPF é único — criação em duplicidade retorna `400`.
- **Cargo (`position_id`):** obrigatório na criação; deve existir e estar ativo (senão `404 "Cargo não encontrado"`). No `update`, trocar o cargo segue a mesma validação. `base_salary` na criação é opcional e herda o do cargo quando ausente (ver Endpoints → Funcionários).
- Foto só é enviada na criação (PUT não aceita foto). Formatos aceitos: JPEG e PNG.
- `update` aceita todos os campos opcionais exceto `cpf` (CPF não é atualizável).
- `deactivate_employee` faz soft delete (`deleted_at = now()`) e marca `is_active = False` + `termination_date = today`. Após isso o funcionário não aparece mais em listagens nem em `get` (operação semântica final).

### Demissão
- Proibida para funcionários já inativos.
- Custo calculado como `termination_cost_override` (se preenchido) ou o valor fixo por tipo de contrato:

```python
TERMINATION_COST = {
    "clt":         5000.00,   # Multa FGTS + aviso prévio simulados
    "pj":          1000.00,   # Somente aviso contratual
    "temporario":   500.00,
}
```

- Gera:
  - `saida/folha` no Financeiro com descrição `"Demissão: {nome} ({TIPO})"`.
  - Conta a pagar com descrição `"Verbas rescisórias: {nome}"`, vencimento `hoje + 10 dias`, `source_module="folha"`.

### Períodos
- `POST /periodos` é idempotente: se já existe período para `month/year`, retorna o existente (sem recriar entries).
- Ao criar um novo período, o serviço cria uma `PayrollEntry` por funcionário **ativo** com `base_salary` atual, `overtime_amount=0`, `deductions=0`, `total_amount=base_salary`, `status=pendente`.
- Fechar período exige que **nenhuma** entry esteja pendente. Caso contrário retorna `400 "Existem funcionários sem pagamento..."`.
- Ao fechar, `total_amount` do período é recalculado somando `net_amount` de todas as entries e gravado; `closed_at` recebe `now()`.

### Holerites
- `PATCH /entries/{id}` só funciona em período `aberta` **e** entry `pendente`. Bloqueios retornam `400`.
- `total_amount` (coluna `net_amount` no model) é sempre calculado no serviço/repo; nunca aceita valor do cliente.
- Itens detalhados ficam em `payroll_entry_items` e sempre referenciam um evento em `payroll_events`.
- `provento` com `affects_net=true` aumenta o líquido.
- `desconto` com `affects_net=true` reduz o líquido.
- `informativo` ou `affects_net=false` aparece no holerite, mas não altera o líquido. O FGTS usa esta regra.
- Ao aplicar cálculos em um holerite legado, o serviço cria itens equivalentes para salário base, horas extras e descontos já agregados antes do recálculo.
- `POST /entries/{id}/pagar`:
  - Valida que entry existe e está `pendente`.
  - Consulta saldo atual via `fin_service.get_balance(db)`.
  - Se saldo < `total_amount`: `400 "Saldo insuficiente. Saldo atual: R${saldo:.2f}, valor do holerite: R${total:.2f}"`.
  - Marca `status=pago`, `paid_at=now()`.
  - Gera `saida/folha` no Financeiro com descrição `"Pagamento de salário: {nome} — MM/AAAA"`.

### Pagamento em lote (`pay_all_entries`)
- Aplicável apenas em período `aberta`.
- Consulta o saldo **uma vez** no início e mantém um saldo local decrementado a cada pagamento.
- Itera sobre as entries `pendentes` por ordem de criação:
  - Se saldo local ≥ `total_amount` → paga (marca `pago`, subtrai do saldo local, gera movimento `saida/folha`) e incrementa `paid_count`/`total_paid`.
  - Caso contrário, adiciona o nome do funcionário em `failed_employees` e continua (o lote **nunca** interrompe por saldo insuficiente — registra e segue).
- Retorna `PayrollBatchResult` com `insufficient_balance=True` sempre que houver algum `failed_employees`.

## Integrações com outros módulos

| Origem | Evento | Integração |
|--------|--------|------------|
| Folha | Pagamento individual / lote | `fin_service.registrar_movimento(SAIDA, FOLHA, amount=total_amount, source_module="folha", reference_id=entry.id)` |
| Folha | Demissão | `fin_service.registrar_movimento(SAIDA, FOLHA, amount=cost)` + `fin_service.criar_conta_pagar(..., due_date=today+10d)` |

Validação de saldo antes do pagamento usa `fin_service.get_balance(db).saldo` como fonte única da verdade.

## Constantes

`TERMINATION_COST` está definida no topo do `service.py` como dicionário de `Decimal` por tipo de contrato (string da enum `ContractType.value`). Alterar os valores nesse dicionário muda o custo padrão das demissões sem necessidade de migration.

## Database Schema

### `job_positions`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(120) unique indexado (`ix_job_positions_name`) |
| `description` | TEXT nullable |
| `base_salary` | NUMERIC(12,2) NOT NULL (salário sugerido) |
| `is_active` | BOOLEAN NOT NULL |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ (soft delete) |

### `employees`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) indexado |
| `document` (CPF) | VARCHAR(32) unique indexado |
| `email`, `phone` | VARCHAR nullable |
| `position_id` | UUID FK → job_positions (`fk_employees_position`) NOT NULL, indexado |
| `contract_type` | enum (`clt`/`pj`/`temporario`) |
| `base_salary` | NUMERIC(12,2) |
| `hire_date` | DATE |
| `termination_date` | DATE nullable |
| `termination_cost_override` | NUMERIC(12,2) nullable |
| `photo_path` | VARCHAR(500) nullable (caminho relativo em `settings.upload_dir`) |
| `is_active` | BOOLEAN default true, indexado |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `payroll_periods`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `competency_year` | INT indexado |
| `competency_month` | INT indexado |
| `status` | enum (`aberta`/`fechada`) indexado |
| `closed_at` | TIMESTAMPTZ nullable |
| `total_amount` | NUMERIC(12,2) default 0 (preenchido no fechamento) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

Unique constraint `uq_payroll_period_competency (competency_year, competency_month)`.

### `payroll_entries`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `payroll_period_id` | UUID FK → payroll_periods (CASCADE delete) |
| `employee_id` | UUID FK → employees (RESTRICT delete) |
| `base_salary` | NUMERIC(12,2) |
| `extras_hours` | NUMERIC(8,2) default 0 |
| `extras_value` (= `overtime_amount`) | NUMERIC(12,2) default 0 |
| `absences_quantity`, `absences_value` | NUMERIC default 0 |
| `deductions_value` (= `deductions`) | NUMERIC(12,2) default 0 |
| `net_amount` (= `total_amount`) | NUMERIC(12,2) default 0 |
| `status` | enum (`pendente`/`pago`) indexado |
| `paid_at` | TIMESTAMPTZ nullable |
| `created_at`, `updated_at` | TIMESTAMPTZ |

Unique constraint `uq_payroll_entry_period_employee (payroll_period_id, employee_id)`.

### `payroll_events`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `description` | VARCHAR(255) unique |
| `event_type` | enum (`provento`/`desconto`/`informativo`) |
| `calculation_type` | enum (`manual`/`overtime`/`night_shift`/`inss`/`fgts`/`transport_voucher`) |
| `is_automatic` | BOOLEAN |
| `affects_net` | BOOLEAN |
| `is_active` | BOOLEAN |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

Eventos padrão: Salario base, Hora extra, Adicional noturno, INSS, Vale transporte, FGTS e Descontos manuais.

### `payroll_entry_items`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `payroll_entry_id` | UUID FK → payroll_entries (CASCADE delete) |
| `payroll_event_id` | UUID FK → payroll_events (RESTRICT delete) |
| `amount` | NUMERIC(12,2), `CHECK amount >= 0` |
| `calculation_base` | NUMERIC(12,2) nullable |
| `quantity` | NUMERIC(12,4) nullable |
| `percentage` | NUMERIC(7,2) nullable |
| `metadata` | JSONB |
| `source` | enum (`manual`/`automatic`) |
| `created_at`, `updated_at` | TIMESTAMPTZ |

Unique constraint `uq_payroll_entry_item_entry_event (payroll_entry_id, payroll_event_id)`.

Com itens detalhados, o recálculo usa:

```text
net_amount = max(0, soma(proventos que afetam líquido) - soma(descontos que afetam líquido))
```

Campos legados seguem preenchidos:
- `extras_value`: soma de Hora extra e Adicional noturno.
- `deductions_value`: soma dos descontos que afetam líquido.
- `net_amount`: líquido recalculado e usado pelos pagamentos.

## Migrations

`0003_folha_extra_columns` (arquivo `alembic/versions/20260416_0003_folha_extra_columns.py`):
- Adiciona `employees.termination_cost_override NUMERIC(12,2) nullable`.
- Adiciona `payroll_periods.total_amount NUMERIC(12,2) NOT NULL DEFAULT 0`.

Reversível via `downgrade()` (drop das duas colunas).

`0006_payroll_events_items` (arquivo `alembic/versions/20260513_0006_payroll_events_items.py`):
- Cria enums `payroll_event_type`, `payroll_calculation_type` e `payroll_item_source`.
- Cria `payroll_events` e `payroll_entry_items`.
- Insere os eventos padrão de cálculo automático.

Reversível via `downgrade()` (drop das tabelas e enums).

`0008_fix_payroll_desc_index` (arquivo `alembic/versions/20260528_0008_fix_payroll_desc_index.py`):
- Corrige a divergência entre o model e a 0006 em `payroll_events.description`: o model declara `unique=True, index=True` (um único índice unique `ix_payroll_events_description`), mas a 0006 criou uma constraint `UNIQUE` (`payroll_events_description_key`) **somada a** um índice não-unique de mesmo nome lógico.
- `upgrade()`: remove a constraint `UNIQUE` e o índice não-unique; recria `ix_payroll_events_description` como índice **unique**.
- Elimina o diff residual reportado por `alembic check`.

Reversível via `downgrade()` (recria o índice não-unique + a constraint `UNIQUE`).

`0013_job_positions` (arquivo `alembic/versions/20260603_0013_job_positions.py`) — **Demanda 2**:
- Cria a tabela `job_positions` (cargo cadastrável).
- Migração de dados (idempotente): insere um cargo por valor DISTINTO de `employees.role`; adiciona `employees.position_id` (FK + índice); backfill por igualdade exata de texto (`role` → `name` do cargo); torna `position_id` NOT NULL; rebaixa `employees.role` a NULLABLE/DEPRECATED (sem dropar).
- "Colhedor" e "Colhedora" ficam como cargos distintos (sem normalizar gênero).
- Reversível (`downgrade` repopula `role`, exige NOT NULL, remove `position_id` e dropa `job_positions`).

`0014_drop_employee_role` (arquivo `alembic/versions/20260603_0014_drop_employee_role.py`) — **Demanda 2**, passo final:
- `upgrade()`: **DROP físico** de `employees.role` (`DROP COLUMN IF EXISTS role`), depois que o Backend parou de ler/escrever o campo. O dado canônico do cargo é `position_id`.
- `downgrade()`: recria a coluna `role VARCHAR(100) NULLABLE` (não repopula — quem precisar do texto resolve via `JOIN job_positions`).
- O atributo `role` foi removido do model `Employee` para manter `alembic check` limpo (model × banco em sincronia).

> **Convenção:** `alembic_version.version_num` é `VARCHAR(32)` — o `revision id` de cada migration deve ter no máximo 32 caracteres (por isso `0008_fix_payroll_desc_index` e não o nome completo do arquivo).

## Observações

- Mensagens de erro e resposta em português.
- Todas as respostas usam `SuccessResponse` do `app.shared.responses`.
- Validação de entrada via Pydantic (`schemas.py`).
- Após múltiplos `db.commit()` (ex.: `produzir_safra`, `pay_entry`, `terminate_employee`), as entidades são recarregadas via `repository.get_*` antes de retornar, evitando cache stale do SQLAlchemy.
- Soft delete em `employees` significa que o funcionário demitido deixa de aparecer nas rotas de listagem/detalhe; o histórico permanece rastreável pelas movimentações do Financeiro (via `reference_id`).
