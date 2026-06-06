# Refatoração Coffee Farm ERP — Índice Mestre das Demandas

> Documento de coordenação do PO. Cada demanda tem um arquivo numerado com **3 prompts
> autocontidos** (DBA → BACKEND → FRONTEND, nessa ordem). Uma demanda = uma branch =
> um PR para `main` = teste em prod → próxima demanda.

## Como usar este pacote

1. Abra o arquivo da demanda corrente (ex.: `1-demanda-faturamento-cancelamento-nf.md`).
2. Rode o **prompt do DBA** em um agente novo. Aguarde o "done" (com smoke tests SQL).
3. Rode o **prompt do BACKEND**. Aguarde o "done".
4. Rode o **prompt do FRONTEND**. Aguarde o "done".
5. Valide os critérios de aceite da demanda, abra o PR, teste em prod, siga para a próxima.

Cada prompt é **self-contained**: pode ser colado em um agente sem contexto prévio.
Os prompts mandam o agente **ler os arquivos relevantes antes de codar** (regra do
projeto: nunca criar sem ler o que já existe).

---

## Sequência definida (infra-first)

| Ordem | Arquivo | Branch sugerida | Depende de |
|-------|---------|-----------------|------------|
| 0 | `0-demanda-infra-paginacao.md` | `feat/infra-paginacao` | — |
| 1 | `1-demanda-faturamento-cancelamento-nf.md` | `feat/faturamento-cancelamento` | 0 |
| 2 | `2-demanda-folha-cargos.md` | `feat/folha-cargos` | 0 |
| 3 | `3-demanda-estoque-categorias-configuracoes.md` | `feat/estoque-categorias-config` | 0 |
| 4 | `4-demanda-financeiro-filtros-aprovacao-folha.md` | `feat/financeiro-aprovacao-folha` | 0, 2 |
| 5 | `5-demanda-pcp-refac.md` | `feat/pcp-refac` | 2, 3, 4 |
| 6 | `6-demanda-compras-fornecedor-cotacao.md` | `feat/compras-fornecedor-cotacao` | 0, 3 |
| 7 | `7-demanda-frontend-geral-tabelas.md` | `feat/frontend-geral-tabelas` | 0 e todas |
| 8 | `8-demanda-pcp-melhorias-colega.md` | _(backlog / avaliação)_ | 5 |

**Por que esta ordem:** o PCP (5) é a maior refatoração e depende de Cargos (2),
do módulo Configurações + categorias de Estoque (3) e do fluxo de aprovação do
Financeiro (4). A infra de paginação (0) vem primeiro para que toda tela nova
nasça em tabela paginada e o front-geral (7) só precise *retrofitar* o legado.

---

## Decisões de produto travadas (não reabrir sem avisar o PO)

### D1 — Colheita do PCP por destino (não mais aleatória)
- A colheita deixa de ser aleatória (`random.uniform`) e de distribuir em
  Especial/Superior/Tradicional.
- Passa a ser **determinística por destino**, informado pelo usuário no registro
  da colheita: **Indústria**, **Embalagem**, **Descarte** (em sacas).
- Há **3 itens de estoque fixos** que recebem a produção, um por destino. Quais
  itens são esses é **configurável no módulo Configurações** (Demanda 3): o admin
  escolhe qual `stock_item` recebe a saída de Indústria, de Embalagem e de Descarte.
- As colunas `*_especial/superior/tradicional` em `production_orders` e
  `production_harvests` são **substituídas** por `*_industria/embalagem/descarte`.

### D2 — Categorias de Estoque configuráveis (tabela, não enum)
- Sai o enum `stock_category`. Entra a tabela **`stock_categories`** (criada/editada
  pelo usuário).
- **Cardinalidade: 1 categoria por item** → `stock_items.category_id` FK.
- No cadastro do item, a categoria é um **dropdown** das categorias já existentes.

### D3 — Novo módulo "Configurações" (sidebar)
- Como as categorias são livres, o sistema não pode "adivinhar" o que é máquina,
  veículo, embalagem, produto final etc. O módulo **Configurações** define o
  mapeamento **categoria → papel de sistema** (`system_role`).
- Exemplo do cliente: "se o usuário definir que a categoria *Insumos* é *máquina*,
  o PCP passa a enxergar os itens dessa categoria como máquina."
