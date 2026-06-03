# Frontend Module: Faturamento

> Esta documentação serve de base para o **Manual do Usuário Final**. Ela descreve,
> em linguagem clara, o que o usuário vê e faz na tela de Faturamento e o que o
> sistema faz em resposta. A parte técnica (tipos, serviços, PDF) está ao final.

## Visão geral

A tela **Faturamento** (`/faturamento`) é onde ficam todas as **notas fiscais (NFs)**
do sistema: as de **venda** (emitidas para clientes) e as de **compra**
(recebimento, devolução, transporte e serviço). Aqui o usuário pode:

- consultar e filtrar notas por status;
- abrir o **PDF** de qualquer nota fiscal;
- **marcar uma fatura de venda como paga**;
- **cancelar uma nota fiscal** (com os efeitos corretos no estoque e no financeiro);
- ver **apenas as notas de uma compra específica**, quando chega por meio do botão
  "Ver notas relacionadas" da tela de Compras.

[SCREENSHOT: tela de Faturamento com a lista de notas e o filtro de status]

---

## 1. Fluxos passo a passo

### 1.1 Consultar e filtrar notas

1. Abra o menu **Faturamento**.
2. A lista mostra todas as notas, da mais recente para a mais antiga.
3. Use o seletor **"Todos os status"** para filtrar por **Emitida**, **Paga** ou
   **Cancelada**.
4. Ao lado do filtro, o sistema mostra a **contagem de notas** e o **total em R$**
   das notas exibidas.
5. Clique na **seta** (˅) de uma nota para expandir e ver os itens, quantidades e
   subtotais.

### 1.2 Abrir o PDF de uma nota fiscal

1. Em qualquer nota de compra (Recebimento, Devolução, Transporte, Serviço) ou de
   venda, clique no botão **"PDF"**.
2. O sistema gera o documento na hora (botão mostra "Gerando...") e baixa o arquivo
   `INV-XXXX.pdf`.
3. O layout muda conforme o tipo da nota — ver seção **Tipos de Nota Fiscal**.

[SCREENSHOT: nota fiscal expandida com o botão PDF em destaque]

### 1.3 Marcar uma fatura de venda como paga

> Vale **apenas para faturas de venda**. As notas de compra **não** são pagas
> aqui — o pagamento das compras é feito na tela **Financeiro** (ver doc de Compras).

1. Localize a fatura de venda com status **Emitida**.
2. No seletor de status do card, escolha **"Paga"**.
3. Confirme no diálogo **"Confirmar pagamento?"**.
4. O sistema marca como **Paga** e registra a entrada no Financeiro.
   Toast: *"Fatura marcada como paga — movimentação registrada no financeiro"*.

### 1.4 Encontrar as notas de uma compra ("Ver notas relacionadas")

Quando você está na tela **Compras** e clica em **"Ver notas relacionadas"** numa
ordem (disponível a partir de *Aguardando pagamento*), o sistema abre a tela de
Faturamento **já filtrada por aquela ordem**:

1. Aparece um **banner azul** no topo: *"Notas da compra #XXXXXXXX"*.
2. A lista mostra **somente as notas daquela compra** (ex.: recebimento + transporte,
   ou a NF de serviço).
3. Para voltar à listagem geral, clique em **"Limpar filtro"**.
4. O filtro fica gravado no endereço da página (`?order_id=...`), então **recarregar
   a página mantém o filtro** e o link pode ser compartilhado.

[SCREENSHOT: tela de Faturamento filtrada por ordem, com o banner "Notas da compra #..." e o botão "Limpar filtro"]

### 1.5 Cancelar uma nota fiscal

1. Na nota desejada (status **Emitida** ou **Paga**), clique em **"Cancelar NF"**
   (botão vermelho).
2. Leia o texto do diálogo — ele **explica exatamente o que vai acontecer** no
   estoque e no financeiro, conforme o tipo da nota (ver tabela em **1.6**).
3. Opcionalmente, informe um **Motivo**.
4. Clique em **"Cancelar NF"** para confirmar.
5. Sucesso → toast *"Nota fiscal cancelada com sucesso"*; a nota passa a **Cancelada**
   e mostra a data e o motivo do cancelamento.

