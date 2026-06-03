# Frontend Module: Compras

> Esta documentação serve de base para o **Manual do Usuário Final**. As seções 1 a 5
> descrevem, passo a passo e do ponto de vista do usuário, como operar Compras. A
> referência técnica (componentes, serviços, tipos) está ao final.

## Visão geral

A tela **Compras** (`/compras`) tem três abas: **Ordens de Compra**, **Cotações** e
**Fornecedores**. Uma ordem de compra percorre um fluxo de **aprovação** e, no caso de
produtos, de **conferência de recebimento**, antes de ficar disponível para pagamento.

Ponto-chave (Demanda 1.1): a **nota fiscal e a entrada no estoque** acontecem no
momento do **recebimento** (conferência) ou da **conclusão do serviço** — **não** no
pagamento. O **pagamento** é uma etapa **posterior e separada**, feita na tela
**Financeiro**, e é o que muda a ordem de *Aguardando pagamento* para *Concluída*.

[SCREENSHOT: aba "Ordens de Compra" com a lista de ordens e o filtro de status]

---

## 1. Fluxos passo a passo

### 1.1 Receber uma compra de PRODUTO

1. **Criar a ordem**: na aba *Ordens de Compra*, clique em **"Nova Ordem"**, escolha
   o tipo **Produto**, selecione o fornecedor e adicione os itens.
2. **Enviar para aprovação**: no card da ordem (*Em andamento*), clique em **"Enviar
   para Aprovação"** e confirme. A ordem fica **bloqueada para edição**.
3. **Aprovação** (feita pelo Financeiro): ao aprovar, define-se a forma de pagamento
   (à vista ou parcelado). A ordem passa para **Aprovada**.
4. **Conferir o recebimento**: vá em **Estoque → Recebimentos**, abra a ordem e clique
   para iniciar a conferência. Informe, item a item, a **quantidade aceita** e a
   **quantidade recusada** (com **motivo**, obrigatório quando há recusa). O sistema
   mostra o **total a pagar** dos itens aceitos em tempo real.
5. **Finalizar a conferência**: clique em **"Finalizar Conferência"** e confirme.

**O que o sistema faz ao finalizar (tudo de uma vez):**
   - emite a **NF de recebimento** dos itens aceitos;
   - **dá entrada no estoque** dos itens aceitos;
   - se houver itens recusados, emite a **NF de devolução** e **notifica o fornecedor**;
   - se houver frete, emite a **NF de transporte**;
   - **gera a conta a pagar** no Financeiro (à vista ou em parcelas);
   - a ordem passa para **Aguardando pagamento**.

   Toast: *"Conferência finalizada — NF de recebimento emitida, estoque atualizado e
   conta a pagar de R$ X gerada."* e, havendo recusados, *"N item(ns) recusado(s) —
   NF de devolução emitida; fornecedor notificado."*

6. **Pagar** (etapa posterior): ver **1.3**.

[SCREENSHOT: tela de conferência com itens aceitos/recusados e o total a pagar]

### 1.2 Concluir uma compra de SERVIÇO

1. **Criar a ordem** do tipo **Serviço** (descrição + valor total).
2. **Enviar para aprovação** e aguardar a **aprovação** do Financeiro → ordem fica
   **Aprovada**.
3. **Concluir o serviço**: no card da ordem aprovada, clique em **"Concluir Serviço"**
   e confirme.
   - O sistema **emite a NF de serviço** e gera a **conta a pagar**.
   - A ordem passa para **Aguardando pagamento**.
   - Toast: *"Serviço concluído — NF de serviço emitida, aguardando pagamento."*
4. **Pagar** (etapa posterior): ver **1.3**.

> Serviço **não** passa por conferência de estoque e **não** movimenta estoque.

### 1.3 Pagar a compra (à vista e parcelada)

O pagamento é feito na tela **Financeiro** (módulo de contas a pagar), **não** na tela
de Compras.

- **À vista**: ao quitar a única conta a pagar, a ordem passa imediatamente para
  **Concluída**.
- **Parcelada**: existe uma conta a pagar por parcela. A ordem **só** fica
  **Concluída** quando **todas** as parcelas estiverem quitadas. Enquanto houver
  parcela em aberto, a ordem permanece em **Aguardando pagamento**.

Significados práticos:
   - **Aguardando pagamento** = mercadoria/serviço já recebido, NF já emitida, faltando
     pagar.
   - **Concluída** = todas as contas a pagar quitadas.

### 1.4 Encontrar as notas de uma compra

1. No card de uma ordem em **Aguardando pagamento** ou **Concluída**, clique em
   **"Ver notas relacionadas"**.
2. O sistema abre a tela **Faturamento filtrada por aquela ordem**, com um banner
   *"Notas da compra #XXXXXXXX"*.
3. Ali aparecem todas as notas da ordem (recebimento, devolução e transporte para
   produto; NF de serviço para serviço).