- Papéis de sistema necessários (consumidos por PCP/Comercial):
  `maquina`, `veiculo`, `embalagem`, `insumo`, `produto_final`,
  `produto_inacabado`, `produto_descartado`, `produto_vendavel`.
- O módulo Configurações também guarda os **3 itens-destino da colheita** (D1).

### D4 — Cancelamento de NF de Venda
- Cancelar a NF de Venda **cancela ponta a ponta**: estorna a NF, **cancela a venda
  associada**, **volta os produtos ao estoque** e **cancela a(s) conta(s) a receber
  vinculada(s)**, gerando os estornos financeiros. Estado consistente entre módulos.

### D5 — Cargos da Folha
- Cargo deixa de ser texto livre. Vira tabela **`roles`/`job_positions`** com salário
  base sugerido. Funcionário referencia o cargo por FK; UI usa dropdown.

### D6 — Aprovação financeira da Folha + NF de folha
- Pagamento de funcionário (individual ou em lote) deixa de sair direto da conta.
  Passa a gerar uma **solicitação de aprovação** que aparece na aba *Aprovações* do
  Financeiro (igual a uma compra). Só após o financeiro aprovar é que o dinheiro sai.
- Ao aprovar, gera **uma NF de folha de pagamento por funcionário** (novo
  `invoice_type = "folha_pagamento"`).

### D7 — Catálogo de fornecedor (produto ↔ fornecedor) + bloqueio de compra de avariado
- Entra uma tabela **`supplier_items`** ligando **fornecedor ↔ item de estoque**, com
  **preço por fornecedor**. Não temos acesso ao estoque do fornecedor → o item do catálogo
  é tratado como **estoque infinito** (sempre disponível para comprar).
- **Fluxo de compra invertido (front):** seleciona-se o **produto primeiro**; o dropdown de
  fornecedores mostra **apenas os fornecedores que vendem aquele item**. A ordem continua com
  **um fornecedor**; após escolhê-lo, os demais itens da ordem ficam restritos ao catálogo dele
  (preço sugerido do catálogo, editável).
- **Avariado deixa de ser comprável por consequência:** como o seletor de itens da compra passa a
  vir do **catálogo do fornecedor** (e ninguém cadastra item `…-AVARIADO` no catálogo), itens
  avariados nunca aparecem na compra. Pendência conhecida (comprar avariado) **resolvida por aqui**.
- **Escopo:** este catálogo é **ampliação da Demanda 6** (que passa a ser "Fornecedor + Catálogo").

---

## Regras transversais (TODO prompt já as inclui, mas ficam aqui como referência)

### Arquitetura
- Backend: `Router → Service → Repository → DB`. Nunca pular camadas. Lógica só no Service.
- Frontend: `Page → Service → API`. Componentes "burros". Sem `fetch` em componente.
- Idioma: **código em inglês**, **UI e mensagens em português**. TypeScript sem `any`.

### Documentação (passo fundamental — não é etapa final opcional)
- Documentar é **parte da entrega**. Nenhuma demanda/etapa fica "done" sem a doc atualizada.
- A doc do refac alimenta um **futuro manual do usuário final completo** — escreva pensando nisso.
- **Cada agente documenta no seu próprio estilo/contexto** (ver os `.md` em `.claude/agents/`):
  - **DBA → `docs/database/schema.md`**: tabelas/colunas com **significado de negócio**,
    relacionamentos, índices/constraints e a migration.
  - **BACKEND → `docs/backend/[modulo].md`**: endpoints, **fluxos passo a passo**, máquina de
    estados/status, integrações entre módulos e regras de negócio (com o porquê).
  - **FRONTEND → `docs/frontend/[modulo].md`**: **na ótica do usuário** — fluxos passo a passo,
    glossário de status/badges, ações/botões, mensagens, com marcadores `[SCREENSHOT: ...]`.
- Ao mudar um contrato/regra, **corrija a doc obsoleta** (não deixe a antiga contradizendo a nova);
  se sua mudança afetou a doc de outro módulo, sinalize no relatório de done.

### Banco / Migrations (Alembic)
- Toda tabela: `id UUID`, `created_at`, `updated_at`. Entidades de negócio: `deleted_at`
  (soft delete; queries filtram `deleted_at IS NULL`).
