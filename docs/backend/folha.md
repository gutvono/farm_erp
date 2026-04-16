# Backend Module: Folha de Pagamento

## Overview

Módulo responsável pela gestão de funcionários, criação de períodos mensais de folha (holerites), ajustes de horas extras/descontos, pagamento individual ou em lote e demissões. Toda operação que movimenta dinheiro (pagamento, demissão) gera movimentos financeiros e, quando aplicável, contas a pagar.

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

Obedece à regra do projeto: router valida entrada e retorna resposta; service orquestra lógica e integra com o Financeiro; repository apenas acessa o banco. Nunca pular camadas.

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Funcionários

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/folha/funcionarios` | Lista funcionários (filtros: `is_active`, `contract_type`, paginação) |
| `POST` | `/api/folha/funcionarios` | Cria funcionário (multipart/form-data; foto opcional) |
| `GET` | `/api/folha/funcionarios/{id}` | Detalhe do funcionário |
| `PUT` | `/api/folha/funcionarios/{id}` | Atualiza dados cadastrais (sem foto) |
| `POST` | `/api/folha/funcionarios/{id}/demitir` | Demite funcionário, lança saída no Financeiro + conta a pagar |

O endpoint de criação recebe `multipart/form-data` com campos `name`, `cpf`, `role`, `base_salary`, `contract_type`, `admission_date`, `email` e `phone`, mais o arquivo opcional `photo_file` (somente `image/jpeg` ou `image/png`). A foto é gravada em `settings.upload_dir/employees/{uuid}_{filename}` e exposta no `EmployeeOut.photo_url` como `/uploads/{photo_path}`. Se nenhuma foto for enviada, `photo_url` retorna `null` e cabe ao front-end usar o fallback (silhueta default).

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

## Schemas principais

### EmployeeCreate (form-data)
```
name: string
cpf: string
role: string
base_salary: Decimal ≥ 0
contract_type: clt | pj | temporario
admission_date: date
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
  "role": "Gerente Agrícola",
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

### PayrollPeriodCreate
```json
{ "reference_month": 4, "reference_year": 2026 }
```

### PayrollEntryUpdate
```json
{ "overtime_amount": 500.00, "deductions": 200.00 }
```
`total_amount` é recalculado automaticamente como `base_salary + overtime_amount − deductions` (nunca persiste o valor enviado pelo cliente).

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

### Funcionários
- CPF é único — criação em duplicidade retorna `400`.
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

### `employees`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) indexado |
| `document` (CPF) | VARCHAR(32) unique indexado |
| `email`, `phone` | VARCHAR nullable |
| `role` | VARCHAR(100) |
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

## Migrations

`0003_folha_extra_columns` (arquivo `alembic/versions/20260416_0003_folha_extra_columns.py`):
- Adiciona `employees.termination_cost_override NUMERIC(12,2) nullable`.
- Adiciona `payroll_periods.total_amount NUMERIC(12,2) NOT NULL DEFAULT 0`.

Reversível via `downgrade()` (drop das duas colunas).

## Observações

- Mensagens de erro e resposta em português.
- Todas as respostas usam `SuccessResponse` do `app.shared.responses`.
- Validação de entrada via Pydantic (`schemas.py`).
- Após múltiplos `db.commit()` (ex.: `produzir_safra`, `pay_entry`, `terminate_employee`), as entidades são recarregadas via `repository.get_*` antes de retornar, evitando cache stale do SQLAlchemy.
- Soft delete em `employees` significa que o funcionário demitido deixa de aparecer nas rotas de listagem/detalhe; o histórico permanece rastreável pelas movimentações do Financeiro (via `reference_id`).
