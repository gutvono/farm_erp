# Frontend Module: Comercial

## Visão Geral

Página única com 2 abas (Tabs shadcn): **Vendas** e **Clientes**. O cadastro de cliente
está em paridade com o de fornecedor (Demanda 7): valida CPF/CNPJ e tem endereço
estruturado com busca automática por CEP (ViaCEP). Vendas são criadas com itens
dinâmicos de café e avisam quando o cliente está inadimplente. O cancelamento de venda
é uma **ação dedicada** ("Cancelar venda") que estorna estoque e financeiro — deixou de
ser uma simples troca de status.

[SCREENSHOT: aba Comercial com as duas abas (Vendas / Clientes)]

> **Demanda 8 — listas viraram tabelas paginadas.** As duas abas, que antes eram cartões
> empilhados, agora são **tabelas** (shadcn) com **paginação no servidor** (Anterior/Próxima),
> ordenação ao clicar nos cabeçalhos e filtros/busca no topo. O conteúdo e as ações dos
> cartões antigos foram preservados: o que não virou coluna foi para um **painel de detalhe**
> que abre à direita (ver abaixo).

## Listas em tabela (Demanda 8)

### Clientes
- **Colunas:** Nome (com badge **Inadimplente** e o documento abaixo), Email, Telefone,
  Endereço (composto a partir dos campos), Cadastro e as ações.
  - **Inadimplência efetiva (Demanda 9.A):** o badge **Inadimplente** aparece tanto para
    quem foi **marcado manualmente** quanto para quem tem **parcela vencida** (mesmo sem
    marcação). Passe o mouse no badge para ver a **origem** (manual, vencida ou ambas).
- **Ordenar:** clique em **Nome** ou **Cadastro**.
- **Filtrar/buscar:** caixa **Buscar** (nome ou documento) e o botão **Apenas inadimplentes**.
- **Ações na linha:** **Editar** (abre o formulário) e **Excluir** (com confirmação).

[SCREENSHOT: aba Clientes em tabela com busca, "Apenas inadimplentes" e paginação]

### Vendas
- **Colunas:** Cliente, Status (badge), Data, Itens, Total e a ação **Detalhes**.
- **Ordenar:** clique em **Status** ou **Data**.
- **Filtrar:** seletor de **Status** (Realizada / Entregue / Cancelada).
- **Detalhe da venda:** clique em **Detalhes** para abrir o painel lateral. É de lá que saem
  **todas** as ações da venda — marcar **Entregue**, **Cancelar venda** (estorno ponta a ponta),
  **Ver notas fiscais** da venda e ver os itens. Nada se perdeu em relação ao cartão antigo.

