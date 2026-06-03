# Demanda 0 — Infra de Paginação Genérica + DataTable

## Contexto
Hoje as listas do sistema retornam arrays simples e o frontend exibe **cards**.
Conforme o volume cresce, precisamos de **paginação** padronizada e de uma **tabela
reutilizável** (shadcn) para não reescrever paginação em cada módulo. Esta demanda
cria a **fundação** que as demandas seguintes (1–7) vão consumir. **Não muda regra
de negócio** — só infraestrutura.

## Objetivo
1. Backend: um contrato genérico de resposta paginada `Page[T]` + parâmetros de
   paginação/ordenação padronizados, aplicável em qualquer repository/router.
2. Frontend: tipos genéricos `Paginated<T>`, um helper de fetch paginado e um
   componente `DataTable` (shadcn) reutilizável com ordenação por coluna, estados de
   loading/empty e controles de paginação.
3. **Migrar 1 módulo-piloto** (Estoque → aba Movimentações OU Compras → Fornecedores)
   ponta a ponta para validar a infra. Os demais módulos migram nas suas demandas.

## Decisões de produto
- Formato de página padrão (resposta da API):
  ```json
  { "items": [ ... ], "total": 137, "page": 1, "page_size": 20, "pages": 7 }
  ```
- Query params padrão: `page` (1-based, default 1), `page_size` (default 20, max 100),
  `order_by` (nome de coluna permitida), `order_dir` (`asc`|`desc`), `search` (texto livre opcional).
- **Retrocompatibilidade:** endpoints já existentes que hoje retornam array **não
  podem quebrar** nesta demanda. Estratégia: criar os utilitários e aplicá-los só no
  módulo-piloto; os demais migram nas suas próprias demandas (a 7 fecha o resto).