> Cancelamento é **irreversível**. Uma nota já **Cancelada** não pode ser cancelada
> de novo (o sistema recusa com mensagem clara).

### 1.6 O que cada cancelamento faz (regra "o dinheiro só se move no pagamento")

Para compras, vale a regra: **o financeiro só é estornado se a compra já foi paga**;
se ainda **não** foi paga, o sistema apenas **cancela a(s) conta(s) a pagar em aberto**.

| Nota cancelada | Efeito no estoque | Efeito no financeiro |
|----------------|-------------------|----------------------|
| **Recebimento** (compra) | Os itens recebidos **saem** do estoque | Se a compra **já foi paga**, o valor é **estornado**; senão, a(s) conta(s) a pagar em aberto são **canceladas** |
| **Transporte (de compra)** | — | Mesmo princípio do recebimento (estorno do frete se pago; senão cancela a conta a pagar) |
| **Transporte (de venda)** | — | **Estorna o valor do frete** |
| **Serviço** (compra) | Sem efeito no estoque | Se a compra **já foi paga**, o valor é **estornado**; senão, a(s) conta(s) a pagar em aberto são **canceladas** |
| **Devolução** (avariado) | Os itens devolvidos voltam ao estoque como **AVARIADOS** | — |
| **Venda** | Os produtos voltam ao estoque | Cancela as **contas a receber** vinculadas |

O sistema diferencia transporte **de compra** de transporte **de venda** pela
referência registrada na própria nota (ordem de compra × venda).

---

## 2. Tipos de Nota Fiscal e seus badges

Cada nota exibe um **badge colorido** indicando o tipo. Quando a nota não tem cliente
(notas de compra), aparece um texto em itálico identificando o documento.

| Tipo | Badge | Quando é gerada | Texto sem cliente |
|------|-------|-----------------|-------------------|
| **Venda** | "NF-e Venda" (roxo) | Ao registrar uma venda | (mostra o cliente) |
| **Recebimento** | "Recebimento" (azul) | Ao **finalizar a conferência** de uma compra de produto (itens aceitos) | "Nota fiscal de recebimento" |
| **Devolução** | "Devolução" (vermelho) + "Vinculada" | Ao finalizar a conferência, quando há **itens recusados** | "Nota fiscal de devolução" |
| **Transporte** | "Transporte" (âmbar) | Quando a compra/venda tem **frete** | "Nota fiscal de transporte" |
| **Serviço** | "Serviço" (índigo) | Ao **Concluir Serviço** de uma compra de serviço | "Nota fiscal de serviço" |

Outros indicadores no card:

- **"Fornecedor notificado"** (✓ verde) — quando a nota de devolução registra a
  notificação ao fornecedor.
- **"Parcelada"** / **"Gerada automaticamente"** — para faturas de venda.
- Faturas parceladas exibem no título: `INV-XXXX — Parcela X/Y`.

[SCREENSHOT: vários cards lado a lado mostrando os badges Venda, Recebimento, Devolução, Transporte e Serviço]

---

## 3. Ações da tela (o que cada botão faz)

| Ação | Onde aparece | O que faz |
|------|--------------|-----------|
| **Filtro de status** | topo da lista | Filtra por Emitida / Paga / Cancelada (ou Todos) |
| **Seleção "Paga"** | faturas de venda emitidas | Marca a fatura como paga e lança a entrada no Financeiro |
| **PDF** | toda nota fiscal | Gera e baixa o PDF da nota |
| **Cancelar NF** | notas Emitida/Paga | Cancela a nota com os efeitos da tabela 1.6 |
| **Expandir (˅)** | todo card | Mostra/oculta os itens da nota |
| **Limpar filtro** | banner de ordem | Remove o filtro por ordem e volta à listagem geral |
| **Nova Fatura Manual** | topo da tela | Abre o formulário de fatura avulsa para um cliente |

**Filtros disponíveis:** por **status** (seletor) e por **ordem de compra** (ativado
ao chegar via "Ver notas relacionadas"; os dois podem ser combinados).

---

## 4. Mensagens e confirmações

**Diálogos de confirmação:**

- **Confirmar pagamento?** — "A fatura **INV-XXXX** será marcada como paga e uma
  entrada será registrada no financeiro. Esta ação não pode ser desfeita."
