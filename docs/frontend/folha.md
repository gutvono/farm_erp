# Frontend Module: Folha de Pagamento

## Visão Geral

Página única em quatro abas: **Folha do Mês** (gestão de períodos e holerites), **Funcionários** (cadastro com foto, benefícios/dependentes, demissão e edição), **Cargos** (cadastro dos cargos da fazenda) e **Folhas do funcionário** (histórico anual de holerites por funcionário, inclusive demitidos).

> **Demanda 4 — pagar virou "solicitar pagamento".** Antes, "Pagar" tirava dinheiro direto da Conta Corrente. Agora, pagar um funcionário (individual ou em lote) **não move dinheiro**: cria uma **solicitação de pagamento** que vai para a aba **Aprovações** do Financeiro. O dinheiro só sai quando o Financeiro **aprova** — e aí é emitida **uma nota fiscal de folha por funcionário**. Enquanto aguarda, o holerite fica **"Aguardando aprovação do financeiro"** e seu botão fica **bloqueado**. Se o Financeiro **recusar**, o holerite volta a **Pendente**. (A demissão continua lançando o custo direto no Financeiro.)

> A partir da Demanda 2, **cargo deixou de ser um texto livre** digitado no cadastro do funcionário e passou a ser um **item cadastrável** (aba **Cargos**). No cadastro de funcionário, o cargo é escolhido num **menu suspenso**, e o salário do cargo é **sugerido automaticamente** (mas pode ser alterado).

---

## Fluxos passo a passo (ótica do usuário)

### Cadastrar e gerenciar cargos

1. Abra **Folha de Pagamento** e clique na aba **Cargos**.
2. A tabela lista os cargos com **Nome**, **Descrição**, **Salário base** e **situação (Ativo/Inativo)**. Clique nos cabeçalhos **Nome** ou **Salário base** para ordenar; use a caixa **"Buscar cargo por nome..."** para filtrar.
3. Clique em **"Novo Cargo"**. Preencha **Nome** (obrigatório), **Descrição** (opcional), **Salário base** e a **Situação** (Ativo por padrão). Clique em **"Cadastrar cargo"**.
4. Para alterar, clique em **"Editar"** na linha do cargo, ajuste os campos e clique em **"Salvar alterações"**.
5. Para remover, clique em **"Excluir"** e confirme.
   - Se o cargo **tiver funcionários ativos vinculados**, a exclusão é **bloqueada** e aparece a mensagem *"Não é possível excluir um cargo com funcionários vinculados"*; o cargo **permanece** na lista.
   - Depois de **demitir** (ou trocar de cargo) os funcionários vinculados, a exclusão passa a funcionar e o cargo some da lista.

[SCREENSHOT: aba Cargos com a tabela, a busca, e os botões Novo Cargo / Editar / Excluir]
[SCREENSHOT: diálogo "Excluir cargo" e o toast de exclusão bloqueada]

> Observação: o sistema **não unifica** nomes parecidos — por exemplo, **"Colhedor"** e **"Colhedora"** aparecem como dois cargos distintos no cadastro e no menu suspenso.

### Cadastrar um funcionário com cargo (salário sugerido)

1. Na aba **Funcionários**, clique em **"Novo Funcionário"**.
2. Preencha **Nome**, **CPF**, e no campo **Cargo** escolha um cargo no **menu suspenso**.
3. Ao escolher o cargo, o campo **Salário base** é **preenchido automaticamente** com o salário daquele cargo (apenas uma sugestão).
4. Se quiser, **altere o salário** — o valor digitado prevalece sobre a sugestão do cargo. Se deixar o campo em branco, o sistema usa o salário do cargo.
5. Escolha **Tipo de contrato** e a **Data de admissão** — esta agora num **calendário** (com mês/ano por dropdown; ver [`_ui-date-combobox.md`](_ui-date-combobox.md)) — e, opcionalmente, custo de demissão e foto. (Vale tanto no cadastro quanto na edição do funcionário.)
6. Clique em **"Cadastrar funcionário"**.

   Exemplo: escolher **"Operador de Máquinas"** (salário 2.200) preenche o campo com **2.200**; mudar para **2.400** e salvar deixa o funcionário com **2.400**.

