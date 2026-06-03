# Demanda 7 — Front-end Geral: Cards → Tabelas shadcn + Paginação (varredura final)

## Contexto
O cliente quer trocar os **cards** que listam informações por **tabelas elegantes** (shadcn),
mantendo o mesmo conteúdo (títulos, nomes, botões de edição/cancelamento etc.) e adicionando
**paginação** pensando em escala. A infra (`DataTable` + `Page[T]` + `fetchPaginated`) já foi
criada na **Demanda 0**. Esta demanda é a **varredura final**: migra as telas que ainda usam
cards e garante que toda lista tenha paginação server-side.

Releia: `docs/refac/0-demanda-infra-paginacao.md`, `docs/frontend/_shared-datatable.md`,
`docs/backend/_shared-paginacao.md`, e a doc de cada módulo em `docs/frontend/*` e `docs/backend/*`.

## Objetivo
Padronizar todas as listagens do sistema em tabela paginada, sem perder funcionalidade.

## Escopo — checklist de telas (migrar o que ainda estiver em card/array)
> Algumas já podem ter sido migradas nas suas próprias demandas. **Verifique o estado atual de
> cada uma** e migre apenas o que faltar. Não regredir nada.

| Módulo | Lista | Observação |
|--------|-------|-----------|
| Comercial | Clientes, Vendas | provavelmente ainda em card |
| Compras | Ordens de Compra, Cotações | Fornecedores já na Demanda 6 |
| Faturamento | Faturas | parte na Demanda 1; **filtros avançados pedidos pelo cliente** (ver nota abaixo) |
| Financeiro | Pagar/Receber/Movimentações | feito na Demanda 4 — só conferir |
| Estoque | Itens, Recebimentos | Movimentações já na Demanda 0/3 |
| Folha | Funcionários, Holerites, Cargos | parte nas Demandas 2/4 |
| PCP | Ordens, Talhões, Atividades | parte na Demanda 5 |
| Dashboard | listas/quadros, se houver | manter KPIs/gráficos |

## Decisões de produto (TRAVADAS)
- **Não perder conteúdo:** toda informação que o card mostrava deve aparecer na tabela (como
  coluna) ou no detalhe (Sheet/Dialog ao clicar na linha). Manter botões de editar, cancelar,
  status, PDF etc.
- **Paginação server-side** em todas as listas (consumindo `Page[T]`). Ordenação por colunas-chave.
- Manter a identidade visual shadcn/Tailwind já usada; responsivo.
- **Faturamento — filtros avançados (pedido do cliente, 2026-06-03):** a tela de Faturas deve, além
  da tabela paginada, oferecer **ordenação por colunas** (emissão, vencimento, valor, número),
  **busca textual** e **filtro por intervalo de data** (emissão início/fim; vencimento opcional),
  no mesmo padrão das tabelas de movimentações. No **front**, os date-range usam date pickers e o
  estado de query mora num hook por módulo (ex.: `useFaturas.ts`), espelhando `useMovimentacoes.ts`;
  a `DataTable` permanece de apresentação. O deep-link `?order_id` da Demanda 1.1 deve continuar
  funcionando como filtro pré-aplicado.

## Critérios de aceite
- [ ] Nenhuma listagem principal usando card simples sem paginação (salvo onde card é proposital, ex.: cards de KPI do dashboard).
- [ ] Todas as listas paginadas e ordenáveis via API.
- [ ] Conteúdo e ações preservados (nada some em relação aos cards).
- [ ] `npm run build` + `npm run lint` sem erros; sem `any`.

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md` e a seção
> "Regras transversais" de `docs/refac/README.md`.
>
> **Tarefa:** revisar os índices de ordenação das listas que serão paginadas nesta varredura
> (Comercial: `sales.sold_at`, `clients.name`; Compras: `purchase_orders.ordered_at`;
> Faturamento: `invoices.issue_date`; PCP: `production_orders.created_at`, `plots.name`).
> Adicione, em **uma** migration idempotente/reversível, apenas os índices que faltarem (não
> duplique os criados na Demanda 0). Se nada faltar, não crie migration e documente.
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `\di` no psql (cole);
> `docs/database/schema.md` atualizado (ou registro de que nenhum índice foi necessário).

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend**. Leia `/.claude/agents/backend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/backend/_shared-paginacao.md` e a doc de cada módulo.
>
> **Tarefa:** garantir que **todos** os endpoints de listagem principais retornem `Page[T]`
> (usando `PageParams`/`paginate_query` da Demanda 0), com filtros e ordenação coerentes:
> - Comercial: `GET clientes`, `GET vendas` (filtros: status, busca por nome; ordenar por data/total).
> - Compras: `GET ordens` (status, fornecedor, busca; ordenar por data/total), `GET cotacoes`.
> - Faturamento: `GET faturas` — **escopo ampliado (pedido do cliente)**: paginar via `Page[T]`;
>   filtros `status`, `tipo` (invoice_type), **`order_id`** (já implementado na Demanda 1.1, manter),
>   **intervalo de data de emissão (`issue_after`/`issue_before`)** e, se viável, de vencimento
>   (`due_after`/`due_before`); busca textual (`search`) sobre número/cliente-fornecedor/notes;
>   ordenação por **emissão, vencimento, valor e número** (allowlist de `order_by`). Espelhar o
>   padrão das movimentações (Demanda 0/4): date-range como em `financeiro /movimentacoes`
>   (`start_date`/`end_date`) e sort server-side como em `estoque /movimentacoes`.
> - Estoque: `GET itens` (categoria, busca; ordenar por nome/quantidade), `GET recebimentos`.
> - Folha: `GET funcionarios` (contrato, ativo, busca), `GET cargos`.
> - PCP: `GET ordens`, `GET talhoes`, `GET atividades`.
> - **Mantenha retrocompatibilidade onde já consumido**: padronize o envelope `Page[T]` e ajuste
>   os services do front (a parte FRONT desta demanda acompanha). **Não** quebre endpoints que a
>   Demanda 4 já paginou; apenas confirme.
> - Allowlist de `order_by` por endpoint (nunca 500 em coluna inválida).
>
> **Done quando (smoke tests — cole as saídas):** para cada endpoint migrado, um `curl` com
> `page/page_size/order_by/order_dir` retornando o envelope e o `total` batendo com um
> `SELECT count(*)` no psql. Atualize as docs `docs/backend/*` afetadas.

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend**. Leia `/.claude/agents/frontend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/frontend/_shared-datatable.md` e a doc de cada módulo.
>
> **Tarefa — varredura:** para **cada** tela do checklist da demanda que ainda use cards/array,
> migre para `DataTable` (Demanda 0) com paginação server-side e ordenação por colunas-chave:
> 1. Defina as **colunas** preservando tudo que o card mostrava (título, nome, badges de status,
>    datas, valores). Ações (editar, cancelar, pagar, PDF, expandir detalhe) vão para uma coluna de
>    ações e/ou para um `Sheet`/`Dialog` de detalhe ao clicar na linha.
> 2. Ajuste os `services/*.ts` para consumir o envelope `Page[T]` (use `fetchPaginated`).
> 3. Mantenha filtros existentes; adicione busca textual onde fizer sentido.
> 4. Não regredir comportamentos (toasts, loading, AlertDialog de confirmação, geração de PDF).
> 5. **Não** transforme cards de **KPI** do Dashboard em tabela — esses permanecem como cards/gráficos.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; no browser, cada lista migrada
> mostra os dados em tabela, pagina, ordena e preserva todas as ações. Faça um diff de paridade
> (card antigo × tabela nova) por tela e registre nas docs `docs/frontend/*` afetadas.
</content>
