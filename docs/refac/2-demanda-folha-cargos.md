# Demanda 2 — Folha: Cadastro de Cargos (Job Positions)

## Contexto
Hoje o cargo do funcionário é **texto livre** (`employees.role VARCHAR(100)`, ver
`docs/backend/folha.md`). O PCP (Demanda 5) precisará pedir "X funcionários do cargo Y",
então o cargo precisa ser uma **entidade cadastrada**, com salário, selecionável por
dropdown. Os custos por tipo de contrato (CLT/PJ/Temporário) **já existem** no código
(`TERMINATION_COST` e cálculos de INSS/FGTS/vale-transporte em `payroll_events`) —
**não reescrever**, apenas reutilizar.

Releia: `docs/backend/folha.md`, `docs/frontend/folha.md`, e os reais
`backend/app/modules/folha/{model.py,service.py,repository.py,schemas.py,router.py}`,
`frontend/components/modules/folha/FuncionarioForm.tsx`.

## Objetivo
1. Tabela de **cargos** (`job_positions`) com salário base sugerido.
2. Funcionário referencia o cargo por **FK** (substitui o texto livre).
3. CRUD de cargos (API + UI) e **dropdown** de cargo no cadastro de funcionário
   (prefill do salário ao escolher o cargo, editável).

## Decisões de produto (TRAVADAS)
- **Relação funcionário↔cargo = FK única** `employees.position_id → job_positions.id`.
  Um funcionário tem **um** cargo por vez. (A "tabela de relação" pedida é exatamente
  essa FK; não criar M:N — a contagem por cargo que o PCP precisa sai de
  `COUNT(employees) GROUP BY position_id`.)
- `job_positions.base_salary` é **sugestão** que prefilla o salário do funcionário na
  criação; o valor efetivo continua em `employees.base_salary` (pode divergir).
- Cargo é **soft delete**; não permitir excluir cargo com funcionários ativos vinculados
  (400 com mensagem).
- Custos por contrato: **inalterados** — continuam dependendo de `contract_type` (ver `TERMINATION_COST` e eventos automáticos).