- **`revision id` ≤ 32 chars** (`alembic_version.version_num` é `VARCHAR(32)`).
  Padrão: `revision = "00NN_short_name"`, arquivo `YYYYMMDD_00NN_short_name.py`,
  `down_revision` apontando para o head atual. Head atual ao escrever este doc:
  `0010_add_quotations` — **confirme o head real** com `alembic heads` antes de criar.
- A migration `0001` usa `create_all`; **toda migration posterior precisa ser
  idempotente** e reversível (`downgrade` testado). Após `upgrade head`, rodar
  `alembic check` → deve dizer *No new upgrade operations detected*.
- **Head atual: `0017_payroll_approval`** (atualize conforme avança; confirme sempre com
  `alembic heads`).
- **Regra aprendida (Demanda 0):** todo índice criado em migration **precisa ter espelho
  no model** (`__table_args__`, mesmo nome `idx_*`), senão `alembic check` acusa
  `remove_index` e não fecha limpo.

### Docker (este projeto)
- `docker compose` (v2, com espaço). Serviço do banco: **`postgres`**; database:
  **`coffee_farm_erp`**. Serviço backend: `backend`.
- O código do backend é **copiado para a imagem** (`COPY . .`), não bind-mount.
  Após mudar models/migrations **é obrigatório rebuildar**:
  ```bash
  docker compose build backend
  docker compose up -d backend
  docker compose exec backend poetry run alembic upgrade head
  docker compose exec backend poetry run alembic check
  ```

### Critério de "done" (todos os agentes)
- Backend sobe sem erro (`uvicorn`/container saudável); `alembic check` limpo.
- Frontend: `npm run build` + `npm run lint` sem erros; sem `any`.
- **Smoke tests obrigatórios** (regra do projeto): exercitar o fluxo via API e
  **provar com `SELECT` no container** (`docker compose exec postgres psql -U postgres
  -d coffee_farm_erp -c "..."`). Colar a saída dos selects no relatório de done.
- Atualizar a doc do módulo em `docs/backend/<modulo>.md`, `docs/frontend/<modulo>.md`
  e, se o schema mudou, `docs/database/schema.md`.
- Seeds (`backend/scripts/seed.sql`) atualizados para refletir o novo schema, de
  forma que `make reset-db` / `python scripts/reset_db.py` continue funcionando.

### Convenção de status finais
- `Cancelada`, `Entregue`, `Concluída`, `paga`, `quitado` são **finais e
  irreversíveis** (exceto reversões já existentes, ex.: reverter inadimplência).
- Toda transação gera movimento financeiro, mesmo que R$ 0,00.

---

## Infra entregue na Demanda 0 (reutilizar em TODAS as demandas)

**Backend** — `backend/app/shared/pagination.py`:
- `PageParams` (BaseModel): `page>=1=1`, `page_size 1..100 =20`, `order_by:str|None`,
  `order_dir:Literal["asc","desc"]="desc"`, `search:str|None`; property `offset`. Dependency `get_page_params`.
- `Page[T]` (Generic): `items,total,page,page_size,pages`; `Page.create(items=, total=, params=)`.
  `pages = ceil(total/page_size)`; `pages=0` quando `total=0`.
- `paginate_query(query, params, *, allowed_order_by: dict[str, col], default_order, tiebreaker=None) -> (items, total)`.
  `order_by` inválido cai no default (nunca 500). **Passe sempre a PK como `tiebreaker`** (estabilidade entre páginas).
- Endpoint paginado retorna **`Page[T]` cru** (NÃO usa o wrapper `SuccessResponse`), para casar 1:1 com o front.
- Total contado via `query.order_by(None).count()` antes do limit/offset.

**Frontend:**
- `frontend/lib/pagination.ts` → `fetchPaginated<T,TRaw=T>(path, query?, parseItem?) : Promise<Paginated<T>>`
  (omite chaves vazias; usa `apiFetch`; consome o envelope cru). `Paginated<T>` em `types/index.ts`.
- `frontend/components/ui/data-table.tsx` → `DataTable<T>` props: `columns ({key,label,sortable?,align?,render?})`,
  `rows, loading, emptyMessage?, page, pageSize, total, pages, onPageChange, sort?{by,dir}, onSortChange?(key), rowKey?`.
