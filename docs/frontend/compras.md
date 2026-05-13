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
| `components/modules/compras/OrdemForm.tsx` | Componente | Dialog com toggle Produto/Serviço; itens dinâmicos para produto ou description+total para serviço |
| `components/modules/compras/OrdemCard.tsx` | Componente | Card com badge de status/tipo, botões contextuais por status e conteúdo expandível |

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

## Service methods

| Função | Endpoint | Descrição |
|--------|----------|-----------|
| `enviarParaAprovacao(id)` | `POST /api/compras/ordens/{id}/enviar-aprovacao` | Transição para aprovação |
| `aprovarOrdem(id, data)` | `POST /api/compras/ordens/{id}/aprovar` | Aprovação com `payment_method` + parcelamento |
| `recusarOrdem(id, note)` | `POST /api/compras/ordens/{id}/recusar` | Recusa com motivo |
| `concluirServico(id)` | `POST /api/compras/ordens/{id}/concluir-servico` | Conclui serviço: `aprovada` → `aguardando_pagamento` |
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

## Campos adicionais em `PurchaseOrder`

```typescript
order_type: "produto" | "servico"
service_description: string | null
payment_method: PaymentMethod | null  // definido na aprovação
installments: number                  // definido na aprovação
first_due_date: string | null         // definido na aprovação
installment_interval_days: number     // definido na aprovação
```

## Ordens de Serviço vs. Produto

`OrdemForm` tem toggle **Produto / Serviço**:
- **Produto**: seção de itens dinâmicos (sem condições de pagamento — movidas para aprovação)
- **Serviço**: textarea de descrição + campo de valor total

`OrdemCard` exibe badge "Serviço" (índigo) para `order_type === "servico"` e renderiza a descrição do serviço no expand em vez da tabela de itens.

## Aprovação com condições de pagamento (Financeiro)

O Dialog de aprovação em `financeiro/page.tsx` coleta:
- Select `payment_method`: `a_vista` / `parcelado` / `pix` / `boleto`
- Quando `parcelado`: selects de parcelas (2–24x), data da 1ª parcela e intervalo em dias
- Preview em tempo real da distribuição das parcelas
- Envia para `aprovarOrdem(id, data: ApproveOrderData)`
