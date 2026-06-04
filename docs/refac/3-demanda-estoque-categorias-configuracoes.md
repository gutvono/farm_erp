# Demanda 3 — Estoque: Categorias Configuráveis + Módulo Configurações

## Contexto
Hoje a categoria do item é um **enum fixo** (`stock_category`: `cafe`/`insumo`/`veiculo`/
`equipamento`/`outro`, ver `docs/backend/estoque.md`). PCP e Comercial dependem desse enum
(ex.: filtram `category == cafe`, `category == veiculo`). O cliente quer **categorias
criadas pelo usuário**. Para que o sistema continue "sabendo" o que é máquina, veículo,
embalagem, produto final etc., criaremos um **módulo Configurações** (novo, no sidebar) que
mapeia **categoria → papel de sistema**.

> Frase do cliente: *"Se criarmos categorias fixas, as novas criadas pelo usuário serão
> inúteis. Podemos fazer um módulo de configuração... para o PCP enxergar o que é maquinário.
> Se o usuário definir que insumo é máquina, o PCP enxergará isso."*

Releia: `docs/backend/estoque.md`, `docs/frontend/estoque.md`, `docs/backend/pcp.md`,
`docs/backend/comercial.md`, `docs/database/schema.md`, e os reais
`backend/app/modules/estoque/*`, `backend/app/shared/enums.py`, e **faça um grep** por
`StockCategory`/`stock_category`/`category ==` em todo o backend e frontend para mapear o impacto.

## Objetivo
1. **`stock_categories`** (tabela, CRUD pelo usuário); `stock_items.category_id` FK (1 categoria por item).
2. **Módulo Configurações** (sidebar novo): CRUD de categorias + mapeamento **categoria → papel
   de sistema** + definição dos **3 itens-destino da colheita** (Indústria/Embalagem/Descarte).
3. Estoque: dropdown de categoria no cadastro de item; **filtros avançados** na aba Movimentações
   (texto, data, tipo, módulo, ordenação) — sobre a infra paginada da Demanda 0.

## Decisões de produto (TRAVADAS)
- Cardinalidade item↔categoria = **FK única** (`stock_items.category_id`).
- **Papéis de sistema** (`system_role`) consumidos pelo resto do sistema:
  `maquina`, `veiculo`, `embalagem`, `insumo`, `produto_final`, `produto_inacabado`,
  `produto_descartado`, `produto_vendavel`.
- Relação **categoria ↔ papel = M:N** (uma categoria pode ter mais de um papel; um papel pode
  abranger várias categorias). Ex.: a categoria "Sacarias" pode ser `embalagem`; a categoria
  "Café Beneficiado" pode ser `produto_final` **e** `produto_vendavel`.
- **Itens-destino da colheita (D1):** o Configurações guarda qual `stock_item` recebe a saída de
  Indústria, de Embalagem e de Descarte. (Usados pela Demanda 5/PCP.)
- Migração do enum: cada valor atual vira uma categoria seed (`Café`, `Insumo`, `Veículo`,
  `Equipamento`, `Outro`) e recebe papéis default sensatos (ver DBA).