[SCREENSHOT: formulário de funcionário com o menu suspenso de Cargo aberto e o Salário base já preenchido]

### Editar o cargo de um funcionário

1. Na aba **Funcionários**, clique em **"Editar"** na linha do funcionário.
2. O **Cargo atual** já vem **pré-selecionado** no menu suspenso. Ao trocar de cargo, o **Salário base** é reescrito com o salário do novo cargo (ainda editável).
3. Ajuste o que for necessário e clique em **"Salvar alterações"**.

---

## Page

- `/folha` — `app/(modules)/folha/page.tsx`. 3 abas (Tabs shadcn).

### Aba "Folha do Mês"
1. `PeriodoSelector` no topo: mês + ano + botão "Abrir Período" (idempotente).
2. Quando há período carregado:
   - Resumo: 4 cards (total da folha, total pago, total pendente, status). A linha de contagem mostra também quantos holerites estão **aguardando aprovação**.
   - Ações: `PagarTodosButton` ("Solicitar pagamento de todos", visível se aberto + há pendentes) e botão "Fechar Período" com `AlertDialog`.
   - Tabela de holerites (`HoleritesTable`) com **filtros e ordenação client-side** + linha `EntryRow` por funcionário (ações: editar, solicitar pagamento, gerar PDF).

#### Filtros, ordenação e ordem estável dos holerites (Demanda 4.1)
A lista de holerites já vem **completa** do período selecionado; o filtro/ordenação são **só de visualização** (em memória, sem paginação).

- **Ordem padrão:** alfabética por **nome** do funcionário.
- **Ordenar (clique no cabeçalho):** Funcionário (nome), Salário base, Horas extras, Descontos e Total — alterna ↑/↓. (Contrato e Status não ordenam; Status filtra.)
- **Filtros (menus):** **Status** (Pendente / Aguardando aprovação / Pago) e **Contrato** (CLT / PJ / Temporário). A barra mostra "X de Y holerites". Filtro vazio → "Nenhum holerite corresponde aos filtros".
- **Limpar filtros:** com filtro ativo aparece o botão **"Limpar filtros"** (ver [`_clear-filters.md`](_clear-filters.md)) que zera Status + Contrato. O mesmo botão existe nas barras de **Funcionários** (busca + contrato + "apenas ativos", que volta ao default) e **Cargos** (busca).
- **Ordem estável (a dor que isso resolve):** ao clicar **"Solicitar pagamento"** (ou "Solicitar pagamento de todos"), o funcionário **não muda de posição** na tabela — antes a linha "pulava" porque o status mudava. Agora a ordem depende **só do critério escolhido** (padrão: nome), nunca do status; após recarregar, a ordenação é reaplicada e a linha permanece no mesmo lugar.
- **Importante:** o filtro é só visual. **"Solicitar pagamento de todos"** continua agindo sobre **todos os holerites pendentes do período**, mesmo que a tela esteja filtrada (ex.: filtrar Status=Pendente e clicar no botão cobre todos os pendentes, não só os visíveis).

[SCREENSHOT: tabela de holerites com os menus Status/Contrato e os cabeçalhos ordenáveis]
[SCREENSHOT: antes/depois de "Solicitar pagamento" de um funcionário — a linha continua na mesma posição, agora com o badge "Aguardando aprovação do financeiro"]

