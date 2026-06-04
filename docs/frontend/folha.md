# Frontend Module: Folha de Pagamento

## Visão Geral

Página única em três abas: **Folha do Mês** (gestão de períodos e holerites), **Funcionários** (cadastro com foto, demissão e edição) e **Cargos** (cadastro dos cargos da fazenda). Toda operação que movimenta dinheiro (pagamento individual, pagamento em lote, demissão) é executada via API e gera movimento financeiro no backend.

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
5. Escolha **Tipo de contrato** e **Data de admissão** (e, opcionalmente, custo de demissão e foto).
6. Clique em **"Cadastrar funcionário"**.

   Exemplo: escolher **"Operador de Máquinas"** (salário 2.200) preenche o campo com **2.200**; mudar para **2.400** e salvar deixa o funcionário com **2.400**.

[SCREENSHOT: formulário de funcionário com o menu suspenso de Cargo aberto e o Salário base já preenchido]

### Editar o cargo de um funcionário

1. Na aba **Funcionários**, clique em **"Editar"** no card do funcionário.
2. O **Cargo atual** já vem **pré-selecionado** no menu suspenso. Ao trocar de cargo, o **Salário base** é reescrito com o salário do novo cargo (ainda editável).
3. Ajuste o que for necessário e clique em **"Salvar alterações"**.

---

## Page

- `/folha` — `app/(modules)/folha/page.tsx`. 2 abas (Tabs shadcn).

### Aba "Folha do Mês"
1. `PeriodoSelector` no topo: mês + ano + botão "Abrir Período" (idempotente).
2. Quando há período carregado:
   - Resumo: 4 cards (total da folha, total pago, total pendente, status).
   - Ações: `PagarTodosButton` (visível se aberto + há pendentes) e botão "Fechar Período" com `AlertDialog`.
   - Tabela `EntryRow` por funcionário, com coluna de ações (editar, pagar, gerar PDF).

### Aba "Funcionários"
- Filtro por contrato (Select) + toggle "Apenas ativos" (default true).
- Botão "Novo Funcionário" abre `FuncionarioForm` em modo criação.
- Grid responsivo: 1 col (mobile), 2 col (tablet), 3 col (desktop).
- Vazia: "Nenhum funcionário encontrado".

### Aba "Cargos"
- `CargosTab` — listagem paginada server-side (`DataTable` da Demanda 0), busca por nome e botão "Novo Cargo".
- Colunas: **Nome** (ordenável), **Descrição**, **Salário base** (ordenável), **Ativo** (badge), **Ações** (Editar/Excluir).
- Ordenação clicável **apenas** em **Nome** e **Salário base** (allowlist do backend); as demais colunas não ordenam.
- `CargoForm` (Dialog, RHF + Zod) serve para criar e editar. Excluir abre `AlertDialog`; erro 400 do backend (cargo com vínculo) é exibido no toast e o cargo permanece.

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

// Períodos
getPeriodos(): Promise<PayrollPeriod[]>
createOrGetPeriodo({ reference_month, reference_year }): Promise<PayrollPeriod>
getPeriodo(id): Promise<PayrollPeriod>
fecharPeriodo(id): Promise<PayrollPeriod>

// Entries
updateEntry(id, { overtime_amount, deductions }): Promise<PayrollEntry>
pagarEntry(id): Promise<PayrollEntry>
pagarTodos(period_id): Promise<PayrollBatchResult>
```

**Multipart upload:** `createFuncionario` chama `fetch` diretamente (em vez de `apiFetch`) porque o helper força `Content-Type: application/json`. O service mantém `credentials: "include"` para o cookie de sessão e replica o tratamento 401 → redirect /login. Esse é o único ponto fora do `apiFetch` no módulo.

**Decimals:** `base_salary`, `overtime_amount`, `deductions`, `total_amount`, `total_paid`, `termination_cost_override` chegam como string do backend (Pydantic + Decimal). O service converte via `toNumber()` em `parseEmployee`/`parseEntry`/`parsePeriod`/`parseJobPosition`.

**Cargos (paginação):** `getCargos` usa `fetchPaginated` (infra da Demanda 0) porque `GET /api/folha/cargos` responde o **envelope `Page[T]` cru** (`items/total/page/page_size/pages`), e não o `SuccessResponse`. `order_by` aceito: `name`, `base_salary` (default `name asc`); `search` filtra por nome. As demais rotas de cargo (POST/PUT/DELETE) usam `SuccessResponse` via `apiFetch`.

**Photo URL:** O backend retorna `photo_url` relativo (`/uploads/employees/...`). O service prefixa com `NEXT_PUBLIC_API_URL` para virar absoluto antes de servir aos componentes.

## Types (`types/index.ts`)

```typescript
type ContractType = "clt" | "pj" | "temporario"
type PayrollEntryStatus = "pendente" | "pago"
type PayrollPeriodStatus = "aberta" | "fechada"