[SCREENSHOT: aba Vendas em tabela + painel de detalhe com "Cancelar venda" e "Ver notas fiscais"]

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/comercial/page.tsx` | Page | Abas; orquestra hooks de tabela + formulários; mantém a lista completa de clientes para o seletor da venda |
| `services/comercial.ts` | Service | `/api/comercial/*`; helpers ARRAY (seletores) + `getClientesPaginated`/`getVendasPaginated`; `cancelarVenda` |
| `services/cep.ts` | Service | `lookupCep` (ViaCEP) — reusado do Compras (D6) |
| `lib/br-documents.ts` | Util | `validateDocument`, `maskDocument`, `maskCep`, `onlyDigits` — reusado do Compras (D6) |
| `lib/use-debounced-value.ts` | Hook | Debounce da busca textual das tabelas (Demanda 8) |
| `components/modules/comercial/useClientes.ts` | Hook | Estado da tabela de clientes (página/ordenação/filtro/busca) |
| `components/modules/comercial/ClientesTable.tsx` | Componente | DataTable de clientes + editar/excluir |
| `components/modules/comercial/useVendas.ts` | Hook | Estado da tabela de vendas |
| `components/modules/comercial/VendasTable.tsx` | Componente | DataTable de vendas + painel de detalhe (`VendaCard`) |
| `components/modules/comercial/ClienteForm.tsx` | Componente | Dialog (criar/editar) com RHF + Zod, validação de documento e endereço + ViaCEP |
| `components/modules/comercial/VendaForm.tsx` | Componente | Dialog com aviso + confirmação de inadimplência, itens dinâmicos, subtotais e total |
| `components/modules/comercial/VendaCard.tsx` | Componente | Detalhe da venda (reusado no painel): "Cancelar venda", "Ver notas fiscais", troca de status |

## Cadastrar / editar cliente

O `ClienteForm` espelha o cadastro de fornecedor:

- **CPF / CNPJ (opcional):** o campo aplica máscara automática (CPF `000.000.000-00` ou
  CNPJ `00.000.000/0000-00`). Se for deixado em branco, o cliente é salvo normalmente.
  **Se preenchido com um documento inválido, o salvamento é bloqueado** com a mensagem
  "CPF ou CNPJ inválido" (validação por dígitos verificadores, igual ao backend).
- **Endereço estruturado:** CEP, Rua/Logradouro, Número, Complemento, Bairro, Cidade e UF.
  - Ao digitar um **CEP completo (8 dígitos)** e sair do campo (blur), o sistema busca o
    endereço no ViaCEP e **preenche automaticamente** Rua, Bairro, Cidade e UF — todos
    permanecem editáveis.
  - CEP inexistente → toast **"CEP não encontrado"** (o resto continua editável).
  - Falha de rede na consulta → toast **"Não foi possível consultar o CEP. Preencha o
    endereço manualmente."** (o formulário não trava).

[SCREENSHOT: ClienteForm com documento mascarado e endereço preenchido via CEP]

Mensagens: "Cliente criado com sucesso" / "Cliente atualizado com sucesso".

### Listagem de clientes (`ClienteRow`)
- Mostra nome, documento, email, telefone e o **endereço composto** numa linha menor
  abaixo (ex.: `Rua das Flores, 123 - Apto 4 · Centro · São Paulo/SP · 01234-000`).
  Cai para o endereço legado (texto livre) quando os campos novos estão vazios.
- Badge vermelho **"Inadimplente"** quando o cliente é inadimplente **efetivo** — por
  marcação manual **ou** por ter **parcela vencida** (Demanda 9.A). O tooltip do badge diz
  a origem.

[SCREENSHOT: lista de clientes com endereço composto e badge Inadimplente (cliente com parcela vencida, sem marcação manual)]

## Abas

### 1. Vendas
- Select de filtro por status (`all`, `realizada`, `entregue`, `cancelada`)
- Botão "Nova Venda" abre `VendaForm`
- Lista de `VendaCard`; expandível mostra tabela de itens

### 2. Clientes
- Contador de clientes e inadimplentes (vermelho se > 0)
- Toggle "Apenas inadimplentes" filtra via `getClientes(true)`
- Botão "Novo Cliente" abre `ClienteForm`
- Lista de `ClienteRow`

## Vender — aviso de inadimplência (avisar, não bloquear)

No `VendaForm`, quando o cliente selecionado está inadimplente — **efetivo**: marcação
manual **ou** parcela vencida (Demanda 9.A):

1. Aparece um **banner amarelo** abaixo do Select: "Este cliente está inadimplente"
   (no Select, o nome também leva o sufixo ⚠️).
2. Ao clicar em **Criar venda**, abre um **AlertDialog de confirmação** ("Cliente
   inadimplente — deseja continuar com a venda mesmo assim?").
   - **Continuar com a venda** → conclui a venda (o backend **não** bloqueia).
   - **Voltar** → fecha o diálogo, nada acontece.

Para clientes adimplentes, o "Criar venda" finaliza direto, sem o diálogo extra.

[SCREENSHOT: VendaForm com banner amarelo + AlertDialog de confirmação de inadimplência]

Ao criar a venda: o backend valida estoque, registra saída, gera a(s) nota(s) fiscal(is),
lança conta(s) a receber e movimentação financeira. Erro de estoque insuficiente → toast
com a mensagem exata do backend.

## Desconto na venda e resumo de valores (Demanda 9.C)

No `VendaForm`, abaixo da lista de itens há um campo **Desconto (%)** (ao lado de **Valor
do Transporte**). É um desconto **de cabeçalho**, aplicado **sobre o subtotal dos itens** —
o preço unitário de cada item **não** é alterado. Default **0** (sem desconto).

Logo abaixo, um **resumo de valores** acompanha o que o usuário digita:

1. **Subtotal (itens)** — soma dos itens a preço de tabela.
2. **Desconto (X%)** — em verde, o valor (R$) abatido (= subtotal × X/100). Só aparece
   quando o desconto é maior que zero.
3. **Transporte (NF separada)** — quando há frete (sai numa NF de transporte própria, à
   vista). Só aparece quando maior que zero.
4. **Total final** — em destaque: subtotal − desconto + transporte.

Em venda **parcelada**, a prévia das parcelas usa o **total líquido** (já com o desconto):
as parcelas somam o líquido, não o bruto. O frete não entra no parcelamento.

> O resumo é só uma **prévia** (calculada na tela). O valor gravado é o que o **backend**
> calcula ao salvar — a nota fiscal e as contas a receber derivam do **total com desconto**.

[SCREENSHOT: VendaForm com Subtotal → Desconto → Total final no resumo de valores]

## Cancelar venda (ação dedicada, estorno ponta a ponta)

> ⚠️ **Mudança da Demanda 7:** cancelar **não é mais** escolher "Cancelada" no Select de
> status. Essa opção foi **removida** da UI (o backend recusa essa transição). O
> cancelamento agora é uma ação própria que estorna estoque e financeiro.

No `VendaCard`, o botão **"Cancelar venda"** (em vermelho) abre um **AlertDialog** que:

- Explica que o cancelamento **estorna estoque e financeiro**: devolve os itens ao
  estoque, cancela **todas** as notas fiscais da venda e baixa **todas** as contas a
  receber, e que a ação é **irreversível**.
- Tem um campo **Motivo (opcional)**.
- Oferece um botão secundário **"Ver notas fiscais antes"**, que abre o Faturamento
  filtrado por aquela venda (para inspecionar antes de decidir).
- **Cancelar venda** (confirmar) → toast "Venda cancelada — estoque e financeiro
  estornados"; a lista é atualizada e a venda passa a aparecer como **Cancelada**.

O botão **some** quando a venda já está cancelada. Vale tanto para venda à vista (1 nota)
quanto parcelada (N notas + nota de transporte): todas são canceladas de uma vez. **Não**
há cancelamento nota-a-nota na tela de vendas — o cancelamento é sempre da venda inteira.

[SCREENSHOT: VendaCard com botões "Ver notas fiscais" e "Cancelar venda"]
[SCREENSHOT: AlertDialog de cancelamento com Motivo e "Ver notas fiscais antes"]

## Ver notas fiscais da venda

O botão **"Ver notas fiscais"** no `VendaCard` (e o "Ver notas fiscais antes" dentro do
modal de cancelamento) navega para `/faturamento?sale_id=<id>`. A página de Faturamento
mostra um banner azul "Notas da venda #<id>" e lista **apenas** as notas daquela venda,
com botão **"Limpar filtro"** para voltar à lista completa. Espelha o "Ver notas
relacionadas" da Compra (`order_id`).

[SCREENSHOT: Faturamento filtrado por venda (banner azul "Notas da venda")]

## Componentes — Props

### `ClienteForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback |
| `client` | `Client \| null` | `null` → criação; preenchido → edição |
| `onSuccess` | `() => void` | Recarrega lista |

### `ClienteRow`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `client` | `Client` | Dados do cliente (inclui endereço estruturado) |
| `onEdit` | `() => void` | Abre form de edição |
| `onDeleted` | `() => void` | Recarrega lista |

### `VendaForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback |
| `clients` | `Client[]` | Opções do Select de cliente (com ⚠️ se inadimplente) |
| `stockItems` | `StockItem[]` | Itens de estoque de categoria café |
| `onSuccess` | `() => void` | Recarrega lista |

#### Seção "Condições de Pagamento"
- Select de **Forma de Pagamento**: `a_vista` / `parcelado` / `pix` / `boleto` (default `a_vista`)
- Quando `parcelado`: Select de parcelas (2x–12x), campo "Vencimento 1ª Parcela" e "Intervalo (dias)"
- Tabela de preview em tempo real: Parcela X/Y | Vencimento | Valor (última parcela absorve resíduo)
- Validação via Zod `.superRefine`: `first_due_date` obrigatório quando parcelado com `installments >= 2`

### `VendaCard`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `sale` | `Sale` | Dados da venda |
| `onChanged` | `() => void` | Recarrega lista após mudança de status ou cancelamento |

## Status de venda — glossário

| Status | Badge | Significado |
|--------|-------|-------------|
| `realizada` | azul "Realizada" | Venda criada; pode ser marcada como Entregue ou cancelada |
| `entregue` | verde "Entregue" | Mercadoria entregue; pode ser cancelada |
| `cancelada` | cinza "Cancelada" | Estado **final** (irreversível); estoque e financeiro já estornados |

**Transições de status pela UI (Select):**

```
realizada → entregue   (AlertDialog "Confirmar entrega?")
```

- Não há mais opção "Cancelada" no Select (removida na Demanda 7).
- Em `entregue`, o Select fica desabilitado (não há próximo status manual).
- Cancelamento é feito **somente** pela ação "Cancelar venda".

## Integração com Estoque

A página busca os itens de café ao montar para listar apenas itens vendáveis no `VendaForm`.

## Campos de `Client` (endereço estruturado — Demanda 7)

```typescript
address: string | null        // legado (texto livre), preservado
cep: string | null
street: string | null
number: string | null
complement: string | null
neighborhood: string | null
city: string | null
state: string | null          // UF (2 chars)
is_delinquent: boolean
```

## Campos de pagamento em `Sale`

```typescript
payment_method: PaymentMethod | null  // "a_vista" | "parcelado" | "pix" | "boleto"
installments: number                  // default 1
first_due_date: string | null         // vencimento da 1ª parcela
installment_interval_days: number     // default 30
```

`createVenda` sempre envia `payment_method`; campos de parcelamento enviados apenas quando `payment_method === "parcelado"`.

## Campos de desconto em `Sale` (Demanda 9.C)

```typescript
items_subtotal: number    // Σ itens a preço de tabela (bruto), antes do desconto
discount_percent: number  // % de desconto de cabeçalho (0–100), default 0
discount_amount: number   // valor (R$) = items_subtotal × discount_percent/100
total_amount: number      // LÍQUIDO = items_subtotal − discount_amount (+ frete em NF separada)
```

`createVenda` envia `discount_percent` apenas quando maior que zero. O preço unitário dos
itens **não** é alterado — o desconto é de **cabeçalho** (sobre o subtotal). A nota fiscal e
as parcelas (contas a receber) derivam do **total líquido**.