### Aba "Funcionários" (tabela paginada — Demanda 8)
- Migrada de grade de cartões para **tabela** (`DataTable`) com **paginação no servidor**.
- **Colunas:** Funcionário (avatar + nome + cargo), Contrato (badge CLT/PJ/Temporário), Salário base, Admissão, Situação (Ativo/Inativo) e ações.
- **Ordenar:** clique em **Funcionário** (ordena por nome — allowlist do backend).
- **Filtrar/buscar:** **Buscar** (nome/documento, com debounce), Select de **Contrato** e o botão **Apenas ativos** (default ativo).
- **Ações na linha** (apenas funcionários ativos): **Editar** (abre `FuncionarioForm`) e **Demitir** (AlertDialog com o custo de rescisão).
- Botão **Novo Funcionário** abre `FuncionarioForm` em modo criação. Tabela vazia: "Nenhum funcionário encontrado".

[SCREENSHOT: aba Funcionários em tabela com busca, filtro de contrato e paginação]

### Aba "Cargos"
- `CargosTab` — listagem paginada server-side (`DataTable` da Demanda 0), busca por nome e botão "Novo Cargo".
- Colunas: **Nome** (ordenável), **Descrição**, **Salário base** (ordenável), **Ativo** (badge), **Ações** (Editar/Excluir).
- Ordenação clicável **apenas** em **Nome** e **Salário base** (allowlist do backend); as demais colunas não ordenam.
- `CargoForm` (Dialog, RHF + Zod) serve para criar e editar. Excluir abre `AlertDialog`; erro 400 do backend (cargo com vínculo) é exibido no toast e o cargo permanece.

### Aba "Folhas do funcionário"
- Select de funcionário carregado com ativos + inativos, input de ano e tabela anual de holerites.
- Cada linha mostra competência, proventos, benefícios, descontos, total líquido, status e botão `HoleritePDF`.

## Service (`services/folha.ts`)

```typescript
// Cargos (Job Positions)
getCargos(params: { page?; page_size?; order_by?; order_dir?; search? }): Promise<Paginated<JobPosition>>  // envelope Page[T] cru
createCargo({ name, description?, base_salary, is_active }): Promise<JobPosition>
updateCargo(id, data: Partial<...>): Promise<JobPosition>
deleteCargo(id): Promise<void>                                // 400 se houver funcionário vinculado

// Funcionários
getFuncionarios(params?: { is_active?; contract_type? }): Promise<Employee[]>
createFuncionario(data: FormData): Promise<Employee>          // multipart; envia position_id; base_salary opcional
updateFuncionario(id, data: Partial<...>): Promise<Employee>  // JSON; usa position_id
demitirFuncionario(id): Promise<Employee>
getHoleritesFuncionario(employeeId, year): Promise<EmployeePayslip[]>

// Períodos
getPeriodos(): Promise<PayrollPeriod[]>
createOrGetPeriodo({ reference_month, reference_year }): Promise<PayrollPeriod>
getPeriodo(id): Promise<PayrollPeriod>
fecharPeriodo(id): Promise<PayrollPeriod>

// Entries
updateEntry(id, { overtime_amount, deductions }): Promise<PayrollEntry>
solicitarPagamento(entryId): Promise<PayrollPaymentRequest>          // individual
solicitarPagamentoTodos(periodId): Promise<PayrollPaymentRequest>    // lote
```

> Os antigos `pagarEntry`/`pagarTodos` (pagamento direto) foram **removidos** — o
> backend não tem mais rota de pagamento direto na Folha. A aprovação/recusa da
> solicitação acontece no **Financeiro** (`getAprovacoesFolha`/`aprovarFolha`/
> `recusarFolha`, ver `docs/frontend/financeiro.md`).

**Multipart upload:** `createFuncionario` chama `fetch` diretamente (em vez de `apiFetch`) porque o helper força `Content-Type: application/json`. O service mantém `credentials: "include"` para o cookie de sessão e replica o tratamento 401 → redirect /login. Esse é o único ponto fora do `apiFetch` no módulo.

**Decimals:** `base_salary`, `overtime_amount`, `deductions`, `total_amount`, `total_paid`, `termination_cost_override` e os benefícios (`transport_voucher_cost`, `meal_voucher_value`, `pharmacy_voucher_value`, `life_insurance_value`) chegam como string do backend (Pydantic + Decimal). O service converte via `toNumber()`/`toNumberOrNull()` em `parseEmployee`/`parseEntry`/`parsePeriod`/`parseJobPosition`/`parseEmployeePayslip`.

