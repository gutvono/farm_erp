# Demanda 5 — PCP: Refatoração Completa (hectares, cargos, recursos, colheita por destino, pragas)

> **A maior refatoração do projeto.** Depende das Demandas 2 (cargos), 3 (categorias/papéis +
> módulo Configurações + itens-destino) e 4 (aprovação/Financeiro). Pode ser quebrada em mais de
> um PR se necessário, mas as partes abaixo devem ser entregues na ordem P1→P6.

## Contexto
Hoje a colheita é **aleatória** (`backend/app/modules/pcp/service.py`, `random.uniform`,
distribui em especial/superior/tradicional) e a OP aloca **funcionários nominais** com um
"responsável". O cliente quer um modelo realista: talhão em **hectares**, OP usando uma fração de
hectares, **requisitos por cargo** (não nomes), **recursos de estoque** (máquinas/veículos
reservados + embalagens consumidas), **SKU** visível, colheita **determinística por destino**
(Indústria/Embalagem/Descarte) e tratamento de **pragas** via colheita parcial + nova OP.

Releia OBRIGATORIAMENTE: `docs/backend/pcp.md`, `docs/frontend/pcp.md`, `docs/database/schema.md`
(seção PCP), e os reais `backend/app/modules/pcp/*`, + a doc/serviço do módulo **Configurações**
(Demanda 3: papéis `maquina`/`veiculo`/`embalagem` e itens-destino da colheita) e de **Folha**
(Demanda 2: `job_positions`, `contract_type`).

## Partes / Escopo
- **P1 — Talhão em hectares:** `plots.total_hectares`. Campo obrigatório no cadastro.
- **P2 — OP usa hectares do talhão:** `production_orders.hectares_used`. Validar que a soma de
  `hectares_used` das OPs **ativas** de um talhão não excede `total_hectares`.
- **P3 — Requisitos por cargo (substitui workers nominais):** a seção de funcionários da OP passa
  a ser uma lista de **{ cargo, quantidade, vínculo }** — ex.: `MOTORISTA | 2 | clt`. Vínculo usa
  os valores de `contract_type` da Folha (`clt`/`pj`/`temporario`). Remove a alocação nominal e o
  "responsável". Custo de pessoal estimado/realizado passa a sair de `Σ(quantidade ×
  job_position.base_salary / 22 × max(1, dias))`.
- **P4 — Recursos de estoque (máquinas/veículos/embalagens):** na OP, além de insumos, informar
  itens de estoque dos papéis `maquina`, `veiculo`, `embalagem` (resolvidos via Configurações).
  - **Máquinas e veículos = reserva:** um item desses **não pode** estar em duas OPs ativas ao
    mesmo tempo (409 ao tentar). Não baixam estoque (são bens, não consumo).
  - **Embalagens = consumo:** baixam do estoque (como insumos), proporcional à colheita.
- **P5 — SKU visível + hectares na colheita:** todos os itens listados na OP mostram o **SKU**.
  No registro da colheita, exibir quanto a % equivale em **hectares** (`hectares_used × pct/100`).
- **P6 — Colheita determinística por destino + pragas:**
  - A colheita deixa de ser aleatória. O usuário informa **sacas por destino**:
    `sacks_industria`, `sacks_embalagem`, `sacks_descarte`. Cada destino entra no **item de
    estoque configurado** (Configurações → destinos da colheita). Substitui especial/superior/tradicional.
  - O `percentage_harvested` continua controlando **progresso** e o **consumo proporcional de
    insumos/embalagens**. `is_final` quando o progresso atinge 100%.
  - **Pragas:** permitir **encerrar a OP antes de 100%** (`POST /ordens/{id}/encerrar`, com motivo
    obrigatório gravado nas observações). A área restante fica livre para uma **nova OP** no mesmo
    talhão (com insumos de tratamento), validada pelo controle de hectares de P2.

## Decisões de produto (TRAVADAS)
- Destinos da colheita = 3 itens fixos de estoque, definidos no módulo Configurações (D1).
- Colunas `*_especial/superior/tradicional` em `production_orders`/`production_harvests` são
  **substituídas** por `*_industria/embalagem/descarte`.
