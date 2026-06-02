# Frontend Module: Compras

## Visão Geral

Página única com 3 abas (Tabs shadcn): **Ordens de Compra**, **Cotações** e **Fornecedores**. Ordens percorrem um fluxo de aprovação e conferência antes de serem concluídas. Cotações coletam propostas de múltiplos fornecedores, têm um vencedor selecionado, passam por aprovação do financeiro e geram uma ordem de compra já aprovada.

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

---

## Aba Cotações

Permite cotar produtos ou serviços com vários fornecedores, comparar propostas, escolher um vencedor, obter aprovação do financeiro e converter a cotação vencedora em uma ordem de compra já aprovada.

### Fluxo de status

```
em_andamento ──selecionar vencedor──▶ aguardando_aprovacao_financeiro
       │                                        │
       │ cancelar (motivo)              aprovar ─┤─ recusar (cancelar c/ motivo)
       ▼                                        ▼            ▼
   cancelada                          aprovado_financeiro   cancelada
                                              │
                                   realizar pedido
                                              ▼
                                         concluida  ──▶ gera Ordem de Compra (aprovada)
```

| Status | Cor do badge | Ações no card |
|--------|--------------|---------------|
| `em_andamento` | `bg-blue-100 text-blue-800` | Gerenciar Propostas + cancelar (lixeira, pede motivo) |
| `aguardando_aprovacao_financeiro` | `bg-yellow-100 text-yellow-800` | Cadeado "Aguardando aprovação do financeiro" |
| `aprovado_financeiro` | `bg-emerald-100 text-emerald-700` | Realizar Pedido |
| `concluida` | `bg-green-700 text-white` | Texto "Ordem #{id curto} criada" |
| `cancelada` | `bg-slate-100 text-slate-600` | Motivo do cancelamento no expand |

### Componentes

| Arquivo | Descrição |
|---------|-----------|
| `components/modules/compras/CotacaoForm.tsx` | Dialog para criar cotação (toggle Produto/Serviço, itens dinâmicos com `useFieldArray`, RHF + Zod) |
| `components/modules/compras/CotacaoCard.tsx` | Card por cotação com badges de tipo/status e botões contextuais; abre `CotacaoDetalheModal` e `RealizeOrderModal` |
| `components/modules/compras/CotacaoDetalheModal.tsx` | Detalhe completo; busca dados frescos via `getCotacao`; tabela de comparação de propostas (uma coluna por item, total estimado), seleção de vencedor, adicionar/editar/remover proposta |
| `components/modules/compras/PropostaForm.tsx` | Dialog adicionar/editar proposta; filtra fornecedores já cotados (criação); preços por item (produto) ou preço total (serviço); trata 409 (fornecedor duplicado) |
| `components/modules/compras/RealizeOrderModal.tsx` | Resumo read-only da proposta vencedora + campos `ordered_at`, `notes`, `shipping_cost`; total estimado em tempo real (produto) |

### Service functions (`services/compras.ts`)

`getCotacoes(status?, order_type?)`, `getCotacao(id)`, `createCotacao(data)`, `deleteCotacao(id)`, `addProposta(quotation_id, data)`, `updateProposta(quotation_id, proposal_id, data)`, `deleteProposta(quotation_id, proposal_id)`, `selecionarVencedor(quotation_id, proposal_id)`, `aprovarCotacao(quotation_id)`, `cancelarCotacao(quotation_id, note)`, `realizarPedido(quotation_id, data)`.

Cada uma converte os `Decimal` do backend (que chegam como string) via `toNumber`, usando os parsers `parseQuotation`, `parseQuotationItem`, `parseQuotationProposal` e `parseQuotationProposalItem`.

### Tipos (`types/index.ts`)

`QuotationStatus`, `QuotationItem`, `QuotationProposalItem`, `QuotationProposal`, `Quotation`.

### Total estimado de uma proposta (produto)

Calculado no frontend como `Σ (quotation_item.quantity × proposal_item.unit_price)`. Usado na tabela de comparação do `CotacaoDetalheModal`, no `RealizeOrderModal` e na seção de aprovação do Financeiro.

## Aprovação de Cotações (Financeiro)

A aba **Aprovações** de `financeiro/page.tsx` exibe, abaixo das "Ordens de Compra Pendentes", a seção **Cotações Aguardando Aprovação** (status `aguardando_aprovacao_financeiro`), carregada via `getCotacoes("aguardando_aprovacao_financeiro")`. Cada card mostra tipo, data, fornecedor vencedor, itens/descrição e total da proposta vencedora, com botões:

- **Aprovar** → `aprovarCotacao(id)` (AlertDialog/Dialog de confirmação); cotação vai para `aprovado_financeiro`
- **Recusar** → `cancelarCotacao(id, note)` (Dialog com motivo obrigatório); cotação vai para `cancelada`

O badge de contagem da aba soma ordens + cotações pendentes.