## Critérios de aceite
- [ ] `stock_categories` + `stock_items.category_id` (NOT NULL após backfill); enum `stock_category` removido do fluxo.
- [ ] Módulo Configurações no sidebar: CRUD de categorias, atribuição de papéis, escolha dos 3 itens-destino.
- [ ] Cadastro de item de estoque usa dropdown de categoria existente.
- [ ] **Nenhuma regressão**: todos os usos antigos de `category == X` migrados para `category_id`/papéis (PCP e Comercial inclusos).
- [ ] Aba Movimentações com filtros: texto (descrição/item), intervalo de datas, tipo, módulo, ordenação por data/valor/quantidade.
- [ ] `make reset-db` ok; seeds atualizados (categorias + papéis + itens-destino).

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md`, a seção
> "Regras transversais" de `docs/refac/README.md`, `backend/app/modules/estoque/model.py`
> e `backend/app/shared/enums.py`.
>
> **Tarefa — sair do enum para tabela de categorias + tabelas do módulo Configurações.**
> 1. `alembic heads` para confirmar o head.
> 2. Crie **`stock_categories`**: `id UUID PK`, `name VARCHAR(120) UNIQUE NOT NULL`,
>    `description TEXT NULL`, `is_active BOOLEAN DEFAULT true`, timestamps, `deleted_at`. Índice em `name`.
> 3. Crie a enum `system_role` (Postgres) com: `maquina, veiculo, embalagem, insumo,
>    produto_final, produto_inacabado, produto_descartado, produto_vendavel`.
> 4. Crie **`category_role_assignments`** (M:N): `id UUID PK`, `category_id UUID FK → stock_categories`,
>    `role system_role NOT NULL`, timestamps. UNIQUE (`category_id`, `role`). Índices nas FKs.
> 5. Crie **`app_settings`** (key-value de configuração): `id UUID PK`, `key VARCHAR(100) UNIQUE NOT NULL`,
>    `value VARCHAR(500) NULL`, timestamps. (Guardará os ids dos itens-destino da colheita:
>    chaves `harvest_destination_industria_item_id`, `harvest_destination_embalagem_item_id`,
>    `harvest_destination_descarte_item_id`.)
> 6. **Migração de dados** (mesma migration, idempotente):
>    - Inserir uma `stock_categories` por valor do enum atual: `Café`(cafe), `Insumo`(insumo),
>      `Veículo`(veiculo), `Equipamento`(equipamento), `Outro`(outro).
>    - Atribuir papéis default: Café → `produto_final`+`produto_vendavel`; Insumo → `insumo`;
>      Veículo → `veiculo`; Equipamento → `maquina`; Outro → (nenhum).
>    - Adicionar `stock_items.category_id UUID NULL` FK → `stock_categories` (índice).
>    - Backfill `category_id` a partir do enum atual de cada item; tornar NOT NULL.
>    - **Remover** a coluna enum `stock_items.category`. `downgrade()` recria a coluna enum
>      e repopula a partir do `name` da categoria.
>    - `revision id` ≤ 32 chars (`00NN_stock_categories`), `down_revision` = head atual.
> 7. Atualize `backend/scripts/seed.sql`: criar as categorias acima + papéis + 3 chaves de
>    `app_settings` apontando para itens de café do seed (industria/embalagem) e um item de
>    descarte (crie um item "Café Descarte" categoria com papel `produto_descartado`).
>    Ajuste os inserts de `stock_items` para usar `category_id`.
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `python scripts/reset_db.py` ok.
> SELECTs (cole): `SELECT name FROM stock_categories;`,
> `SELECT c.name, a.role FROM category_role_assignments a JOIN stock_categories c ON c.id=a.category_id;`,
> `SELECT key,value FROM app_settings;`, e `SELECT count(*) FROM stock_items WHERE category_id IS NULL;` (=0).
> Atualize `docs/database/schema.md`.

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend**. Leia `/.claude/agents/backend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/backend/{estoque,pcp,comercial}.md` e os reais
> `backend/app/modules/estoque/*`. **Antes de codar, rode um grep** por `StockCategory`,
> `stock_category`, `category ==`, `.category` no backend para listar TODOS os pontos que hoje
> dependem do enum (PCP, Comercial, schemas, services) — você terá que migrar todos.
> As tabelas `stock_categories`, `category_role_assignments`, `app_settings` e a FK
> `stock_items.category_id` **já existem** (Demanda 3 DBA).
>
> **Tarefa A — Módulo Configurações (novo):** crie `backend/app/modules/configuracoes/`
> (`model.py` reaproveitando os models do DBA, `repository.py`, `service.py`, `router.py`,
> `schemas.py`) e registre o router em `app/main.py` sob `/api/configuracoes`.
> - Categorias: `GET/POST/PUT/DELETE /categorias` (soft delete; bloquear exclusão de categoria
>   com itens vinculados → 400).
> - Papéis: `GET /papeis` (lista os `system_role` possíveis), `PUT /categorias/{id}/papeis`
>   (define o conjunto de papéis da categoria — substitui as assignments).
> - Itens-destino da colheita: `GET /destinos-colheita` e `PUT /destinos-colheita`
>   (`{ industria_item_id, embalagem_item_id, descarte_item_id }`, gravados em `app_settings`).
>   Validar que os itens existem.
> - Exponha **helpers públicos** para outros módulos (PCP/Comercial) importarem:
>   `get_item_ids_by_role(db, role) -> list[UUID]`, `get_categories_by_role(db, role)`,
>   `get_harvest_destination_item_ids(db) -> {industria, embalagem, descarte}`.
>
> **Tarefa B — Estoque:** 
> - `StockItemCreate/Update/Out` passam a usar `category_id` (+ `category_name` no Out).
>   Validar que a categoria existe (404). Remover o enum do schema.
> - `GET /api/estoque/itens` aceita filtro `category_id` (e opcional `role`).
> - **Movimentações (filtros avançados)** sobre a infra paginada da Demanda 0: adicione a
>   `GET /api/estoque/movimentacoes` os filtros `search` (ILIKE em `description` e nome do item),
>   `start_date`/`end_date` (sobre `occurred_at`), além de `movement_type`, `source_module`,
>   `stock_item_id`, e ordenação por `occurred_at`/`quantity`/`total_value`/`unit_cost`.
>
> **Tarefa C — Migrar dependências do enum:** atualize PCP e Comercial (e qualquer outro ponto
> achado no grep) para deixar de usar `category == X`:
> - Comercial (itens vendáveis): usar `configuracoes_service.get_item_ids_by_role(db, "produto_vendavel")`.
> - PCP (insumos / máquinas / veículos / embalagens): usar os papéis correspondentes.
>   (Os endpoints específicos do PCP serão expandidos na Demanda 5; aqui apenas **não quebre** o que existe.)
>
> **Done quando (smoke tests — cole as saídas):**
> - Criar categoria via `POST /api/configuracoes/categorias`; atribuir papéis; criar item de estoque
>   com `category_id`; `GET /itens?role=produto_vendavel` retornando o esperado.
> - `PUT /destinos-colheita` e `GET /destinos-colheita` persistindo em `app_settings` (SELECT provando).
> - `GET /movimentacoes?search=...&start_date=...&order_by=total_value&order_dir=desc&page=1&page_size=10`.
> - Suba o backend e confirme que **Comercial e PCP** não quebraram (liste itens vendáveis / criar venda).
> - Crie `docs/backend/configuracoes.md`; atualize `docs/backend/estoque.md` (categorias + filtros).

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend**. Leia `/.claude/agents/frontend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/frontend/estoque.md`, e os reais
> `frontend/components/layout/Sidebar.tsx`, `frontend/app/(modules)/estoque/page.tsx`,
> `frontend/services/estoque.ts`, `frontend/components/modules/estoque/{StockItemForm,MovimentacoesTable}.tsx`.
>
> **Tarefa A — Módulo Configurações (novo no sidebar):**
> - Adicione item "Configurações" no `Sidebar` (ícone de engrenagem) → rota `/configuracoes`.
> - Página `app/(modules)/configuracoes/page.tsx` com abas:
>   - **Categorias:** CRUD (criar/editar/excluir, AlertDialog; erro do backend ao excluir com vínculo).
>   - **Papéis de sistema:** por categoria, multi-select dos papéis (`maquina`, `veiculo`, `embalagem`,
>     `insumo`, `produto_final`, `produto_inacabado`, `produto_descartado`, `produto_vendavel`).
>     Texto de ajuda explicando o que cada papel habilita (ex.: "produto_vendavel: aparece na venda do Comercial").
>   - **Destinos da colheita:** 3 selects de item de estoque (Indústria / Embalagem / Descarte),
>     salvando via `PUT /destinos-colheita`.
> - `services/configuracoes.ts` orquestrando as chamadas; tipos em `types/`.
> - Use `DataTable` (Demanda 0) nas listas.
>
> **Tarefa B — Estoque:**
> - `StockItemForm`: campo categoria vira `Select` carregado de `getCategorias()`. Sem enum hardcoded.
> - Aba **Movimentações**: adicionar filtros de **texto** (busca), **intervalo de datas**, **tipo** e
>   **módulo**, com ordenação por data/valor/quantidade — tudo server-side via a API paginada.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; no browser: criar categoria,
> atribuir papel, definir destinos da colheita; cadastrar item escolhendo categoria; filtrar
> movimentações por texto+data+tipo+módulo com paginação/ordenação. Crie
> `docs/frontend/configuracoes.md`; atualize `docs/frontend/estoque.md`.
</content>
