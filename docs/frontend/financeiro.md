# Frontend Module: Financeiro

## Visão Geral

Página única com 4 abas (Tabs shadcn) que cobrem todas as operações financeiras: saldo, fluxo de caixa, contas a pagar, contas a receber e movimentações. Os detalhes de cada conta abrem em `Sheet` lateral para permitir ações (pagar, cancelar, receber, marcar inadimplente) sem sair da lista.

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/financeiro/page.tsx` | Page | Página em abas com toda a UI do módulo |
| `services/financeiro.ts` | Service | Orquestra todas as chamadas ao backend `/api/financeiro/*` |
| `types/index.ts` | Tipos | `FinancialMovement`, `AccountsPayable`, `AccountsReceivable`, `Balance`, `CashFlowItem`, `CashFlowResult`, `DefaulterItem`, `PayableStatus`, `ReceivableStatus`, `MovementType` |
| `components/modules/financeiro/SaldoCard.tsx` | Componente | Card de saldo + entradas/saídas + botão atualizar |
| `components/modules/financeiro/ContaRow.tsx` | Componente | Linha clicável de conta (pagar ou receber) |
| `components/modules/financeiro/StatusBadge.tsx` | Componente | Badge colorido para status de contas |
| `components/modules/financeiro/ContaPayableDetail.tsx` | Componente | Sheet lateral com detalhes e ações da conta a pagar |
| `components/modules/financeiro/ContaReceivableDetail.tsx` | Componente | Sheet lateral com detalhes e ações da conta a receber |
| `components/modules/financeiro/NovaContaForm.tsx` | Componente | Dialog com form (React Hook Form + Zod) para criar conta avulsa |
| `components/modules/financeiro/MovimentacoesTable.tsx` | Componente | Tabela paginada de movimentações com filtro por módulo |
| `components/ui/tabs.tsx` | UI (novo) | Primitivo Tabs do shadcn/Radix |
| `components/ui/alert-dialog.tsx` | UI (novo) | Primitivo AlertDialog do shadcn/Radix (confirmações) |

## Status usados (alinhados ao backend)

- `AccountsPayable.status`: `em_aberto` | `paga` | `cancelada`
- `AccountsReceivable.status`: `em_aberto` | `parcialmente_pago` | `quitado` | `cancelada`

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

### 1. Visão Geral (`overview`)
- `SaldoCard` com saldo, total de entradas e total de saídas; botão "Atualizar" recarrega a aba
- `CashFlowChart` (reutilizado do dashboard) alimentado por `getFluxoCaixaChartData(6)`, que adapta `{ period, entradas, saidas }` para `{ month, income, expenses }`
- Card de inadimplentes renderiza uma `Table` com cliente, número da conta, valor e vencimento. Vazia: "Nenhum cliente inadimplente"

### 2. Contas a Pagar (`payables`)
- Select filtra por status (`all`, `em_aberto`, `paga`, `cancelada`)
- Botão "Nova conta a pagar" dispara `NovaContaForm type="pagar"`
- Lista de `ContaRow`; clique em uma linha abre `ContaPayableDetail` como `Sheet`
- No Sheet: botão "Pagar" (desabilitado se status final) e "Cancelar conta" (com `AlertDialog` de confirmação). Após ação: toast, fecha Sheet, recarrega lista + saldo + movimentações

### 3. Contas a Receber (`receivables`)
- Select filtra por status (`all`, `em_aberto`, `parcialmente_pago`, `quitado`, `cancelada`)
- Botão "Nova conta a receber" dispara `NovaContaForm type="receber"` (requer ID do cliente)
- Lista de `ContaRow`; clique abre `ContaReceivableDetail`
- No Sheet: campo "Valor recebido" + botão "Confirmar recebimento" (validação: `0 < valor ≤ amount - amount_received`). Botões extras: "Cliente não vai pagar" (status em aberto/parcial, via `AlertDialog`) e "Reverter inadimplência" (status `cancelada`)

### 4. Movimentações (`movements`)
- `MovimentacoesTable` com colunas Data, Descrição, Módulo, Tipo (badge verde/vermelho), Valor
- Select de filtro por módulo (sincronizado com os módulos detectados)
- Paginação simples (botões Anterior/Próximo), 50 itens por página

## Componentes — Props

### `SaldoCard`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `balance` | `Balance \| null` | Resultado de `getSaldo()` |
| `loading` | `boolean` | Desabilita botão enquanto carrega |
| `onRefresh` | `() => void` | Handler do botão Atualizar |

### `ContaRow`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `conta` | `AccountsPayable \| AccountsReceivable` | Conta a renderizar |
| `onClick` | `() => void` | Click handler — tipicamente abre o Sheet |

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
| Prop | Tipo | Descrição |
|------|------|-----------|
| `movements` | `FinancialMovement[]` | Lista completa (paginação local) |
| `loading` | `boolean` | Exibe linha "Carregando..." |

## Feedback visual

- Loading: botão "Pagar" / "Confirmar recebimento" trocam o texto para "Processando..."
- Toasts via `sonner` em todas as ações (sucesso e erro)
- Em erros da API (ex.: "Saldo insuficiente"), o toast recebe a mensagem original retornada por `apiFetch`

## Dependências

- `recharts` — gráfico (reutilizado do dashboard)
- `react-hook-form` + `@hookform/resolvers` + `zod` — formulário de nova conta
- `sonner` — toasts
- `@radix-ui/react-tabs` + `@radix-ui/react-alert-dialog` — novos primitivos shadcn