- **Cancelar nota fiscal INV-XXXX?** — texto varia pelo tipo (ver tabela 1.6),
  sempre encerrando com "Esta ação não pode ser desfeita." + campo **Motivo (opcional)**.

**Toasts (mensagens rápidas):**

- *"Fatura marcada como paga — movimentação registrada no financeiro"*
- *"Nota fiscal cancelada com sucesso"*
- *"Erro ao gerar PDF"* / *"Erro ao cancelar nota fiscal"* (com a mensagem do backend)

---

## Referência técnica

### Page

`/faturamento` — página única. O conteúdo que lê os parâmetros da URL
(`useSearchParams`) é extraído para `FaturamentoContent` e envolvido em
`<Suspense>` (exigência do App Router). Sem `?order_id` na URL o comportamento é o
mesmo de antes; com `?order_id=<uuid>` exibe o banner contextual e filtra a lista.

### Componentes

**`FaturaCard`** — card expansível por nota. Header: número, badge de status, badge
de tipo de NF, nome do cliente (ou texto itálico para notas sem cliente), datas,
total. Ações: PDF (notas fiscais) ou Select de status (faturas de venda), "Cancelar
NF" e expandir.

- `getNfType(invoice)` prioriza `invoice.invoice_type`
  (`venda`/`recebimento`/`devolucao`/`transporte`/`servico`) e usa
  `detectNfType(notes)` como fallback (prefixos `[NF-RECEBIMENTO]`, `[NF-DEVOLUCAO]`,
  `[NF-TRANSPORTE]`, `[NF-SERVICO]`).
- `NfType = "venda" | "recebimento" | "devolucao" | "transporte" | "servico"`.
- Texto de cancelamento: `CANCEL_DESCRIPTIONS[nfType]`; para **transporte de compra**
  (com `order_id` no notes) usa `CANCEL_TRANSPORTE_COMPRA` (estorno só se pago);
  transporte de **venda** mantém "estornará o valor do frete".

**`FaturaManualForm`** — Dialog (RHF + Zod) para faturas avulsas: cliente, vencimento,
observações e itens dinâmicos com subtotal/total em tempo real.

### Service (`services/faturamento.ts`)

```typescript
getFaturas(params?: { status?: string; client_id?: string; order_id?: string }): Promise<Invoice[]>
createFatura(data): Promise<Invoice>
getFatura(id: string): Promise<Invoice>
updateFaturaStatus(id: string, status: InvoiceStatus): Promise<Invoice>
cancelarFatura(id: string, reason?: string): Promise<Invoice>  // POST .../{id}/cancelar
```

`order_id` é repassado como query param (omitido quando vazio, via `apiFetch`). O
backend filtra as NFs da ordem pelo `notes ILIKE %order_id=<uuid>%` e retorna o
envelope `SuccessResponse` (`data: []`).

### PDF

Gerado com `jspdf` via import dinâmico (SSR-safe). Notas de **venda**, **recebimento**
e **devolução** usam o layout fiscal completo (NCM/CFOP/impostos). Notas de
**transporte** e **serviço** usam o layout simples `generateSimplePdf(invoice, title)`
(descrição + total, sem CFOP de mercadoria): títulos "NOTA FISCAL DE TRANSPORTE" e
"NOTA FISCAL DE SERVIÇO".

### Tipos (`types/index.ts`)

```typescript
type InvoiceStatus = "emitida" | "paga" | "cancelada"

interface Invoice {
  id: string
  number: string
  sale_id: string | null          // null = não originada de venda
  client_id: string | null        // null = NF sem cliente (compras, inclui serviço)
  client_name: string
  status: InvoiceStatus
  total_amount: number
  issue_date: string
  due_date: string | null
  notes: string | null
  invoice_type: string            // "venda" | "recebimento" | "devolucao" | "transporte" | "servico"
  installment_number: number | null
  installment_total: number | null
  parent_invoice_id: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  items: InvoiceItem[]
  created_at: string
  updated_at: string
}
```

`invoice_type` permanece `string` no tipo `Invoice` (cobre `servico`); a união
estrita `NfType` (que inclui `servico`) é interna ao `FaturaCard`.