interface JobPosition { id; name; description; base_salary; is_active }

interface Employee { id; name; cpf; position_id; position_name; base_salary; contract_type;
  admission_date; photo_path; photo_url; is_active; termination_cost_override; created_at }

interface PayrollEntry { id; payroll_period_id; employee_id; employee_name;
  contract_type; base_salary; overtime_amount; deductions; total_amount; status; paid_at }

interface PayrollPeriod { id; reference_month; reference_year; status;
  total_amount; entries; created_at }

interface PayrollBatchResult { paid_count; total_paid; insufficient_balance; failed_employees }
```

## Componentes

### `FuncionarioCard`
Card de funcionário com foto/avatar circular (54×54), nome, **nome do cargo** (`position_name`), badge de contrato (CLT azul / PJ roxo / Temporário laranja), salário base e data de admissão. Badge "Inativo" se `is_active = false`. Ações (apenas se ativo): "Editar" (callback) e "Demitir" (AlertDialog com custo calculado).

**Custo de demissão exibido:** `termination_cost_override` se preenchido, caso contrário CLT R$5.000 / PJ R$1.000 / Temporário R$500. Cálculo idêntico ao backend, apenas para UX — o valor real é o que o backend lança.

**Props:** `employee: Employee`, `onEdit: () => void`, `onDemitted: () => void`

### `FuncionarioForm`
Dialog com dois schemas Zod separados: criação (inclui `cpf` regex `000.000.000-00`) e edição (sem CPF, sem foto). Foto opcional na criação via input `<input type="file" accept="image/jpeg,image/png">`, validada no client (rejeita formatos inválidos com mensagem). FormData montado no submit (envia `position_id`).

**Cargo (dropdown) + salário sugerido:** o campo **Cargo** é um `Select` populado por `getCargos` (busca 1 página de 100 ao abrir; a listagem já exclui cargos removidos). `position_id` é obrigatório no schema. Ao escolher um cargo, o **Salário base** é preenchido com o `base_salary` do cargo — mas continua **editável**. Na edição, o `position_id` atual vem pré-selecionado. O **Salário base é opcional**: só é anexado ao `FormData` quando informado (vazio → o backend usa o salário do cargo). A conversão vazio→`undefined`/texto→número usa `setValueAs` no `register`.

**Props:** `open`, `onOpenChange`, `employee?: Employee | null`, `onSuccess`

### `CargoForm`
Dialog (RHF + Zod) para criar/editar cargo. Campos: **Nome** (obrigatório), **Descrição** (opcional), **Salário base** (`≥ 0`), **Situação** (Ativo/Inativo, default Ativo). Sucesso → toast e recarrega a lista; nome duplicado → toast com a mensagem do backend (400).

**Props:** `open`, `onOpenChange`, `cargo?: JobPosition | null`, `onSuccess`

### `CargosTab` + `useCargos`
`CargosTab` orquestra a aba Cargos: usa o hook `useCargos` (estado de página/ordenação/busca, espelhando `useMovimentacoes`), monta as colunas do `DataTable`, e detém os diálogos de criar/editar (`CargoForm`) e excluir (`AlertDialog`). O `DataTable` permanece "burro". `useCargos` busca `PAGE_SIZE = 20`, ordenação inicial `name asc`; trocar ordenação/busca volta para a página 1.

### `PeriodoSelector`
Select de mês (1-12 nomes em português) + Input number ano (default mês/ano atuais). Botão "Abrir Período" chama `createOrGetPeriodo` (idempotente). Se o backend retornar período pré-existente (criado há > 5s), exibe toast "Período já existe, carregando..."; caso contrário toast de sucesso. Mostra badge "Aberta" (verde) ou "Fechada" (cinza) ao lado.

**Props:** `activePeriod: PayrollPeriod | null`, `onPeriodLoaded: (p: PayrollPeriod) => void`

### `EntryRow`
Linha da tabela de holerites: avatar pequeno + nome, badge de contrato, salário base, horas extras (verde + sinal +), descontos (vermelho + sinal -), total destacado em bold, badge de status (pendente amarelo / pago verde). Ações por linha:
- Botão editar (Pencil) → abre `EntryEditForm` (apenas se `aberta` + `pendente`).
- Botão "Pagar" individual com loading (apenas se `aberta` + `pendente`). Erro de saldo insuficiente do backend é repassado direto no toast.
- Botão `HoleritePDF` sempre visível.

**Props:** `entry: PayrollEntry`, `period: PayrollPeriod`, `employee?: Employee`, `onChanged: () => void`

### `EntryEditForm`
Dialog simples com `overtime_amount` e `deductions` (ambos `z.number().min(0)`). Preview do total em tempo real: `base_salary + overtime − deductions` exibido em card destacado. Ao salvar chama `updateEntry`.

**Props:** `open`, `onOpenChange`, `entry: PayrollEntry | null`, `onSuccess`

### `HoleritePDF`
Botão "PDF" que dinamicamente importa `jsPDF` (`await import("jspdf")`) — evita bundle bloat. Gera holerite com:
- Cabeçalho "Coffee Farm ERP — Holerite"
- Período: mês/ano em português
- Funcionário: nome, CPF (do `employee` opcional), cargo (`position_name`), contrato
- Tabela de valores: salário base, horas extras (+), descontos (−), total líquido em bold
- Data de pagamento (se `paid_at`)
- Rodapé: "Documento gerado em DD/MM/AAAA"
- Nome do arquivo: `holerite_{nome_normalizado}_{mes}_{ano}.pdf`

**Props:** `entry: PayrollEntry`, `period: PayrollPeriod`, `employee?: Employee`

### `PagarTodosButton`
Botão verde "Pagar Todos (R$ X)" calculando o total das pendências localmente. AlertDialog de confirmação antes da chamada. Após a resposta, abre `ResultadoPagamentoDialog` com o breakdown. Toast `warning` se houve `insufficient_balance`, `success` se todos pagos.

**Props:** `periodId: string`, `pendingEntries: PayrollEntry[]`, `onSuccess: () => void`

### `ResultadoPagamentoDialog`
Dialog com ícone CheckCircle2 verde (sucesso) ou AlertTriangle amarelo (saldo insuficiente). Texto: "X funcionário(s) pago(s) — Total: R$ Y". Se `failed_employees` não vazio, seção vermelha lista os nomes que não foram pagos por saldo insuficiente, com instrução de reforçar o saldo.

**Props:** `open`, `onOpenChange`, `result: PayrollBatchResult | null`

## Fluxo: Criação de Período → Pagamento

1. Usuário escolhe mês/ano no `PeriodoSelector` e clica "Abrir Período".
2. `createOrGetPeriodo` chama `POST /api/folha/periodos` (idempotente). Backend:
   - Se já existe → retorna o período existente (com entries).
   - Se novo → cria 1 entry por funcionário **ativo** com `total_amount = base_salary`, status `pendente`.
3. Tabela exibe holerites. Usuário pode editar `overtime_amount`/`deductions` por entry — backend recalcula `total_amount`.
4. Pagamento individual (`pagarEntry`) ou em lote (`pagarTodos`):
   - Backend valida saldo da Conta Corrente.
   - Saldo OK → marca `pago`, gera movimento `saida/folha`.
   - Saldo insuficiente individual → 400 com mensagem da API.
   - Saldo insuficiente em lote → registra em `failed_employees` e segue.
5. Fechar período (`fecharPeriodo`) só é aceito se **todas** as entries estão pagas. Caso contrário toast com mensagem do backend.

## Fluxo: Demissão

`FuncionarioCard` → AlertDialog com custo calculado (override ou padrão por contrato) → `demitirFuncionario(id)` → backend lança `saida/folha` no Financeiro + cria conta a pagar (vencimento `hoje + 10d`) + soft delete + `is_active = false`. Funcionário some das listagens com `is_active=true`; aparece em "Todos" com badge "Inativo".

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
- AlertDialog para todas as operações destrutivas/irreversíveis: demissão, fechar período, pagar todos.
- Períodos fechados ficam read-only (sem botões de pagar/editar nos `EntryRow`; sem botão "Fechar" na barra).