- Alocação de pessoas: **requisitos por cargo** (não funcionários nominais). Remove
  `production_order_workers` e o endpoint `/ordens/funcionarios-em-producao`.
- "Revisão" de máquinas/veículos = **reserva exclusiva** enquanto a OP estiver ativa.
- **Custo de máquina/veículo entra no custo da OP** = `Σ(horas_acumuladas × stock_item.hourly_cost)`.
  As **horas são informadas de forma INCREMENTAL** por recurso, durante a produção: cada update/colheita
  pode trazer "horas a adicionar" para uma máquina; o valor é **somado** ao acumulado do recurso. Campo
  **nulo/omisso = não altera** o acumulado. (`hourly_cost` já existe em `stock_items`, Demanda 3.)
- **Padrão null-safe incremental (geral):** todo dado "alimentado ao longo da produção" (horas de máquina,
  e quaisquer outros acumuláveis) segue a mesma regra — valor informado é somado, campo nulo no update
  preserva o acumulado atual (espelha o `percentage_harvested`, que acumula).
- **Insumos restritos ao papel `insumo`:** o item escolhido como insumo da OP deve pertencer a uma
  categoria com o papel `insumo` (Configurações). Máquina/veículo/embalagem/insumo todos resolvidos por papel.
- **Relatórios com custo discriminado:** o custo da OP/safra é quebrado por tipo —
  insumos / pessoal / máquinas-veículos / embalagens / serviços — além do output por destino.

## Critérios de aceite
- [ ] Talhão com hectares; OP com hectares e validação de soma ≤ total do talhão.
- [ ] Requisitos por cargo/qtd/vínculo persistidos e exibidos; custo de pessoal recalculado.
- [ ] Máquinas/veículos reservados (409 em conflito); embalagens consumidas.
- [ ] Insumos da OP restritos a itens com papel `insumo` (item fora do papel → 400/oculto na UI).
- [ ] Horas de máquina/veículo acumuladas de forma incremental (null = não altera); custo da OP soma
      `Σ(horas × hourly_cost)`; custo total = insumos + pessoal + máquinas + embalagens + serviços.