**Cargos (paginação):** `getCargos` usa `fetchPaginated` (infra da Demanda 0) porque `GET /api/folha/cargos` responde o **envelope `Page[T]` cru** (`items/total/page/page_size/pages`), e não o `SuccessResponse`. `order_by` aceito: `name`, `base_salary` (default `name asc`); `search` filtra por nome. As demais rotas de cargo (POST/PUT/DELETE) usam `SuccessResponse` via `apiFetch`.

**Histórico:** `getHoleritesFuncionario(employeeId, year)` consome `GET /api/folha/funcionarios/{id}/holerites?year=YYYY` (`SuccessResponse`) e converte cada item via `parseEmployeePayslip`.

**Photo URL:** O backend retorna `photo_url` relativo (`/uploads/employees/...`). O service prefixa com `NEXT_PUBLIC_API_URL` para virar absoluto antes de servir aos componentes.

## Types (`types/index.ts`)

```typescript
type ContractType = "clt" | "pj" | "temporario"
type PayrollEntryStatus = "pendente" | "aguardando_aprovacao" | "pago"
type PayrollPeriodStatus = "aberta" | "fechada"

interface JobPosition { id; name; description; base_salary; is_active }

interface Employee { id; name; cpf; position_id; position_name; base_salary; contract_type;
  admission_date; photo_path; photo_url; is_active; termination_cost_override;
  transport_voucher_cost; meal_voucher_value; pharmacy_voucher_value; life_insurance_value;
  dependents_count; created_at }

interface PayrollEntry { id; payroll_period_id; employee_id; employee_name;
  contract_type; base_salary; overtime_amount; deductions; total_amount; status; paid_at }

interface PayrollPeriod { id; reference_month; reference_year; status;
  total_amount; entries; created_at }

// Solicitação de pagamento (Demanda 4) — criada na Folha, decidida no Financeiro
interface PayrollPaymentRequest { id; payroll_period_id; competency; // "MM/AAAA"
  request_type: "individual" | "lote"; status; total_amount; approval_note;
  requested_at; decided_at; entries: { entry_id; employee_id; employee_name; net_amount }[];
  created_at; updated_at }

interface EmployeePayslip extends PayrollEntry { reference_month; reference_year; period_status }
```

## Componentes

### `HoleritesTable` + `useHolerites` (Demanda 4.1)
Tabela de apresentação dos holerites do período. O estado de **filtros + ordenação** vive no hook `useHolerites(entries)` (client-side); a tabela renderiza a barra de filtros (Status, Contrato), os cabeçalhos ordenáveis (nome, salário base, horas extras, descontos, total) e uma `EntryRow` por linha. A ordenação é **estável** (critério → nome → id, **nunca status**), preservando a posição da linha ao solicitar pagamento.

**Props (`HoleritesTable`):** `entries: PayrollEntry[]`, `period: PayrollPeriod`, `employeeById: Map<string, Employee>`, `loading: boolean`, `onChanged: () => void`

**Retorno (`useHolerites`):** `rows` (filtrado+ordenado), `sort {by,dir}`, `toggleSort(key)`, `filters {status?,contract_type?}`, `setFilters(next)`

### `FuncionariosTable` (+ `useFuncionarios`)
Tabela paginada server-side de funcionários (Demanda 8, substitui o antigo `FuncionarioCard`). `useFuncionarios` guarda página/ordenação/filtros (`is_active`, `contract_type`) e a busca com debounce; a tabela é só apresentação. Cada linha traz avatar (foto ou inicial), nome + cargo, badge de contrato (CLT azul / PJ roxo / Temporário laranja), salário base, admissão e badge de situação (Ativo/Inativo). Ações por linha (apenas se ativo): **Editar** (callback) e **Demitir** (AlertDialog com custo calculado).