4. Use **"Limpar filtro"** para voltar à listagem geral. (Detalhes em
   `docs/frontend/faturamento.md`.)

### 1.5 Cancelar uma nota fiscal da compra

O cancelamento é feito na tela **Faturamento**, na própria nota. Resumo dos efeitos
(regra "o dinheiro só se move no pagamento"):

- **Recebimento**: os itens aceitos **saem** do estoque; se a compra **já foi paga**,
  o valor é **estornado**; senão, a(s) conta(s) a pagar em aberto são **canceladas**.
- **Transporte (de compra)**: mesmo princípio (estorno do frete se pago; senão cancela
  a conta a pagar).
- **Serviço**: sem efeito no estoque; estorno se pago, senão cancela a conta a pagar.
- **Devolução**: os itens voltam ao estoque como **AVARIADOS**.

Detalhes completos e a tela de cancelamento estão em `docs/frontend/faturamento.md`.

---

## 2. Glossário de status da ordem de compra

| Status | Badge | O que significa para o usuário | Ações possíveis |
|--------|-------|--------------------------------|-----------------|
| **Em andamento** | Azul | Rascunho editável; ainda não enviada | Enviar para aprovação; excluir |
| **Aguardando aprovação** | Amarelo | Enviada ao Financeiro; **bloqueada para edição** | Aguardar; (Financeiro) aprovar/recusar |
| **Aprovada** | Verde claro | Aprovada. Produto: segue para conferência (Estoque); Serviço: pode ser concluído | Produto: conferir em Estoque; Serviço: **Concluir Serviço** |
| **Em conferência** | Laranja | Conferência de recebimento em andamento | Finalizar conferência (em Estoque) |
| **Aguardando pagamento** | Roxo | Mercadoria/serviço **recebido**, **NF emitida**; falta pagar | **Ver notas relacionadas**; pagar (Financeiro) |
| **Concluída** | Verde escuro | Todas as contas a pagar quitadas | **Ver notas relacionadas** |
| **Cancelada** | Cinza | Ordem cancelada (recusada ou cancelada) | Consultar motivo no card |

[SCREENSHOT: cards de ordem em diferentes status mostrando os badges coloridos]

---

## 3. Tipos de nota gerados pela compra

| Nota | Quando é gerada | Estoque |
|------|-----------------|---------|
| **Recebimento** | Ao finalizar a conferência (itens aceitos) | Dá entrada |
| **Devolução** | Ao finalizar a conferência, se houver recusados | Itens AVARIADOS |
| **Transporte** | Quando a compra tem frete | — |
| **Serviço** | Ao Concluir Serviço | — |

A visualização, o PDF e o cancelamento dessas notas ficam na tela **Faturamento**.

---

## 4. Ações da tela (botões do OrdemCard)

| Status da ordem | Botões disponíveis |
|-----------------|--------------------|
| **Em andamento** | "Enviar para Aprovação" (com confirmação) + excluir (lixeira) |
| **Aguardando aprovação** | Cadeado (somente leitura) |
| **Aprovada** (serviço) | **"Concluir Serviço"** (com confirmação) |
| **Aguardando pagamento** | **"Ver notas relacionadas"** (ícone documento) |
| **Concluída** | **"Ver notas relacionadas"** |
| (todos) | Expandir/recolher (˅) para ver itens ou a descrição do serviço |

O botão **"Ver notas relacionadas"** apenas **navega** para
`/faturamento?order_id=<ordem>` (não faz busca de dados na própria tela de Compras).

**Filtro disponível:** seletor de **status** no topo da aba Ordens (todos os 7 status).

---

## 5. Mensagens e confirmações

**Diálogos de confirmação:**

- **Enviar para aprovação financeira?** — "Após enviada, a ordem ficará bloqueada para
  edição. Para alterações, cancele e crie uma nova ordem."
- **Confirmar conclusão do serviço?** — "O serviço de **{fornecedor}** será marcado
  como concluído e enviado para pagamento. Esta ação não pode ser desfeita."
- **Finalizar conferência?** — "Ao finalizar, a NF de recebimento será emitida, o
  estoque dos itens aceitos será atualizado e uma conta a pagar de **R$ X** será gerada
  no financeiro. O pagamento é uma etapa posterior e separada." (+ aviso de itens
  recusados, quando houver).
- **Excluir ordem de compra?** — exclusão permanente da ordem (apenas em *Em andamento*).

**Toasts:**

- *"Ordem enviada para aprovação financeira"*
- *"Serviço concluído — NF de serviço emitida, aguardando pagamento."*
- *"Conferência finalizada — NF de recebimento emitida, estoque atualizado e conta a
  pagar de R$ X gerada."*
- *"N item(ns) recusado(s) — NF de devolução emitida; fornecedor notificado."*

---

## Referência técnica

### Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/compras/page.tsx` | Page | Página em abas; carrega ordens, fornecedores e itens de estoque |
| `services/compras.ts` | Service | Orquestra chamadas a `/api/compras/*`; converte Decimal → number |
| `components/modules/compras/OrdemCard.tsx` | Componente | Card com badges, botões contextuais e expand; navega para as NFs da ordem |
| `components/modules/estoque/ConferenciaRecebimento.tsx` | Componente | Form de conferência (aceito/recusado) + confirmação |
| `components/modules/compras/OrdemForm.tsx` | Componente | Dialog Produto/Serviço |
| `components/modules/compras/FornecedorForm.tsx` / `FornecedorRow.tsx` | Componentes | CRUD de fornecedores |

### `OrdemCard` — navegação para as notas

```typescript
const router = useRouter()                 // next/navigation
const hasInvoices =
  order.status === "aguardando_pagamento" || order.status === "concluida"
function verNotasRelacionadas() {
  router.push(`/faturamento?order_id=${order.id}`)
}
```

O botão "Ver notas relacionadas" (ícone `FileText`) aparece quando `hasInvoices` é
verdadeiro (produto **ou** serviço). O componente continua **sem fetch** — só navega.

### Fluxo de status (técnico)

```
em_andamento ──[Enviar para Aprovação]──▶ aguardando_aprovacao_financeiro
                                                │
                          [Aprovar] ◀──────────┤──────────▶ [Recusar] → cancelada
                               ↓
                            aprovada
              produto: (Estoque → Recebimentos)        serviço: [Concluir Serviço]
                               ↓                                   │ (emite NF de serviço)
                          em_conferencia                           │
              (finalizar: emite NFs + entrada estoque + AP)        │
                               ↓                                   ↓
                       aguardando_pagamento ◀──────────────────────┘
                               ↓ (todas as contas a pagar quitadas, no Financeiro)
                            concluida
```

### Service methods (resumo)

| Função | Endpoint |
|--------|----------|
| `enviarParaAprovacao(id)` | `POST /api/compras/ordens/{id}/enviar-aprovacao` |
| `aprovarOrdem(id, data)` | `POST /api/compras/ordens/{id}/aprovar` |
| `recusarOrdem(id, note)` | `POST /api/compras/ordens/{id}/recusar` |
| `concluirServico(id)` | `POST /api/compras/ordens/{id}/concluir-servico` (emite NF de serviço; `aprovada → aguardando_pagamento`) |
| `iniciarConferencia(id)` | `POST /api/compras/ordens/{id}/iniciar-conferencia` |
| `finalizarConferencia(id, items)` | `POST /api/compras/ordens/{id}/finalizar-conferencia` (emite NFs + entrada de estoque + conta a pagar) |
| `getRecebimentos()` / `getRecebimento(id)` | `GET /api/compras/recebimentos[/{id}]` |

### Tipos relevantes (`types/index.ts`)

`PurchaseOrderStatus` (7 valores), `PurchaseOrder`, `PurchaseOrderItem`,
`PurchaseOrderReceiptItem`, `PurchaseOrderWithReceipts`. `order_type: "produto" |
"servico"`.

---

## Aba Cotações

Permite cotar produtos ou serviços com vários fornecedores, comparar propostas,
escolher um vencedor, obter aprovação do Financeiro e converter a cotação vencedora em
uma ordem de compra já aprovada.

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
| `CotacaoForm.tsx` | Dialog para criar cotação (toggle Produto/Serviço, itens dinâmicos, RHF + Zod) |
| `CotacaoCard.tsx` | Card por cotação com badges e botões contextuais; abre detalhe e "Realizar Pedido" |
| `CotacaoDetalheModal.tsx` | Detalhe; tabela de comparação de propostas, seleção de vencedor, CRUD de proposta |
| `PropostaForm.tsx` | Dialog adicionar/editar proposta; trata 409 (fornecedor duplicado) |
| `RealizeOrderModal.tsx` | Resumo da proposta vencedora + `ordered_at`, `notes`, `shipping_cost` |

### Service functions (`services/compras.ts`)

`getCotacoes(status?, order_type?)`, `getCotacao(id)`, `createCotacao(data)`,
`deleteCotacao(id)`, `addProposta(...)`, `updateProposta(...)`, `deleteProposta(...)`,
`selecionarVencedor(...)`, `aprovarCotacao(id)`, `cancelarCotacao(id, note)`,
`realizarPedido(id, data)`. Cada uma converte `Decimal` (string) → number.

### Aprovação (Financeiro)

A aba **Aprovações** de `financeiro/page.tsx` lista **Ordens de Compra Pendentes** e
**Cotações Aguardando Aprovação** (`aguardando_aprovacao_financeiro`), com **Aprovar**
e **Recusar** (motivo obrigatório). Na aprovação de ordem coleta-se a forma de
pagamento (à vista/parcelado) e o parcelamento.

---

## Aba Fornecedores

- Botão **"Novo Fornecedor"** e lista de `FornecedorRow` (nome, documento, e-mail,
  telefone, endereço; editar/excluir).