- [ ] Relatórios discriminam o custo por tipo (insumos/pessoal/máquinas/embalagens/serviços).
- [ ] SKU visível na UI da OP; hectares exibidos no registro da colheita.
- [ ] Colheita por destino grava nos 3 itens-destino corretos; sem aleatoriedade.
- [ ] Encerrar OP antes de 100% com motivo; nova OP do restante funciona.
- [ ] `make reset-db` ok; seeds e relatórios do PCP coerentes com o novo modelo.

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md` (seção PCP),
> a seção "Regras transversais" de `docs/refac/README.md` e `backend/app/modules/pcp/model.py`.
> Confirme que as Demandas 2 e 3 estão aplicadas (`job_positions`, `stock_categories`,
> `category_role_assignments`, `app_settings`). `alembic heads` para o head.
>
> **Tarefa (uma migration por mudança lógica, ou poucas migrations agrupando coerentemente;
> todas idempotentes e reversíveis; `revision id` ≤ 32 chars; `down_revision` encadeado):**
> 1. `plots.total_hectares NUMERIC(10,2) NOT NULL DEFAULT 0`.
> 2. `production_orders.hectares_used NUMERIC(10,2) NOT NULL DEFAULT 0` e
>    `early_closed_reason TEXT NULL` (encerramento por praga).
> 3. **Renomear/realocar colunas de qualidade → destino** em `production_orders` e
>    `production_harvests`: adicione `*_industria`, `*_embalagem`, `*_descarte` (NUMERIC, mesmos
>    tipos), copie os dados históricos como best-effort (`especial→industria`, `superior→embalagem`,
>    `tradicional→descarte`) e **remova** as colunas antigas. `total_sacas`/`sacks_total` permanecem.
>    `production_harvests`: adicione `hectares_harvested NUMERIC(10,2) NULL`.
> 4. **Remover `production_order_workers`** e criar **`production_order_position_requirements`**:
>    `id UUID PK`, `production_order_id UUID FK (CASCADE)`, `position_id UUID FK → job_positions
>    (RESTRICT)`, `quantity INTEGER NOT NULL CHECK (quantity > 0)`,
>    `contract_type contract_type NOT NULL` (reusa a enum da Folha), timestamps. Índices nas FKs.
> 5. Criar **`production_order_resources`**: `id UUID PK`, `production_order_id UUID FK (CASCADE)`,
>    `stock_item_id UUID FK → stock_items (RESTRICT)`, `resource_role system_role NOT NULL`
>    (`maquina`/`veiculo`/`embalagem`), `quantity NUMERIC(12,3) NULL` (usada p/ embalagem),
>    `accumulated_hours NUMERIC(10,2) NOT NULL DEFAULT 0` (horas de uso acumuladas para
>    máquina/veículo — somadas de forma incremental durante a produção; base do custo
>    `horas × hourly_cost`), timestamps. Índices nas FKs. (A reserva de máquina/veículo é validada na
>    service por "item em OP ativa"; não precisa de constraint exclusiva no banco, mas adicione índice
>    em `stock_item_id` para a checagem ser rápida.)
> 6. Atualize `backend/scripts/seed.sql`: talhões com hectares, a OP concluída do seed com
>    `hectares_used` e sacas por destino (industria/embalagem/descarte), requisitos de cargo de
>    exemplo, e (opcional) 1 recurso de máquina. Remova referências a workers nominais e às
>    colunas de qualidade.
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `python scripts/reset_db.py` ok.
> SELECTs (cole): `\d production_orders`, `\d production_harvests`,
> `\d production_order_position_requirements`, `\d production_order_resources`, e
> `SELECT total_hectares FROM plots;`. Atualize `docs/database/schema.md`.

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend**. Leia `/.claude/agents/backend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/backend/{pcp,estoque,folha,configuracoes}.md` e os reais
> `backend/app/modules/pcp/*`. As migrations da Demanda 5 (DBA) **já estão aplicadas**.
> Use os helpers do módulo Configurações: `get_item_ids_by_role(db, role)` e
> `get_harvest_destination_item_ids(db)`.
>
> **P1/P2 — Hectares:**
> - `PlotCreate/Update/Out`: incluir `total_hectares` (obrigatório, > 0).
> - `ProductionOrderCreate/Out`: incluir `hectares_used` (> 0). Na criação, validar
>   `Σ(hectares_used das OPs ativas do talhão) + novo ≤ plot.total_hectares` (400 com o disponível).
>
> **P3 — Requisitos por cargo (substitui workers):**
> - `ProductionOrderCreate.position_requirements: [{ position_id, quantity>0, contract_type }]`.
>   Validar `position_id` existe (404). Persistir em `production_order_position_requirements`.
> - Remover o conceito de worker nominal e o endpoint `/ordens/funcionarios-em-producao`.
> - **Custo de pessoal** (estimado e realizado): `Σ(req.quantity × job_position.base_salary / 22 ×
>   max(1, dias))`, `dias = (data fim − início)`.
> - **Custo total da OP** = insumos + pessoal (por cargo) + **máquinas/veículos** + embalagens (consumo)
>   + serviços externos. **Máquinas/veículos:** `Σ(resource.accumulated_hours × stock_item.hourly_cost)`
>   sobre os recursos de papel maquina/veiculo (hourly_cost nulo conta como 0). Vale para estimated e
>   realized_cost.
>
> **Insumos por papel:** o seletor/validação de insumos da OP passa a exigir que o `stock_item` pertença
> a uma categoria com o papel `insumo` (via Configurações; item fora do papel → 400). Exponha um endpoint
> para o front listar os insumos elegíveis (ex.: `GET /api/pcp/insumos-disponiveis` ou reuse
> `GET /api/estoque/itens?role=insumo`).
>
> **P4 — Recursos (máquinas/veículos/embalagens):**
> - `ProductionOrderCreate.resources: [{ stock_item_id, resource_role, quantity?, hours? }]`.
>   Valide que o `stock_item` pertence a uma categoria com o papel informado (via Configurações).
> - **Máquina/veículo:** ao criar/iniciar, rejeitar (409) se o item já está em outra OP **ativa**
>   (status `planejada`/`em_execucao`/`pausada`/`em_producao`). Não baixam estoque. **Horas de uso:**
>   acumuladas em `accumulated_hours` de forma INCREMENTAL — na criação e em cada update/colheita, um
>   campo de "horas a adicionar" por recurso é **somado** ao acumulado; **campo nulo/omisso NÃO altera**
>   o acumulado (regra null-safe geral: vale para qualquer dado alimentado durante a produção).
> - **Embalagem:** trata como insumo de consumo — baixa proporcional à colheita (P6).
> - Exponha `GET /api/pcp/recursos-disponiveis?role=maquina` (itens do papel que **não** estão
>   reservados em OP ativa), para o front popular os selects.
>
> **P5 — SKU + hectares na colheita:**
> - `ProductionOrderOut` (inputs/resources): incluir `sku` de cada item.
> - `HarvestOut` e o retorno do `/colher`: incluir `hectares_harvested = hectares_used × pct/100`.
>
> **P6 — Colheita por destino + pragas:**
> - `HarvestCreate`: `{ percentage_harvested>0, sacks_industria>=0, sacks_embalagem>=0,
>   sacks_descarte>=0 }` com soma > 0. **Remova toda a aleatoriedade** (`random`,
>   `_simulate_harvest`).
> - Em `registrar_colheita`: valide progresso (`progress + pct ≤ 100`); consuma insumos **e
>   embalagens** proporcional a `pct` (baixa no estoque); registre **entradas** nos 3 itens-destino
>   (de `get_harvest_destination_item_ids`) com as sacas informadas; acumule por destino na OP;
>   `is_final` quando `progress ≥ 100`; calcule `realized_cost` no fechamento (insumos+pessoal+serviços).
> - **Encerrar por praga:** `POST /api/pcp/ordens/{id}/encerrar` (body `{ reason }`): marca a OP
>   `concluida` mesmo com `progress < 100`, grava `early_closed_reason`, libera os recursos
>   reservados e a área restante (não consome o restante de insumos). Após isso, uma nova OP no
>   mesmo talhão para os hectares restantes é permitida (validação de P2).
> - Atualize os relatórios (`gerar_relatorios`) para usar industria/embalagem/descarte E para
>   **discriminar o custo por tipo**: insumos / pessoal / máquinas-veículos / embalagens / serviços
>   (por OP e agregado da safra), além do output por destino.
>
> **Done quando (smoke tests — cole as saídas):**
> 1. Criar talhão (200 ha). Criar OP usando 120 ha; criar 2ª OP de 100 ha no mesmo talhão → 400
>    (excede 200). Criar 2ª de 80 ha → ok.
> 2. OP com requisito `MOTORISTA × 2 (clt)` e 1 máquina; criar 2ª OP ativa com a **mesma** máquina → 409.
> 3. `POST /ordens/{id}/colher` com `pct=50, sacks_industria=60, sacks_embalagem=30, sacks_descarte=10`
>    → SELECT em `stock_movements` mostrando entradas nos 3 itens-destino e baixa de insumos/embalagens;
>    `harvest_progress=50`; `hectares_harvested` correto.
> 4. `POST /ordens/{id}/encerrar` com motivo de praga → OP `concluida`, `early_closed_reason` gravado;
>    criar nova OP do restante de hectares ok.
> 5. `SELECT industria_sacas, embalagem_sacas, descarte_sacas FROM production_orders WHERE id=...;`
> 6. Insumo fora do papel: tentar criar OP com insumo de item SEM papel `insumo` → 400; com item de
>    papel `insumo` → ok.
> 7. Horas de máquina incrementais: criar OP com máquina e `hours=4`; em um update enviar `hours=3`
>    (sem mexer noutros campos) → `SELECT accumulated_hours` = 7; enviar update com `hours` nulo →
>    permanece 7; provar que o custo da OP reflete `7 × hourly_cost`.
> 8. Custo discriminado: `gerar_relatorios` retornando o custo quebrado por insumos/pessoal/
>    máquinas/embalagens/serviços (cole a saída).
> - Atualize `docs/backend/pcp.md` integralmente.

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend**. Leia `/.claude/agents/frontend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/frontend/pcp.md` e os reais
> `frontend/app/(modules)/pcp/page.tsx`, `frontend/services/pcp.ts`, e os componentes
> `TalhaoForm`, `OrdemProducaoForm`, `OrdemProducaoCard`, `ResultadoSafraDialog`.
> Use o serviço de Configurações (Demanda 3) para os papéis/destinos quando necessário.
>
> **Talhão:** `TalhaoForm` ganha campo **hectares** (obrigatório, > 0). `TalhaoCard` exibe os hectares.
>
> **OrdemProducaoForm (reescrita das seções):**
> - Campo **hectares usados** (com indicação do disponível no talhão escolhido).
> - **Insumos:** o select de insumos lista **apenas itens com papel `insumo`** (via
>   `getItens({role:"insumo"})` ou o endpoint de insumos-disponíveis). Exibir **SKU** de cada item.
> - **Equipe → Requisitos por cargo:** lista dinâmica de `{ cargo (Select de getCargos),
>   quantidade (number), vínculo (Select clt/pj/temporario) }`. Remover a seleção nominal de
>   funcionários e o "responsável".
> - **Recursos:** seções para **Máquinas**, **Veículos** e **Embalagens** (selects populados por
>   `getRecursosDisponiveis(role)` — itens não reservados; embalagens com quantidade). Mostrar SKU.
>   **Máquinas/Veículos:** campo **"horas a adicionar"** por recurso — INCREMENTAL: na criação informa as
>   horas iniciais e, nos updates durante a produção, o valor digitado é **somado** ao acumulado;
>   **deixar o campo vazio NÃO altera** o acumulado (regra null-safe). Exibir as **horas acumuladas** e o
>   custo `horas × custo/hora` de cada máquina.
> - **Serviços externos:** manter como está.
> - Carregar ao abrir: cargos, recursos disponíveis por papel, insumos, destinos.
>
> **OrdemProducaoCard:** exibir hectares, requisitos por cargo (cargo × qtd × vínculo), recursos
> (com badge "reservado"), e o resultado por destino (Indústria/Embalagem/Descarte). Botão
> **"Encerrar (praga)"** com Dialog de motivo obrigatório quando a OP está em execução.
>
> **Registro da colheita:** formulário com `percentage_harvested` e os 3 campos de sacas por
> destino (Indústria/Embalagem/Descarte). Ao digitar a %, exibir **"= X hectares"**
> (`hectares_used × pct/100`). `ResultadoSafraDialog` passa a mostrar os 3 destinos (sem
> Especial/Superior/Tradicional). O `ResultadoSafraDialog`/relatório também exibe o **custo
> discriminado** (insumos / pessoal / máquinas-veículos / embalagens / serviços), não só o total.
>
> **Tipos:** atualizar `Plot` (`total_hectares`), `ProductionOrder`
> (`hectares_used`, `*_industria/embalagem/descarte`, `position_requirements`, `resources`,
> `early_closed_reason`), `ProductionHarvest`, `ProductionResult`. Remover o tipo de worker nominal.
> Se a Demanda 0 estiver mergeada, usar `DataTable` nas listagens de OPs.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; no browser: criar talhão com
> hectares, OP com hectares+cargos+recursos (SKU visível, máquina reservada não reaparece em outra
> OP), registrar colheita por destino (com hectares exibidos), encerrar por praga e abrir nova OP do
> restante. Atualize `docs/frontend/pcp.md`.
</content>