**Custo de demissão exibido:** `termination_cost_override` se preenchido, caso contrário CLT R$5.000 / PJ R$1.000 / Temporário R$500. Cálculo idêntico ao backend, apenas para UX — o valor real é o que o backend lança.

**Props (`FuncionariosTable`):** `data: Paginated<Employee>`, `loading`, `page`, `sort`, `onPageChange`, `onSortChange`, `search`, `onSearchChange`, `activeOnly`, `onActiveOnlyChange`, `contractType`, `onContractTypeChange`, `onEdit`, `onChanged`.

### `FuncionarioForm`
Dialog com dois schemas Zod separados: criação (inclui `cpf` regex `000.000.000-00`) e edição (sem CPF, sem foto). Foto opcional na criação via input `<input type="file" accept="image/jpeg,image/png">`, validada no client (rejeita formatos inválidos com mensagem). FormData montado no submit (envia `position_id`).

**Cargo (dropdown) + salário sugerido:** o campo **Cargo** é um `Select` populado por `getCargos` (busca 1 página de 100 ao abrir; a listagem já exclui cargos removidos). `position_id` é obrigatório no schema. Ao escolher um cargo, o **Salário base** é preenchido com o `base_salary` do cargo — mas continua **editável**. Na edição, o `position_id` atual vem pré-selecionado. O **Salário base é opcional**: só é anexado ao `FormData` quando informado (vazio → o backend usa o salário do cargo). A conversão vazio→`undefined`/texto→número usa `setValueAs` no `register`.

**Benefícios/dependentes:** o formulário também permite configurar **vale transporte**, **vale refeição**, **vale farmácia**, **seguro de vida** e **número de dependentes** (todos opcionais; convertidos vazio→não enviado). Esses valores alimentam o lançamento automático de itens na abertura do período e o cálculo de IRRF.

**Props:** `open`, `onOpenChange`, `employee?: Employee | null`, `onSuccess`

### `CargoForm`
Dialog (RHF + Zod) para criar/editar cargo. Campos: **Nome** (obrigatório), **Descrição** (opcional), **Salário base** (`≥ 0`), **Situação** (Ativo/Inativo, default Ativo). Sucesso → toast e recarrega a lista; nome duplicado → toast com a mensagem do backend (400).

**Props:** `open`, `onOpenChange`, `cargo?: JobPosition | null`, `onSuccess`

### `CargosTab` + `useCargos`
`CargosTab` orquestra a aba Cargos: usa o hook `useCargos` (estado de página/ordenação/busca, espelhando `useMovimentacoes`), monta as colunas do `DataTable`, e detém os diálogos de criar/editar (`CargoForm`) e excluir (`AlertDialog`). O `DataTable` permanece "burro". `useCargos` busca `PAGE_SIZE = 20`, ordenação inicial `name asc`; trocar ordenação/busca volta para a página 1.

### `PeriodoSelector`
Select de mês (1-12 nomes em português) + Input number ano (default mês/ano atuais). Meses/anos futuros ficam bloqueados antes da chamada. Botão "Abrir Período" chama `createOrGetPeriodo` (idempotente). Mostra badge "Aberta" (verde) ou "Fechada" (cinza) ao lado.

**Props:** `activePeriod: PayrollPeriod | null`, `onPeriodLoaded: (p: PayrollPeriod) => void`

### `EntryRow`
Linha da tabela de holerites: avatar pequeno + nome, badge de contrato, salário base, horas extras (verde + sinal +), descontos (vermelho + sinal -), benefícios informativos, total destacado em bold, badge de status (pendente amarelo / **aguardando aprovação âmbar** / pago verde). Ações por linha:
- Botão editar (Pencil) → abre `EntryEditForm` (apenas se `aberta` + `pendente`).
- Botão **"Solicitar pagamento"** individual com loading (apenas se `aberta` + `pendente`). Cria a solicitação e mostra o toast *"Enviado para aprovação do financeiro"*.
- Quando o holerite está **aguardando aprovação**, no lugar do botão aparece um botão **bloqueado** "Aguardando aprovação" (e o badge de status "Aguardando aprovação do financeiro").
- Botão `HoleritePDF` sempre visível.