## Critérios de aceite
- [ ] Tabela `job_positions` criada e populada a partir dos `role` distintos atuais (migração de dados).
- [ ] `employees.position_id` FK (NOT NULL após backfill); coluna antiga `role` removida (ou mantida deprecada — ver prompt DBA).
- [ ] `GET/POST/PUT/DELETE /api/folha/cargos` funcionando; bloqueio de exclusão com vínculo ativo.
- [ ] Cadastro/edição de funcionário usa **dropdown** de cargo; escolher o cargo prefilla o salário.
- [ ] `EmployeeOut` expõe `position_id` e `position_name` (e `base_salary` do cargo, se útil).
- [ ] `make reset-db` funciona com o novo schema; seeds atualizados.

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md`, a seção
> "Regras transversais" de `docs/refac/README.md` e `backend/app/modules/folha/model.py`.
>
> **Tarefa — tabela de cargos + migração do `role` texto para FK.**
> 1. Confirme o head: `alembic heads`.
> 2. Crie o model/migration de **`job_positions`**: `id UUID PK`, `name VARCHAR(120) UNIQUE NOT NULL`,
>    `description TEXT NULL`, `base_salary NUMERIC(12,2) NOT NULL DEFAULT 0`, `is_active BOOLEAN DEFAULT true`,
>    `created_at`, `updated_at`, `deleted_at`. Índice em `name`.
> 3. Migration de dados (na mesma migration, idempotente):
>    - Inserir um `job_positions` para cada valor **distinto** de `employees.role` existente
>      (`base_salary` = média ou 0 — use 0 e deixe o ajuste para a UI; documente).
>    - Adicionar `employees.position_id UUID NULL` FK → `job_positions(id)` (índice).
>    - Backfill: `UPDATE employees SET position_id = (job_position cujo name = employees.role)`.
>    - Tornar `position_id` **NOT NULL** após o backfill.
>    - **Remover** a coluna `employees.role` (documente; o backend vai parar de usá-la).
>      `downgrade()` recria `role` e repopula a partir de `job_positions.name`.
>    - `revision id` ≤ 32 chars (`00NN_job_positions`), `down_revision` = head atual.
> 4. Atualize `backend/scripts/seed.sql`: criar cargos realistas (ex.: Gerente Agrícola,
>    Motorista, Operador de Máquinas, Colhedor, Auxiliar de Campo) com salários, e
>    vincular os 8 funcionários do seed a `position_id` (remover o `role` texto do seed).
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `python scripts/reset_db.py`
> roda sem erro; SELECTs no psql provando: `SELECT name, base_salary FROM job_positions;` e
> `SELECT e.name, jp.name FROM employees e JOIN job_positions jp ON jp.id=e.position_id LIMIT 8;`.
> Atualize `docs/database/schema.md`.

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend**. Leia `/.claude/agents/backend.md`, a seção "Regras transversais"
> de `docs/refac/README.md`, `docs/backend/folha.md` e os reais
> `backend/app/modules/folha/{model.py,schemas.py,service.py,repository.py,router.py}`.
> A migration de `job_positions` e a FK `employees.position_id` **já existem** (Demanda 2 DBA).
>
> **Tarefa:**
> 1. Model `JobPosition` + repository (CRUD com soft delete e filtro `deleted_at IS NULL`).
> 2. Schemas: `JobPositionCreate/Update/Out` (`name`, `description?`, `base_salary>=0`, `is_active`).
> 3. Endpoints (router de folha, prefixo `/api/folha/cargos`):
>    - `GET /cargos` (lista; suportar `Page[T]` da Demanda 0 se já mergeada, senão array),
>    - `POST /cargos`, `GET /cargos/{id}`, `PUT /cargos/{id}`, `DELETE /cargos/{id}` (soft delete).
>    - `DELETE` deve **falhar (400)** se houver funcionário ativo com esse `position_id`.
> 4. Funcionários: substitua o uso de `role` texto por `position_id`.
>    - `EmployeeCreate`/`EmployeeUpdate` passam a receber `position_id` (validar existência → 404).
>    - Na criação, se `base_salary` não vier, use `job_position.base_salary` como default.
>    - `EmployeeOut` passa a expor `position_id` e `position_name` (resolva via join/query).
>    - O endpoint de criação é multipart/form-data — ajuste o campo `role`→`position_id`.
> 5. Não altere os cálculos por contrato (TERMINATION_COST, eventos INSS/FGTS/VT).
>
> **Done quando (smoke tests — cole as saídas):**
> - `POST /api/folha/cargos` cria cargo; `GET` lista; `DELETE` em cargo com funcionário ativo → 400.
> - Criar funcionário escolhendo `position_id` → `EmployeeOut.position_name` correto.
> - `SELECT position_id FROM employees WHERE id=...;` no psql batendo.
> - `GET /api/folha/funcionarios` retornando `position_name` para todos.
> - Atualize `docs/backend/folha.md` (seção Cargos + mudança no cadastro de funcionário).

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend**. Leia `/.claude/agents/frontend.md`, a seção "Regras transversais"
> de `docs/refac/README.md`, `docs/frontend/folha.md` e os reais
> `frontend/app/(modules)/folha/page.tsx`, `frontend/services/folha.ts`,
> `frontend/components/modules/folha/FuncionarioForm.tsx` e `FuncionarioCard.tsx`,
> + o tipo `Employee` em `types/index.ts`.
>
> **Tarefa:**
> 1. Tipos: `JobPosition { id; name; description?; base_salary; is_active }`. Em `Employee`,
>    troque `role: string` por `position_id: string` + `position_name: string`.
> 2. `services/folha.ts`: `getCargos()`, `createCargo()`, `updateCargo()`, `deleteCargo()`.
>    Ajuste `createFuncionario`/`updateFuncionario` para enviar `position_id`.
> 3. **CRUD de cargos:** dentro da aba "Funcionários" (ou nova sub-seção/Tab "Cargos"),
>    botão "Novo Cargo" → `CargoForm` (RHF + Zod: `name`, `description?`, `base_salary>=0`);
>    lista de cargos com editar/excluir (AlertDialog; mensagem de erro do backend se houver
>    vínculo ativo). Se a Demanda 0 estiver mergeada, use `DataTable`.
> 4. **`FuncionarioForm`:** o campo cargo vira `Select` com os cargos (`getCargos`).
>    Ao escolher o cargo, **prefille `base_salary`** com o `base_salary` do cargo (campo
>    permanece editável). Remova o input de texto de cargo.
> 5. `FuncionarioCard`/`EntryRow`: exibir `position_name` no lugar do antigo `role`.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; no browser: criar cargo,
> criar funcionário com dropdown de cargo (salário prefilado), exclusão de cargo com vínculo
> bloqueada com toast do backend. Atualize `docs/frontend/folha.md`.
</content>