## Critérios de aceite
- [ ] `Page[T]` genérico disponível em `app/shared/` e usável por qualquer router.
- [ ] Helper de paginação no repository (aplica `limit/offset`, conta `total`, valida `order_by` contra allowlist).
- [ ] `DataTable` genérico no frontend com ordenação clicável, paginação e empty/loading.
- [ ] Módulo-piloto migrado e funcionando (lista paginada, ordenação, troca de página).
- [ ] `npm run build` + `npm run lint` ok; `alembic check` limpo (se houver índice novo).
- [ ] Docs atualizadas: criar `docs/backend/_shared-paginacao.md` e `docs/frontend/_shared-datatable.md`.

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA** do Coffee Farm ERP. Leia `/.claude/agents/dba.md`,
> `docs/database/schema.md` e a seção "Regras transversais" de `docs/refac/README.md`.
>
> **Tarefa:** garantir que as colunas usadas como ordenação padrão das listas tenham
> índice, para a paginação ordenada não fazer full scan.
>
> 1. Confirme o head atual: `docker compose exec backend poetry run alembic heads`.
> 2. Revise os models em `backend/app/modules/*/model.py` e identifique as colunas
>    candidatas a ordenação default das listagens (`created_at`, `occurred_at`,
>    `due_date`, `ordered_at`, `name`). Liste quais **já** têm índice e quais não têm.
> 3. Crie **uma** migration idempotente e reversível adicionando os índices faltantes
>    apenas para as colunas que serão ordenáveis nas listas (não exagere — só o que
>    falta). Use `CREATE INDEX IF NOT EXISTS` / guard. `revision id` ≤ 32 chars,
>    padrão `00NN_add_sort_indexes`, `down_revision` = head atual.
> 4. Se **não** houver índice faltando, **não crie migration**; apenas documente isso.
>
> **Done quando:**
> - `docker compose build backend && docker compose up -d backend`
> - `docker compose exec backend poetry run alembic upgrade head` ok
> - `docker compose exec backend poetry run alembic check` → "No new upgrade operations detected"
> - Smoke: `docker compose exec postgres psql -U postgres -d coffee_farm_erp -c "\di"`
>   mostrando os índices criados (cole a saída).
> - Atualize `docs/database/schema.md` listando os índices adicionados (ou registre que nenhum foi necessário).

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend** do Coffee Farm ERP. Leia `/.claude/agents/backend.md`, a seção
> "Regras transversais" de `docs/refac/README.md`, e os arquivos
> `backend/app/shared/` (todos), `backend/app/shared/responses.py` e um router/repository
> de exemplo (`backend/app/modules/estoque/router.py` + `repository.py`).
>
> **Tarefa — contrato de paginação genérico, sem mudar regra de negócio.**
>
> 1. Em `backend/app/shared/`, crie:
>    - `pagination.py` com:
>      - `PageParams` (Pydantic/常dataclass): `page:int>=1=1`, `page_size:int 1..100 =20`,
>        `order_by:str|None`, `order_dir:Literal["asc","desc"]="desc"`, `search:str|None`.
>      - `Page[T]` (Pydantic `Generic[T]`): campos `items`, `total`, `page`,
>        `page_size`, `pages` (calculado).
>      - Um dependency `get_page_params()` para os routers (lê query params).
>    - Um helper de repository `paginate_query(query, params, *, allowed_order_by: dict[str, ColumnElement], default_order)` que:
>      - valida `order_by` contra a allowlist (cai no default se inválido — nunca 500),
>      - aplica `ORDER BY` + `LIMIT/OFFSET`,
>      - retorna `(items, total)` com `total` via `func.count()` na query base (antes do limit).
> 2. **Aplique no módulo-piloto: Estoque → `GET /api/estoque/movimentacoes`.**
>    - Aceite `page`, `page_size`, `order_by` (allowlist: `occurred_at`, `quantity`,
>      `total_value`, `unit_cost`), `order_dir`, além dos filtros já existentes
>      (`stock_item_id`, `movement_type`, `source_module`).
>    - Resposta passa a ser `Page[StockMovementOut]`. Mantenha `occurred_at desc` como default.
>    - **Não** altere os outros endpoints de estoque nesta demanda.
> 3. Tipagem estrita, mensagens em português, sem lógica no router.
>
> **Done quando:**
> - Container sobe; `GET /api/estoque/movimentacoes?page=1&page_size=5&order_by=occurred_at&order_dir=desc`
>   retorna o envelope `{items,total,page,page_size,pages}`.
> - **Smoke tests** (cole as saídas):
>   - `curl` autenticado nos parâmetros acima (página 1 e página 2) mostrando itens diferentes.
>   - `docker compose exec postgres psql -U postgres -d coffee_farm_erp -c "SELECT count(*) FROM stock_movements;"`
>     batendo com o `total` retornado.
> - Crie `docs/backend/_shared-paginacao.md` documentando `PageParams`, `Page[T]`,
>   `paginate_query` e como aplicar em um novo endpoint (passo a passo).

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend** do Coffee Farm ERP. Leia `/.claude/agents/frontend.md`, a seção
> "Regras transversais" de `docs/refac/README.md`, `frontend/services/api.ts`,
> `frontend/components/ui/table.tsx` e o serviço/página do módulo-piloto
> (`frontend/services/estoque.ts`, `frontend/components/modules/estoque/MovimentacoesTable.tsx`).
>
> **Tarefa — infra de tabela paginada reutilizável.**
>
> 1. Em `frontend/types/`, adicione o tipo genérico:
>    ```ts
>    export interface Paginated<T> { items: T[]; total: number; page: number; page_size: number; pages: number }
>    ```
> 2. Em `frontend/lib/` (ou `services/`), crie um helper `fetchPaginated<T>(url, params)`
>    que monta a query string (`page`, `page_size`, `order_by`, `order_dir`, `search`,
>    + filtros extras) e converte os Decimals (string→number) como já é feito no projeto.
> 3. Crie `frontend/components/ui/data-table.tsx` (shadcn `Table` por baixo), genérico:
>    - Props: `columns` (label, key, `sortable?`, `align?`, `render?`), `rows`,
>      `loading`, `emptyMessage`, `page`, `pageSize`, `total`, `pages`,
>      `onPageChange`, `sort` (`{by, dir}`), `onSortChange`.
>    - Cabeçalho clicável nas colunas `sortable` (alterna asc/desc, mostra seta).
>    - Rodapé com "Mostrando X–Y de N", botões Anterior/Próxima e indicador de página.
>    - Estados: skeleton/loading e empty.
>    - Sem `any`; tipar com generics `<T>`.
> 4. **Migre o módulo-piloto:** reescreva a aba **Movimentações** do Estoque para usar
>    `DataTable` + `fetchPaginated`, com ordenação server-side e paginação real
>    (consumindo o `Page` do backend). Mantenha os filtros existentes.
>
> **Done quando:**
> - `npm run build` e `npm run lint` sem erros; nenhum `any`.
> - Na tela de Estoque → Movimentações: trocar de página busca dados novos, clicar no
>   cabeçalho reordena via API, e o rodapé mostra a contagem correta.
> - Crie `docs/frontend/_shared-datatable.md` documentando as props do `DataTable`,
>   o helper `fetchPaginated` e um exemplo de adoção em outro módulo.
</content>