**Props:** `entry: PayrollEntry`, `period: PayrollPeriod`, `employee?: Employee`, `onChanged: () => void`

### `EntryEditForm`
Dialog com `overtime_amount` e `deductions`, lista de itens do holerite e cálculo automático de hora extra, adicional noturno, INSS, IRRF, FGTS e vale transporte. Ao salvar/aplicar, o backend recalcula itens estatutários derivados.

**Props:** `open`, `onOpenChange`, `entry: PayrollEntry | null`, `onSuccess`

### `HoleritePDF`
Botão "PDF" que dinamicamente importa `jsPDF` (`await import("jspdf")`) — evita bundle bloat. Gera holerite com:
- Logo vetorial "CF" + cabeçalho "Coffee Farm ERP — Holerite"
- Período: mês/ano em português
- Funcionário: nome, CPF (do `employee` opcional), cargo (`position_name`), contrato
- Tabela de 3 colunas: Proventos, Benefícios e Descontos
- Subtotais por coluna, total líquido (Proventos − Descontos) e total de benefícios
- Data de pagamento (se `paid_at`)
- Rodapé: "Documento gerado em DD/MM/AAAA"
- Nome do arquivo: `holerite_{nome_normalizado}_{mes}_{ano}.pdf`

**Props:** `entry: PayrollEntry`, `period: PayrollPeriod`, `employee?: Employee`

### `PagarTodosButton`
Botão verde **"Solicitar pagamento de todos (R$ X)"** calculando o total das pendências localmente. AlertDialog de confirmação explicando que será criada **uma única solicitação** e que os holerites ficam **aguardando aprovação do financeiro**. Após confirmar, mostra o toast *"Enviado para aprovação do financeiro"* e recarrega o período (todos os pendentes viram **aguardando aprovação**, bloqueando os botões individuais).

**Props:** `periodId: string`, `pendingEntries: PayrollEntry[]`, `onSuccess: () => void`

## Fluxo: Criação de Período → Solicitação → Aprovação

1. Usuário escolhe mês/ano no `PeriodoSelector` e clica "Abrir Período".
2. `createOrGetPeriodo` chama `POST /api/folha/periodos` (idempotente). Backend:
   - Se já existe → retorna o período existente (com entries).
   - Se novo → cria 1 entry por funcionário **ativo** com **salário proporcional** (dias corridos trabalhados no mês) e já lança os **itens automáticos** (INSS, FGTS, IRRF quando devido, vale transporte e benefícios), status `pendente`.
3. Tabela exibe holerites. Usuário pode editar `overtime_amount`/`deductions` por entry — backend recalcula os itens estatutários (INSS/IRRF/FGTS) e o `total_amount`.
4. **Solicitar pagamento** individual (`solicitarPagamento`) ou em lote (`solicitarPagamentoTodos`):
   - **Não** move dinheiro. O(s) holerite(s) passa(m) a **aguardando aprovação** e o botão fica bloqueado.
   - No lote, **todos** os pendentes do período entram numa **única** solicitação e bloqueiam de uma vez.
   - A solicitação aparece na aba **Aprovações** do Financeiro.
5. **No Financeiro** (ver `docs/frontend/financeiro.md`): **Aprovar** → cada holerite vira **pago**, gera movimento `saida/folha` e emite **1 NF `folha_pagamento` por funcionário** (o saldo é validado no backend; se insuficiente, toast de erro). **Recusar** (com motivo) → holerites voltam a **pendente**.
6. Fechar período (`fecharPeriodo`) só é aceito se **todas** as entries estão **pagas** (holerites pendentes ou aguardando aprovação bloqueiam o fechamento). Caso contrário, toast com a mensagem do backend.

