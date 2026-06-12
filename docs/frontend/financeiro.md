# Frontend Module: Financeiro

## Visão Geral

Página única com 5 abas (Tabs shadcn) que cobrem todas as operações financeiras: **Visão Geral** (saldo + fluxo de caixa + inadimplentes), **Aprovações** (ordens de compra, cotações e **pagamentos de folha**), **Contas a Pagar**, **Contas a Receber** e **Movimentações**. Os detalhes de cada conta abrem em `Sheet` lateral para permitir ações (pagar, cancelar, receber, marcar inadimplente) sem sair da lista.

A partir da **Demanda 4**, as três listas (Contas a Pagar, Contas a Receber e Movimentações) usam a **tabela paginada do sistema** (`DataTable`): a busca, os filtros e a ordenação são processados **no servidor** e a lista vem **em páginas** — você navega com **Anterior/Próxima**. Também na aba **Aprovações** entra a seção **"Pagamentos de Folha Aguardando Aprovação"**: pagar um funcionário na Folha não tira mais dinheiro direto; agora gera uma **solicitação** que o Financeiro **aprova** ou **recusa** aqui.

**Polimento de UX (Demanda 4.1):**
- Na aba **Aprovações**, cada uma das 3 filas (Ordens de Compra, Cotações, Pagamentos de Folha) tem **cabeçalho clicável** (seta + título + contagem) que **recolhe/expande** a lista. Começam abertas; é só uma preferência visual do momento (não fica salva).
- Nas 3 tabelas do Financeiro, quando a **Descrição** é longa e fica **cortada com reticências**, ao passar o mouse aparece um **balão (tooltip) com o texto completo** — e só quando o texto está realmente cortado.

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/financeiro/page.tsx` | Page | Página em abas com toda a UI do módulo |
| `services/financeiro.ts` | Service | Orquestra todas as chamadas ao backend `/api/financeiro/*` |
| `types/index.ts` | Tipos | `FinancialMovement`, `AccountsPayable`, `AccountsReceivable`, `Balance`, `CashFlowItem`, `CashFlowResult`, `DefaulterItem`, `PayableStatus`, `ReceivableStatus`, `MovementType`, `Paginated<T>`, `PayrollPaymentRequest` (fila de aprovação de folha) |
| `components/modules/financeiro/SaldoCard.tsx` | Componente | Card de saldo + entradas/saídas + botão atualizar |
| `components/modules/financeiro/ContasPagarTable.tsx` | Componente | Tabela paginada (`DataTable`) de contas a pagar + filtros (busca, status, intervalo de vencimento) + ordenação por vencimento/valor |
| `components/modules/financeiro/ContasReceberTable.tsx` | Componente | Tabela paginada de contas a receber + filtros + ordenação |
| `components/modules/financeiro/useContasPagar.ts` | Hook | Estado de página/ordenação/filtros das contas a pagar (carrega server-side) |
| `components/modules/financeiro/useContasReceber.ts` | Hook | Estado das contas a receber |
| `components/modules/financeiro/useMovimentacoesFin.ts` | Hook | Estado das movimentações do financeiro |
| `components/modules/financeiro/AprovacoesFolha.tsx` | Componente | Seção (colapsável) da aba Aprovações com os pagamentos de folha (cards + Aprovar/Recusar) |
| `components/ui/collapsible-section.tsx` | UI (novo, D4.1) | Seção com cabeçalho clicável (chevron + título + badge) que expande/recolhe — usada nas 3 filas de Aprovações |
| `components/ui/truncated-text.tsx` | UI (novo, D4.1) | Texto em 1 linha cortado com reticências; tooltip com texto completo **só quando truncado** (detecção de overflow) |
| `components/ui/tooltip.tsx` | UI (novo, D4.1) | Primitivo Tooltip do shadcn/Radix (`@radix-ui/react-tooltip`), renderizado em Portal (não corta dentro da tabela) |
| `components/modules/financeiro/StatusBadge.tsx` | Componente | Badge colorido para status de contas |
| `components/modules/financeiro/ContaPayableDetail.tsx` | Componente | Sheet lateral com detalhes, badge de pagamento e botões PIX/Boleto |
| `components/modules/financeiro/ContaReceivableDetail.tsx` | Componente | Sheet lateral com detalhes, badge de pagamento e botões PIX/Boleto |
| `components/modules/financeiro/PixModal.tsx` | Componente | Modal com chave PIX, código copia-e-cola e botão confirmar |
| `components/modules/financeiro/BoletoModal.tsx` | Componente | Modal com linha digitável, download PDF (jsPDF) e botão confirmar |
| `components/modules/financeiro/NovaContaForm.tsx` | Componente | Dialog com form (React Hook Form + Zod) para criar conta avulsa |
| `components/modules/financeiro/MovimentacoesTable.tsx` | Componente | Tabela paginada (`DataTable`) de movimentações + filtros (busca, intervalo de datas, tipo, categoria, módulo) + ordenação por data/valor |
| `components/ui/tabs.tsx` | UI (novo) | Primitivo Tabs do shadcn/Radix |
| `components/ui/alert-dialog.tsx` | UI (novo) | Primitivo AlertDialog do shadcn/Radix (confirmações) |

## Status usados (alinhados ao backend)

- `AccountsPayable.status`: `em_aberto` | `paga` | `cancelada`
- `AccountsReceivable.status`: `em_aberto` | `parcialmente_pago` | `quitado` | `cancelada`
- Solicitação de folha (`PayrollPaymentRequest.status`): `aguardando_aprovacao_financeiro` | `aprovada` | `recusada`

Cores do `StatusBadge`:
- `em_aberto`: amarelo
- `paga` / `quitado`: verde
- `parcialmente_pago`: azul
- `cancelada`: cinza

## Fluxo de dados

```
FinanceiroPage (client)
   ↓
services/financeiro.ts (getSaldo, getContasPagar, etc.)
   ↓ (parse Decimal → number)
apiFetch → Backend /api/financeiro/*
```

Amounts retornam como string no payload JSON (Pydantic + Decimal). O service converte para `number` antes de entregar aos componentes.

## Abas

### 2. Aprovações (`approvals`) — nova
A aba tem **3 filas**, cada uma numa **seção colapsável** (`CollapsibleSection`): **Ordens de Compra Pendentes**, **Cotações Aguardando Aprovação** e **Pagamentos de Folha Aguardando Aprovação**. Cada cabeçalho tem **seta + título + badge de contagem** e, ao ser clicado, **recolhe/expande** a lista (começa aberta; estado só de UI). Recolher uma fila **não** afeta os diálogos de aprovar/recusar — eles continuam funcionando ao reabrir.

[SCREENSHOT: aba Aprovações com as 3 seções; uma delas recolhida mostrando só o cabeçalho com a contagem]

**Ordens de Compra Pendentes:**
- Lista ordens de compra com status `aguardando_aprovacao_financeiro`
- Badge contador na aba (amarelo) = soma das 3 filas
- Ordens de serviço mostram `service_description`; ordens de produto mostram lista de itens
- Botão **Aprovar** → Dialog com condições de pagamento:
  - Select `payment_method` (a_vista / parcelado / pix / boleto)
  - Quando parcelado: parcelas (2–24x), data 1ª parcela, intervalo; preview em tempo real
  - Envia `aprovarOrdem(id, { payment_method, installments?, first_due_date?, installment_interval_days? })`
- Botão **Recusar** → Dialog com Input de motivo → `recusarOrdem(id, note)`

#### Pagamentos de Folha Aguardando Aprovação (Demanda 4)
Abaixo das ordens e cotações, a seção **"Pagamentos de Folha Aguardando Aprovação"** lista as solicitações criadas na Folha (ver `docs/frontend/folha.md`). Essas solicitações **contam no badge** da aba Aprovações (somadas às ordens e cotações).

Cada card mostra: a **competência** (mês/ano), o **tipo** (Individual ou Lote), o **total** e a **lista de funcionários/holerites** com os valores líquidos.

- Botão **Aprovar** → um aviso de confirmação (`AlertDialog`) mostrando o **total** e alertando que serão geradas **uma nota fiscal de folha por funcionário**. Ao confirmar: o valor sai da Conta Corrente, cada holerite fica **Pago** e aparece uma **NF "Folha de pagamento"** em Faturamento.
  - **Saldo insuficiente** é validado no backend: se o saldo não cobre o total, a aprovação é recusada com a mensagem *"Saldo insuficiente para aprovar o pagamento da folha"*, exibida em toast (não há bloqueio prévio no front).
- Botão **Recusar** → diálogo com **motivo obrigatório**. Ao confirmar, os holerites **voltam a pendente** na Folha e **nenhum valor** sai da conta.

Fluxo passo a passo (ótica do usuário):
1. Na aba **Aprovações**, role até **"Pagamentos de Folha Aguardando Aprovação"**.
2. Confira a competência, o tipo, o total e a lista de funcionários do card.
3. Clique em **"Aprovar"** → no aviso, clique em **"Confirmar aprovação"**. O card some e os holerites viram **Pago** na Folha; as NFs aparecem em Faturamento.
4. Ou clique em **"Recusar"**, escreva o **motivo** e clique em **"Confirmar recusa"**. Os holerites voltam a **Pendente** na Folha.

[SCREENSHOT: aba Aprovações com a seção de Pagamentos de Folha — cards com competência, total e funcionários]
[SCREENSHOT: aviso de aprovação mostrando o total e o alerta de "uma NF por funcionário"]
[SCREENSHOT: diálogo de recusa com o campo de motivo]

### 1. Visão Geral (`overview`)
- `SaldoCard` com saldo, total de entradas e total de saídas; botão "Atualizar" recarrega a aba
- `CashFlowChart` (reutilizado do dashboard) alimentado por `getFluxoCaixaChartData(6)`, que adapta `{ period, entradas, saidas }` para `{ month, income, expenses }`
- Card de inadimplentes renderiza uma `Table` com cliente, número da conta, valor e vencimento. Vazia: "Nenhum cliente inadimplente"

### 3. Contas a Pagar (`payables`)
Tabela paginada (`ContasPagarTable`) com filtros e ordenação **server-side**:
- **Buscar** (campo de texto): procura por número, descrição ou nome do fornecedor.
- **Vence de / Vence até**: intervalo de datas de vencimento.
- **Status**: Todos / Em aberto / Paga / Cancelada.
- Ordenação clicando nos cabeçalhos **Vencimento** e **Valor** (alterna ↑/↓).
- Navegação por páginas (**Anterior / Próxima**), 20 por página.
- Botão "Nova conta a pagar" dispara `NovaContaForm type="pagar"`.
- Cada linha tem **Detalhes** → abre `ContaPayableDetail` como `Sheet`. No Sheet: **Pagar** (desabilitado se status final), **Cancelar conta** (com `AlertDialog`) e, conforme o método, **Ver informações PIX** / **Ver Boleto**. Após ação: toast, fecha Sheet, recarrega lista + saldo + movimentações.
- A coluna **Descrição** mostra o texto em 1 linha; quando ele não cabe, fica **cortado com reticências** e o **texto completo aparece num tooltip ao passar o mouse** (só quando truncado). Vale para as 3 tabelas do Financeiro.

[SCREENSHOT: aba Contas a Pagar com a barra de filtros (busca/datas/status), a tabela ordenável paginada e um tooltip de descrição aberto]

### 4. Contas a Receber (`receivables`)
Tabela paginada (`ContasReceberTable`), mesmos filtros/ordenação:
- **Buscar**: número, descrição ou nome do cliente.
- **Vence de / Vence até** e **Status** (Todos / Em aberto / Parcialmente pago / Quitado / Cancelada).
- Ordenação por **Vencimento** e **Valor**; paginado (20 por página).
- **Indicador de vencida (Demanda 9.A):** na coluna **Vencimento**, contas em aberto/parcial
  cujo vencimento já passou exibem um **badge vermelho "Vencida"** e o texto **"há N dias"**
  (dias de atraso). Contas quitadas, canceladas, com vencimento **hoje** ou **futuro** não
  mostram o indicador.
- Botão "Nova conta a receber" dispara `NovaContaForm type="receber"` (requer ID do cliente).
- Cada linha tem **Detalhes** → abre `ContaReceivableDetail`. No Sheet: campo "Valor recebido" + **Confirmar recebimento** (validação: `0 < valor ≤ amount - amount_received`); **Cliente não vai pagar** (em aberto/parcial) e **Reverter inadimplência** (status `cancelada`); PIX/Boleto conforme o método.

[SCREENSHOT: aba Contas a Receber com a AR-0002 marcada "Vencida · há 55 dias"]

### 5. Movimentações (`movements`)
Tabela paginada (`MovimentacoesTable`) com colunas Data, Descrição, Categoria, Módulo, Tipo (badge verde/vermelho), Valor. Filtros/ordenação **server-side**:
- **Buscar** (em descrição), **De / Até** (intervalo de datas), **Tipo** (Entrada/Saída), **Categoria** (venda, compra, folha, produção, ...) e **Módulo**.
- Ordenação por **Data** e **Valor**; navegação por páginas (20 por página).

[SCREENSHOT: aba Movimentações com filtros de tipo/categoria/datas e a tabela paginada]

## Componentes — Props

### `CollapsibleSection` (UI, D4.1)
| Prop | Tipo | Descrição |
|------|------|-----------|
| `title` | `string` | Título no cabeçalho clicável |
| `count` | `number?` | Contagem no badge (oculto se 0/indefinido) |
| `defaultOpen` | `boolean?` | Começa aberta (default `true`) |
| `children` | `ReactNode` | Conteúdo recolhível |

### `TruncatedText` (UI, D4.1)
| Prop | Tipo | Descrição |
|------|------|-----------|
| `text` | `string` | Texto completo (cortado na tela, inteiro no tooltip) |
| `className` | `string?` | Classes do span (ex.: `max-w-[280px] text-sm`) |

### `SaldoCard`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `balance` | `Balance \| null` | Resultado de `getSaldo()` |
| `loading` | `boolean` | Desabilita botão enquanto carrega |
| `onRefresh` | `() => void` | Handler do botão Atualizar |

### `ContasPagarTable` / `ContasReceberTable`
Tabelas de apresentação (estado de query mora nos hooks `useContasPagar` / `useContasReceber`).
| Prop | Tipo | Descrição |
|------|------|-----------|
| `data` | `Paginated<AccountsPayable \| AccountsReceivable>` | Página atual (items/total/page/page_size/pages) |
| `loading` | `boolean` | Skeleton nas linhas |
| `page` / `sort` | `number` / `{by,dir}` | Página e ordenação atuais |
| `onPageChange` / `onSortChange` | `(p)=>void` / `(key)=>void` | Navegação e alternância de ordenação |
| `filters` / `onFiltersChange` | filtros do hook | Busca, status e intervalo de vencimento |
| `onSelect` | `(conta) => void` | Abre o `Sheet` de detalhes |

### `ContaPayableDetail` / `ContaReceivableDetail`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `conta` | `AccountsPayable \| null` (ou Receivable) | Conta exibida no Sheet |
| `open` | `boolean` | Estado aberto do Sheet |
| `onOpenChange` | `(open: boolean) => void` | Callback de abertura/fechamento |
| `onChanged` | `() => void` | Chamado após qualquer ação para recarregar dados |

### `NovaContaForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `type` | `"pagar" \| "receber"` | Define endpoint e validação |
| `onSuccess` | `() => void` | Callback após criação |
| `trigger` | `React.ReactNode` | Elemento que abre o Dialog |

### `MovimentacoesTable`
Tabela de apresentação (estado de query no hook `useMovimentacoesFin`).
| Prop | Tipo | Descrição |
|------|------|-----------|
| `data` | `Paginated<FinancialMovement>` | Página atual de movimentações |
| `loading` | `boolean` | Skeleton nas linhas |
| `page` / `sort` | `number` / `{by,dir}` | Página e ordenação atuais |
| `onPageChange` / `onSortChange` | `(p)=>void` / `(key)=>void` | Navegação e ordenação (Data/Valor) |
| `filters` / `onFiltersChange` | filtros do hook | Busca, intervalo de datas, tipo, categoria, módulo |

## Feedback visual

- Loading: botão "Pagar" / "Confirmar recebimento" trocam o texto para "Processando..."
- Toasts via `sonner` em todas as ações (sucesso e erro)
- Em erros da API (ex.: "Saldo insuficiente"), o toast recebe a mensagem original retornada por `apiFetch`

## PIX e Boleto nos Detalhes de Conta

`ContaPayableDetail` e `ContaReceivableDetail` exibem:
- Badge colorido para `payment_method` (À Vista / Parcelado / PIX / Boleto)
- Botão "Ver informações PIX" quando `payment_method === "pix"` e conta não finalizada
- Botão "Ver Boleto" quando `payment_method === "boleto"` e conta não finalizada

**PixModal**: chave PIX + código copia-e-cola + botão "Confirmar pagamento".
**BoletoModal**: linha digitável + botão cópia + download PDF via `jsPDF` + botão "Confirmar pagamento".

## Encargo por atraso na baixa (Demanda 9.B)

`ContaReceivableDetail` cobra **multa + juros de mora** ao **quitar** uma parcela
**vencida** (`is_overdue === true`). O encargo é separado do principal: a parcela é
quitada pelo `amount` (saldo devedor) e o encargo vira um **movimento financeiro
distinto** (categoria `juros_multa`).

- Quando o operador digita um valor que **cobre o saldo total** (`= amount −
  amount_received`, tolerância de centavo) numa conta vencida, o componente busca o
  breakdown via `getEncargo(id)` e exibe **multa (R$)**, **juros (R$)**, **encargo
  calculado** e o **total a receber** (principal + encargo), deixando explícito que são
  lançamentos separados.
- O encargo tem um **campo editável** (default = total calculado). `0` = **perdão**.
  O valor é enviado em `receberConta(id, amount, encargo)` (campo opcional `encargo` no
  body de `PUT .../receber`).
- **Pagamento parcial** de parcela vencida **não gera encargo** (e a UI avisa que o
  encargo só se aplica na quitação total). Conta **não vencida**: fluxo inalterado, sem
  qualquer menção a encargo.
- PIX/Boleto quitam o saldo total → quando a parcela está vencida, o override calculado
  também é enviado na confirmação do modal.

```typescript
getEncargo(id): Promise<EncargoBreakdown>   // GET /contas-receber/{id}/encargo
receberConta(id, amount, encargo?)          // encargo opcional: 0 = perdão; ausente = auto
interface EncargoBreakdown { receivable_id; number; saldo; dias_atraso; multa; juros; total }
```

## Dependências

- `recharts` — gráfico (reutilizado do dashboard)
- `react-hook-form` + `@hookform/resolvers` + `zod` — formulário de nova conta
- `sonner` — toasts
- `jspdf` — geração de PDF do boleto
- `@radix-ui/react-tabs` + `@radix-ui/react-alert-dialog` + `@radix-ui/react-tooltip` (D4.1, tooltip de descrição) — primitivos shadcn
