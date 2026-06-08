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
| `components/modules/compras/OrdemForm.tsx` | Componente | Dialog Produto/Serviço; produto usa fluxo produto→fornecedor com preço do catálogo |
| `components/modules/compras/FornecedorForm.tsx` | Componente | Cadastro/edição de fornecedor (RHF+Zod), validação de documento e busca de CEP (ViaCEP) |
| `components/modules/compras/FornecedoresTable.tsx` | Componente | Lista de fornecedores em DataTable (busca/ordenação/paginação no cliente) + ações (catálogo/editar/excluir) |
| `components/modules/compras/CatalogoFornecedorModal.tsx` | Componente | Gerência do catálogo do fornecedor (DataTable paginada: adicionar/editar preço/ativar/remover) |
| `lib/br-documents.ts` | Util | `isValidCpf`/`isValidCnpj`/`validateDocument` (DV oficiais, espelha o backend) + máscaras |
| `services/cep.ts` | Service | `lookupCep` (ViaCEP, best-effort — não trava o form) |

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
| `getCatalogoFornecedor(id, params)` | `GET /api/compras/fornecedores/{id}/itens` (Page[T]) |
| `addItemCatalogo` / `updateItemCatalogo` / `deleteItemCatalogo` | `POST/PUT/DELETE /api/compras/fornecedores/{id}/itens[/{itemId}]` |
| `getFornecedoresDoProduto(stockItemId)` | `GET /api/compras/produtos/{stock_item_id}/fornecedores` |

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

A aba **Fornecedores** mostra a lista de fornecedores em uma **tabela paginada**
(busca por nome, documento ou e-mail; colunas Nome/Documento, E-mail, Telefone e
Endereço; ordenação por Nome). Cada linha tem três ações à direita: **Itens
vendidos** (catálogo), **Editar** (lápis) e **Excluir** (lixeira).

[SCREENSHOT: aba "Fornecedores" com a tabela paginada e o campo de busca]

### Cadastrar / editar um fornecedor (com busca de CEP)

1. Clique em **"Novo Fornecedor"** (ou no lápis para editar).
2. Preencha **Nome** (obrigatório). O **CNPJ / CPF** é opcional, mas, se
   informado, é **validado**: o sistema confere os dígitos verificadores e, se o
   número for inválido, exibe **"CPF ou CNPJ inválido"** e **não deixa salvar**.
   O campo aplica a máscara automaticamente conforme você digita.
3. No bloco **Endereço**, digite o **CEP** (máscara `00000-000`). Ao sair do
   campo, o sistema **busca o endereço** e preenche **Rua, Bairro, Cidade e UF**
   automaticamente. Todos os campos continuam **editáveis**; você completa
   **Número** e **Complemento**.
   - Se o CEP não existir, aparece o aviso **"CEP não encontrado"** e você
     preenche o endereço à mão.
   - Se a busca de CEP estiver indisponível, aparece **"Não foi possível
     consultar o CEP. Preencha o endereço manualmente."** — isso **não impede**
     salvar o fornecedor.
4. Clique em **"Criar fornecedor"** / **"Salvar alterações"**. Toast de sucesso.

[SCREENSHOT: formulário de fornecedor com endereço preenchido após a busca de CEP]

### Gerenciar o catálogo de um fornecedor (itens vendidos)

O **catálogo** define **o que** cada fornecedor vende e **por quanto** — é o que
alimenta a seleção de fornecedores na ordem de compra.

1. Na linha do fornecedor, clique no ícone **Itens vendidos** (livro). Abre a
   janela **"Itens vendidos — {fornecedor}"**.
2. Para **adicionar**: escolha o **Item de estoque**, informe o **Preço unit.** e
   clique em **"Adicionar"**. (Itens marcados como avariados **não** aparecem na
   lista de escolha.)
3. A tabela lista os itens do catálogo (paginada, ordenável por Item e Preço).
   Para cada item você pode:
   - **Editar o preço** direto na célula (digite e tecle Enter ou clique fora);
   - **Ativar/Inativar** clicando no selo de status (**Ativo** / **Inativo**) —
     itens inativos continuam no catálogo, mas não são oferecidos na ordem;
   - **Remover** o item do catálogo (lixeira, com confirmação).

[SCREENSHOT: janela "Itens vendidos" com a linha de adicionar e a tabela do catálogo]

**Mensagens do catálogo:** *"Item adicionado ao catálogo"*, *"Preço atualizado"*,
*"Item ativado"* / *"Item desativado"*, *"Item removido do catálogo"*. Tentar
adicionar um item já existente mostra *"Item já cadastrado no catálogo deste
fornecedor"*.

### Criar uma ordem de compra de PRODUTO (fluxo produto → fornecedor)

Ao criar uma ordem do tipo **Produto** (botão **"Nova Ordem"** na aba *Ordens de
Compra*), o fluxo começa **pelo produto**:

1. Em cada linha, escolha o **Produto** primeiro. (Produtos avariados não
   aparecem.)
2. O campo **Fornecedor** da linha passa a listar **apenas os fornecedores que
   vendem aquele produto**, cada um com o **preço sugerido** do catálogo. Escolha
   um — isso **fixa o fornecedor da ordem** (uma ordem tem um único fornecedor).
3. O **Preço unit.** vem **pré-preenchido** com o preço do catálogo e é
   **editável** (negociação). Informe a **Quantidade**.
4. Para as **demais linhas**, o dropdown de **Produto** já fica restrito ao
   **catálogo do fornecedor escolhido**, e o preço vem sugerido. O fornecedor
   aparece fixo em cada linha.
5. Para mudar de fornecedor, clique em **"Trocar fornecedor"**: os itens que
   **não** fazem parte do catálogo do novo fornecedor são **removidos** (aviso
   *"N item(ns) removido(s) por não fazerem parte do catálogo de {fornecedor}"*).
6. Opcionalmente informe **Valor do Transporte** e **Observações** e clique em
   **"Criar ordem"**.

[SCREENSHOT: nova ordem de produto mostrando produto escolhido e o dropdown de fornecedores com preço sugerido]

> A partir daí a ordem segue o fluxo normal de aprovação e conferência (seção 1.1).

### Cotação de serviço → pedido pagável

No fluxo de **Cotações** de **serviço**, ao clicar em **"Realizar Pedido"** na
cotação aprovada, o sistema cria a ordem de compra **já em Aguardando pagamento**
(NF de serviço emitida e conta a pagar gerada) — pronta para ser paga no
Financeiro. Toast: *"Pedido realizado — NF de serviço emitida; ordem aguardando
pagamento."* (Produto continua indo para **Aprovada**, rumo à conferência:
*"Pedido realizado! Ordem de compra criada e aprovada, pronta para conferência."*)