### Passo a passo (ótica do usuário) — Solicitar pagamento
1. Na aba **Folha do Mês**, com o período **aberto**, localize o funcionário na tabela.
2. Clique em **"Solicitar pagamento"** na linha dele (ou em **"Solicitar pagamento de todos"** no topo para a folha inteira).
3. O holerite passa a exibir **"Aguardando aprovação do financeiro"** e o botão fica **bloqueado**. Aparece o aviso *"Enviado para aprovação do financeiro"*.
4. O pagamento se concretiza (ou é recusado) na aba **Aprovações** do **Financeiro**. Aprovado → status **Pago**; recusado → volta a **Pendente** e o botão é liberado novamente.

[SCREENSHOT: linha do holerite com o botão "Solicitar pagamento"]
[SCREENSHOT: holerite "Aguardando aprovação do financeiro" com o botão bloqueado]

## Fluxo: Demissão

Ação **Demitir** na linha da `FuncionariosTable` → AlertDialog com custo calculado (override ou padrão por contrato) → `demitirFuncionario(id)` → backend lança `saida/folha` no Financeiro + cria conta a pagar (vencimento `hoje + 10d`) + soft delete + `is_active = false`. Funcionário some das listagens com `is_active=true`; aparece em "Todos" com badge "Inativo".

## Geração de Holerite PDF

- Triggered pelo botão `HoleritePDF` em cada `EntryRow`.
- Carregamento dinâmico de `jspdf` no clique (não inflado no chunk inicial).
- Layout em uma única página A4 com tabela manual (sem dependência de plugin).
- O `Employee` correspondente é resolvido na page via `employeeById: Map<string, Employee>` carregado em paralelo (ativos + inativos) para garantir CPF e o **nome do cargo** (`position_name`) no PDF.
- Nome do arquivo normaliza acentos e espaços (`João Silva` → `joao_silva`).

## Aba Cargos — ações, situação e mensagens

**Ações:**

| Ação | O que faz |
|------|-----------|
| **Buscar cargo por nome** | Filtra a tabela por nome (server-side) |
| **Ordenar (Nome / Salário base)** | Reordena server-side; demais colunas não ordenam |
| **Novo Cargo** | Abre o formulário de cadastro |
| **Editar** | Abre o formulário com os dados do cargo |
| **Excluir** | Remove o cargo (bloqueado se houver funcionário vinculado) |

**Situação do cargo:**

| Badge | Significado |
|-------|-------------|
| **Ativo** (verde) | Cargo disponível para uso no cadastro de funcionários |
| **Inativo** (cinza) | Cargo desativado |

**Mensagens (toasts / diálogos):**

- *"Cargo cadastrado com sucesso"* / *"Cargo atualizado com sucesso"*
- *"Cargo \"X\" excluído com sucesso"*
- Exclusão bloqueada (do backend, verbatim): *"Não é possível excluir um cargo com funcionários vinculados"* — o cargo permanece.
- Nome duplicado (do backend): *"Já existe um cargo com este nome"*.
- Diálogo de exclusão: *"O cargo deixará de aparecer nas listagens e no cadastro de funcionários. Cargos com funcionários ativos vinculados não podem ser excluídos."*
- Cadastro de funcionário: *"Funcionário cadastrado com sucesso"* — com o **Salário base sugerido pelo cargo** preenchido ao escolher o cargo (e editável).

## Comportamentos de UX

- Loading explícito em todas as ações assíncronas (botões trocam para "Processando..." / "Pagando..." / etc.).
- Toasts via `sonner` em sucesso/erro/aviso.
- Erros do backend são exibidos verbatim (mensagem original em português vinda do `apiFetch`).
- AlertDialog para confirmações relevantes: demissão, fechar período, solicitar pagamento de todos.
- Períodos fechados ficam read-only (sem botões de solicitar pagamento/editar nos `EntryRow`; sem botão "Fechar" na barra).
