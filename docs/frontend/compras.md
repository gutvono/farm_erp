# Frontend Module: Compras

## Visão Geral

Página única com 2 abas (Tabs shadcn): **Ordens de Compra** e **Fornecedores**. Ordens percorrem um fluxo de aprovação e conferência antes de serem concluídas.

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/compras/page.tsx` | Page | Página em abas; carrega ordens, fornecedores e itens de estoque |
| `services/compras.ts` | Service | Orquestra chamadas a `/api/compras/*`; converte Decimal → number |
| `types/index.ts` | Tipos | `Supplier`, `PurchaseOrderItem`, `PurchaseOrder`, `PurchaseOrderStatus`, `PurchaseOrderReceiptItem`, `PurchaseOrderWithReceipts` |
| `components/modules/compras/FornecedorForm.tsx` | Componente | Dialog (criar/editar) com React Hook Form + Zod |
| `components/modules/compras/FornecedorRow.tsx` | Componente | Linha com nome, doc, email, telefone, endereço; ações editar/excluir |
| `components/modules/compras/OrdemForm.tsx` | Componente | Dialog com seção de itens dinâmica (`useFieldArray`), subtotais e total calculados |
| `components/modules/compras/OrdemCard.tsx` | Componente | Card com badge de status, botões contextuais por status e tabela de itens expandível |

## Fluxo de status

```
em_andamento ──[Enviar para Aprovação]──▶ aguardando_aprovacao_financeiro
                                                │
                          [Aprovar] ◀──────────┤──────────▶ [Recusar] → cancelada
                               ↓
                            aprovada
                               ↓ (em Estoque → Recebimentos)
                          em_conferencia
                               ↓ (finalizar conferência)
                       aguardando_pagamento
                               ↓ (pagamento no Financeiro)
                            concluida
```

## Badges por status

| Status | Cor |
|--------|-----|
| `em_andamento` | Azul |
| `aguardando_aprovacao_financeiro` | Amarelo |
| `aprovada` | Verde claro (emerald) |
| `em_conferencia` | Laranja |
| `aguardando_pagamento` | Roxo |
| `concluida` | Verde escuro (fundo sólido) |
| `cancelada` | Cinza |

## Botões contextuais no OrdemCard

| Status | Botões |
|--------|--------|
| `em_andamento` | "Enviar para Aprovação" (AlertDialog) + botão excluir |
| `aguardando_aprovacao_financeiro` | Ícone de cadeado + texto explicativo |
| demais | Apenas expand/collapse |

## Novos service methods

| Função | Endpoint | Método |
|--------|----------|--------|
| `enviarParaAprovacao(id)` | `POST /api/compras/ordens/{id}/enviar-aprovacao` | Transição para aprovação |
| `aprovarOrdem(id)` | `POST /api/compras/ordens/{id}/aprovar` | Aprovação financeira |
| `recusarOrdem(id, note)` | `POST /api/compras/ordens/{id}/recusar` | Recusa com motivo |
| `iniciarConferencia(id)` | `POST /api/compras/ordens/{id}/iniciar-conferencia` | Inicia conferência, retorna receipts |
| `finalizarConferencia(id, items)` | `POST /api/compras/ordens/{id}/finalizar-conferencia` | Finaliza com qtd aceita/recusada |
| `getRecebimentos()` | `GET /api/compras/recebimentos` | Lista ordens aprovadas/em_conferencia |
| `getRecebimento(id)` | `GET /api/compras/recebimentos/{id}` | Detalhe com receipts |

## Abas

### 1. Ordens de Compra
- Select de filtro por status (todos os 7 valores)
- Botão "Nova Ordem"
- Lista de `OrdemCard`

### 2. Fornecedores
- Botão "Novo Fornecedor"
- Lista de `FornecedorRow`

## Integração com Estoque
A página busca `getItens()` ao montar para popular o Select de itens no `OrdemForm`.

## Campos de parcelamento em `PurchaseOrder`

```typescript
installments: number              // default 1
first_due_date: string | null     // vencimento da 1ª parcela
installment_interval_days: number // default 30
```

`OrdemForm` expõe seção "Condições de Pagamento" idêntica ao `VendaForm`:
- Select de parcelas (1x–12x)
- Campos de data e intervalo condicionais (`installments >= 2`)
- Tabela de preview em tempo real com distribuição de resíduo na última parcela

`createOrdem` aceita esses campos opcionais — enviados apenas quando `installments >= 2`.