- **Padrão recomendado:** estado de query num **hook por módulo** (ex.: `useMovimentacoes.ts`); DataTable e a
  *table* do módulo ficam puramente de apresentação.
- **`sortable` só em colunas da allowlist `order_by` do endpoint** (senão o backend cai no default).
- **Decimals chegam como string** → converter para number no `parseItem` (padrão `toNumber` do projeto).
- Busca textual: `fetchPaginated` já aceita `search`; o input (com debounce) é por página quando o módulo precisar.
- Doc de referência: `docs/backend/_shared-paginacao.md` e `docs/frontend/_shared-datatable.md`.

## Infra E2E (montada no início da Demanda 5)

Harness **Playwright** calibrado e determinístico montado no começo da D5 (antes de reescrever o PCP): login único via `storageState`, seed determinístico via `make reset-db`, web-first, sem prints; smoke-base read-only contra Financeiro/Folha. Rodar com `make e2e`. Specs de PCP/feature entram por camada conforme a D5 avança. Doc: `docs/frontend/_e2e-playwright.md`.

## Estado de execução (atualizar conforme avança)

| Demanda | DBA | BACKEND | FRONTEND | PR | Prod |
|---------|-----|---------|----------|----|----|
| 0 Infra | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1 Faturamento | ✅ | ✅ | ✅ | ✅ | ✅ | — cancelamento por estorno (4 tipos); removida a opção "Cancelada" do Select de status (sem estorno). Head: 0012_invoice_cancel_fields. PR #12 (junto com a 1.1). |
| 1.1 Recebimento ERP | n/a | ✅ | ✅ | ✅ | ✅ | — NF de recebimento/devolução/transporte + entrada de estoque movem da etapa de PAGAMENTO para a CONFERÊNCIA (norma ERP). Pagamento só liquida a(s) conta(s) a pagar e conclui a ordem (parcelado: só na última). Cancelamento segue "dinheiro só se move no pagamento" (estorno financeiro só se já pago; senão cancela a AP em aberto). Corrige o bug do parcelado. **+Descoberta de NFs:** filtro `GET /faturas?order_id` + botão "Ver notas relacionadas" na ordem → Faturamento filtrado. **Smoke do core validado** (parcelado 3x: NF/estoque só na conferência, conclui na última parcela; cancelamento antes×depois do pagamento). Débito técnico: FK `purchase_order_id` em `invoices` (futuro). Sem schema novo (head 0012). Em prod (PR #12). |
| 2 Folha cargos | ✅ | ☐ | ☐ | ☐ | ☐ | — **DBA:** tabela `job_positions` (name unique, base_salary sugerido, soft delete) + `employees.position_id` FK NOT NULL (backfill por igualdade exata de `role`; "Colhedor"≠"Colhedora"). `role` mantida **nullable/DEPRECATED** — DROP físico fica para o passo Backend. Head: `0013_job_positions`. Migration idempotente+reversível (downgrade testado); `alembic check` limpo; `reset_db` ok. Seeds: 8 cargos + funcionários via `position_id`. |
| 3 Estoque/Config | ✅ | ☐ | ☐ | ☐ | ☐ | — **DBA:** `stock_categories` (soft delete) + tipo `system_role` + `category_role_assignments` (M:N, UNIQUE category+role) + `app_settings` (key-value, 3 chaves de destino da colheita). `stock_items.category_id` FK NOT NULL (backfill do enum); `stock_items.category` **nullable/DEPRECATED** + tipo `stock_category` mantido — DROP físico fica para o Backend. Guard de `create_all` na migration (como 0013). Head `0015_stock_categories`; idempotente+reversível; `alembic check` limpo; `reset_db` ok; `seed_only` 2× ok. Novas tabelas em `TABLES_TO_CLEAR`. |
| 4 Financeiro | ✅ | ✅ | ✅ | ☐ | ☐ | — **FRONTEND:** 3 listas do Financeiro (pagar/receber/movimentações) migradas para `DataTable` paginada server-side (busca, status, intervalo de datas, tipo/categoria/módulo; ordenação por data/valor) com hooks por aba (`useContasPagar`/`useContasReceber`/`useMovimentacoesFin`); ações de linha preservadas via "Detalhes" → `Sheet` (pagar/receber/cancelar/PIX/boleto). Folha: "Pagar"→"Solicitar pagamento" (`solicitarPagamento`), "Pagar Todos"→"Solicitar pagamento de todos" (`solicitarPagamentoTodos`); holerite `aguardando_aprovacao` bloqueia o botão + badge. Financeiro→Aprovações: seção "Pagamentos de Folha Aguardando Aprovação" (`getAprovacoesFolha`/`aprovarFolha`/`recusarFolha`) somada ao badge da aba; Aprovar (AlertDialog, total + aviso de 1 NF/funcionário; saldo validado no backend→toast) e Recusar (motivo obrigatório). `FaturaCard` trata `invoice_type=folha_pagamento` (badge/legenda "Folha de pagamento", PDF simples; cancelamento desabilitado — fora de escopo). Removidos órfãos `ContaRow`/`ResultadoPagamentoDialog`/`PayrollBatchResult`. `npm run build`+`lint` sem erros, sem `any`. Smoke API ponta a ponta validado (solicitar individual/lote→aprovar→`pago`+NF folha+`saida/folha`; recusar→`pendente`; filtros/ordenação/paginação `Page[T]` nas 3 listas). **DBA:** enum `payroll_entry_status` ganhou `aguardando_aprovacao` (`pendente → aguardando_aprovacao → pago`; `ADD VALUE IF NOT EXISTS` em autocommit_block; valor também no enum Python p/ create_all). Tabelas `payroll_payment_requests` (soft delete; status textual) + `payroll_payment_request_entries` (junção, UNIQUE request+entry, CASCADE). NF de folha = só novo valor string `folha_pagamento` em `invoices.invoice_type` (sem migration). Head `0017_payroll_approval`; idempotente+reversível (downgrade deixa o valor do enum); `alembic check` limpo; `reset_db`/`seed_only` ok. |
| 5 PCP | ✅ | ✅ | ✅ | ☐ | ☐ | — **FRONTEND (passo 3):** UI do PCP reescrita contra o contrato real. Talhão com **hectares**; OP com hectares (+ disponível no talhão), insumos (papel `insumo`, SKU), **requisitos por cargo** (cargo/quantidade/vínculo — sem worker nominal), recursos **Máquinas/Veículos** (reserva exclusiva — item reservado some do select; horas incrementais) e **Embalagens** (consumo), serviços externos. Card mostra hectares, requisitos por cargo, recursos (badge "reservado"), resultado por destino e botão **Encerrar (praga)** (motivo obrigatório). Colheita por **destino** (Indústria/Embalagem/Descarte) com "= X hectares" ao digitar o %; `ResultadoSafraDialog` mostra os 3 destinos + **custo discriminado** (autoritativo via `/relatorios`). `RelatoriosPCP` com custo discriminado da safra + produção por destino. Tipos atualizados (`total_hectares`, destinos, `position_requirements`, `resources`, `early_closed_reason`; removidos workers/qualidades). **Pré-requisito de seed:** +1 categoria/role/item de **embalagem** em `seed.sql` (re-semeável). **E2E:** `e2e/pcp.spec.ts` (talhão→OP com SKU→reserva exclusiva→colheita por destino→resultado/custo discriminado→encerrar→nova OP); `make e2e` 8/8 verdes em 2 execuções; `npm run build`+`lint` sem erros, sem `any`. Doc `docs/frontend/pcp.md` reescrita (ótica do usuário). **+ 5.1 (FRONT — planejar livre × validar no iniciar):** removida do front a ideia de "máquina some por reserva" — os selects de Máquina/Veículo **mostram** o disponível (`getRecursosDisponiveis` agora traz `available_quantity`; nada é ocultado) e o select de **cargo** mostra o disponível (`getCargosDisponiveis`). Quantidades aceitam qualquer valor > 0 (planejar é livre) com **aviso inline** quando acima do disponível ("será validado ao iniciar") — sem bloquear salvar. **Iniciar** trata **409** ("Capacidade insuficiente para iniciar — …") em toast; **colher** trata **400** ("Estoque insuficiente…") em toast (ambos via `apiFetch`→`Error(detail)`). Tipos `ResourceAvailable`/`CargoDisponivel`. E2E `e2e/pcp.spec.ts` atualizado (planejar livre acima do disponível salva; iniciar A consome→disponível 0; iniciar B excede→409; encerrar A libera→iniciar B passa; colher por destino) — removida a asserção antiga de "máquina some"; `make e2e` **8/8 verdes em 2 execuções**; `npm run build`+`lint` sem erros, sem `any`. `docs/frontend/pcp.md` atualizada. **BACKEND:** PCP reescrito (P0–P6). Destrava o app (removidos `ProductionOrderWorker`, colunas de qualidade e o endpoint `/funcionarios-em-producao`; removida a aleatoriedade/`_simulate_harvest` e o alias `/produzir`). Talhão em hectares + validação de soma ≤ `total_hectares` (400). Requisitos por cargo (`position_requirements`) com custo de pessoal `Σ(qtd × base_salary/22 × max(1,dias))`. Recursos por papel: máquina/veículo = reserva exclusiva (409, não baixa estoque, custo `Σ(horas × hourly_cost)`, horas **incrementais null-safe**), embalagem = consumo proporcional. Insumos restritos ao papel `insumo` (400). Colheita determinística por destino (industria/embalagem/descarte) com baixa de insumos/embalagens e entrada nos 3 itens-destino; `hectares_harvested = hectares_used × pct/100`. Encerrar por praga (`/ordens/{id}/encerrar`) → concluida + `early_closed_reason`, libera recursos/área. Relatórios com **custo discriminado** (insumos/pessoal/máquinas/embalagens/serviços) por OP e da safra. Novos endpoints: `PUT /ordens/{id}`, `/ordens/{id}/encerrar`, `/insumos-disponiveis`, `/recursos-disponiveis`. Smoke 1–8 + SELECTs (stock_movements nos 3 destinos + baixas; colunas por destino) validados; app sobe; `reset_db` ok. Doc `docs/backend/pcp.md` reescrita. **+ 5.1 (capacidade — planejar livre, bloquear no iniciar):** REMOVIDA a reserva exclusiva no criar (planejar é livre — sem teto). O **iniciar** passa a bloquear (409) por **capacidade DERIVADA** das OPs iniciadas (status em_producao/em_execucao/pausada): recursos **reutilizáveis** (máquina/veículo, `disp = on_hand − Σ`) e **pessoas por cargo** (`disp = headcount ativo − Σ`); 409 lista item/cargo com requerido×disponível; a própria OP não conta contra si. Consumíveis (insumo/embalagem) não bloqueiam no iniciar — guard de estoque (400) no `/colher` impede saldo negativo. Sem boolean de "ocupado", **sem migration** (ocupação é somatório). Novos `GET /pcp/recursos-disponiveis` (com `available_quantity`) e `GET /pcp/cargos-disponiveis`. Smoke 1–6 (planejar livre, 409 máquina/cargo, liberação ao encerrar, sem falso self-409, guard /colher) validados. **+ delta:** REMOVIDA a trava legada `has_active_order_for_plot` (decisão do PO) — múltiplas OPs por talhão são válidas, inclusive em andamento simultâneo, limitadas só pelos hectares (provado: A 120ha + B 80ha iniciadas no mesmo talhão de 200ha; C 50ha barrada por hectares Σ=250>200). |
| 6 Compras | ☐ | ☐ | ☐ | ☐ | ☐ | — Fornecedor (CNPJ/CPF + endereço/CEP) + bug cotação de serviço **+ Catálogo de fornecedor** (`supplier_items`, produto↔fornecedor com preço; estoque infinito; compra seleciona produto→fornecedores que o vendem). Resolve a pendência "comprar avariado" (item avariado não entra em catálogo). Ver decisão D7. |
| 7 Front geral | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 PCP (colega) | ☐ | ☐ | ☐ | ☐ | ☐ | — **BACKLOG/avaliação.** Parking lot das melhorias do colega (branch `feature/pcp-recursos-op`): recursos da OP em 3 tabelas + reserva por quantidade + fix de login (URL relativa/proxy). NÃO mergeado (colisão de migration 0018, base no schema antigo, build docker dele não loga). Avaliar depois se reimplementa do nosso jeito (modelo D5). |
</content>
</invoke>
