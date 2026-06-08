# Frontend Module: Estoque

## Visão Geral

Página única com 4 abas (Tabs shadcn): **Itens**, **Movimentações**, **Inventário** e **Recebimentos**. O histórico de movimentações por item abre em `Sheet` lateral sem sair da lista. O inventário completo é exibido em `Dialog` com exportação em PDF client-side via jsPDF.

> A partir da Demanda 3, a **categoria do item deixou de ser uma lista fixa** (Café/Insumo/Equipamento/Veículo/Outro) e passou a ser **cadastrável** no módulo **Configurações**. No cadastro de item, a categoria é escolhida num **menu suspenso** com as categorias cadastradas. Cada item exibe o **nome da categoria** (`category_name`); o filtro da aba Itens lista as categorias reais.

> **Demanda 8 — Itens e Recebimentos viraram tabelas paginadas.** As abas **Itens** e **Recebimentos** agora são **tabelas** (shadcn) com **paginação no servidor**, ordenação por cabeçalho e filtros/busca no topo (Movimentações já era assim).
>
> - **Itens** — Colunas: Nome (com o aviso ⚠️ quando abaixo do mínimo), SKU, Categoria, Saldo, Mínimo, Custo unit. e ações. Ordene por **Nome** ou **SKU**. Filtros: **Buscar** (nome/SKU), **Categoria**, **Papel** e **Apenas críticos**. **Clicar na linha** abre o **histórico de movimentações** do item (Sheet lateral); as ações **Editar** e **Excluir** ficam na própria linha. O contador do topo mostra o total e quantos estão **críticos**.
> - **Recebimentos** — Colunas: Fornecedor, Status, Data, Itens, Total e a ação. Ordene por **Status** ou **Data**. Ordens **Aprovadas** trazem **Iniciar Conferência**; ordens **Em conferência** trazem **Conferir itens**, que abre o painel de conferência à direita. O selo no título da aba conta as ordens aguardando conferência.

[SCREENSHOT: aba Itens em tabela com filtros (Categoria/Papel/Críticos) e busca]
[SCREENSHOT: aba Recebimentos em tabela com "Iniciar Conferência" / "Conferir itens"]

### Fluxos passo a passo (ótica do usuário)

**Cadastrar um item escolhendo a categoria**
1. Na aba **Itens**, clique em **"Novo Item"**.
2. Preencha SKU e Nome. Em **Categoria**, escolha uma categoria no **menu suspenso** (as categorias são cadastradas em **Configurações → Categorias**).
3. Se a categoria for de **máquina** ou **veículo** (papéis), aparece o campo **Custo por Hora**.
4. Preencha unidade, estoque mínimo e custo, e clique em **"Criar item"**.
5. Na edição, a **categoria atual já vem selecionada**.

[SCREENSHOT: formulário de item com o menu suspenso de Categoria aberto]

**Filtrar movimentações**
1. Na aba **Movimentações**, use a **Busca** (descrição ou nome do item), o intervalo **De / Até** (datas), e os filtros de **item**, **tipo** e **módulo**.
2. Clique nos cabeçalhos **Data**, **Quantidade**, **Valor unit.** ou **Valor total** para ordenar.
3. Tudo é aplicado **no servidor**, com paginação (Anterior/Próxima).

[SCREENSHOT: aba Movimentações com busca, intervalo de datas e filtros aplicados]

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/estoque/page.tsx` | Page | Página em abas com toda a UI do módulo |
| `services/estoque.ts` | Service | Orquestra chamadas ao backend `/api/estoque/*`; converte Decimal → number |
| `types/index.ts` | Tipos | `StockItem` (com `category_id`/`category_name`), `StockMovement`, `InventoryItemOut`, `Inventory`, `StockUnit`, `StockMovementType` |
| `components/modules/estoque/StockItemRow.tsx` | Componente | Linha de item com badge do **nome da categoria**, ícone de alerta para críticos e ações inline |
| `components/modules/estoque/StockItemForm.tsx` | Componente | Dialog (RHF + Zod) para criar/editar item; **categoria via dropdown** carregado de `getCategorias()` (sem enum); `category_id` obrigatório; custo por hora aparece quando a categoria tem papel `maquina`/`veiculo` |
| `components/modules/estoque/MovimentacaoForm.tsx` | Componente | Dialog para registrar movimentação manual com validação de estoque |
| `components/modules/estoque/MovimentacoesTable.tsx` | Componente | Tabela paginada com **busca textual**, **intervalo de datas**, filtros por item/tipo/módulo; ordenação server-side (`occurred_at`/`quantity`/`total_value`/`unit_cost`) |
| `components/modules/estoque/InventarioModal.tsx` | Componente | Dialog com tabela de inventário e exportação PDF via jsPDF |

## Campos reais do backend (vs. spec original)

| Spec | Backend real |
|------|-------------|
| `minimum_quantity` | `minimum_stock` |
| `current_quantity` | `quantity_on_hand` |
| `type` (movimento) | `movement_type` |
| `reason` (movimento) | `description` |
| — | `sku` (obrigatório e único) |
| `unit` livre | enum: `saca` / `litro` / `kg` / `unidade` |

## Arquivos adicionados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `components/modules/estoque/ConferenciaRecebimento.tsx` | Componente | Formulário inline de conferência item a item com validação Zod |

## Abas

### 4. Recebimentos (nova)
- Lista ordens de compra com status `aprovada` ou `em_conferencia` via `getRecebimentos()`
- Card por ordem: fornecedor, data, valor, badge de status
- Botão "Iniciar Conferência" (status `aprovada`) → chama `iniciarConferencia()` → recarrega
- Botão "Conferir itens" (status `em_conferencia`) → expande inline `ConferenciaRecebimento`
- Badge contador na aba (número de ordens pendentes)

### 1. Itens
- Contador de itens totais e críticos (abaixo do mínimo em vermelho)
- Filtro por categoria (menu suspenso com as **categorias cadastradas** em Configurações; envia `category_id`) + toggle "Apenas críticos"
- Botão "Novo Item" abre `StockItemForm`
- Lista de `StockItemRow`; clique em qualquer linha abre Sheet com histórico de movimentações do item
- Botão editar (lápis) reabre `StockItemForm` em modo edição
- Botão excluir (lixeira) dispara `AlertDialog` de confirmação

### 2. Movimentações
- Botão "Registrar Movimentação" abre `MovimentacaoForm`
- `MovimentacoesTable` paginada, com **busca textual** (descrição/nome do item), **intervalo de datas** (De/Até) e filtros de item/tipo/módulo — todos aplicados server-side via a API paginada (sem filtrar no cliente)

### 3. Inventário
- Card explicativo + botão "Gerar Inventário"
- Ao clicar, busca dados frescos de `/api/estoque/inventario` e abre `InventarioModal`

## Componentes — Props

### `StockItemRow`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `item` | `StockItem` | Item a renderizar |
| `onClick` | `() => void` | Abre Sheet de histórico |
| `onEdit` | `() => void` | Abre form de edição |
| `onDeleted` | `() => void` | Recarrega lista após exclusão |

### `StockItemForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback de abertura/fechamento |
| `item` | `StockItem \| null` | `null` → criação; preenchido → edição |
| `onSuccess` | `() => void` | Recarrega dados após salvar |

### `MovimentacaoForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback de abertura/fechamento |
| `items` | `StockItem[]` | Lista para o Select de itens |
| `onSuccess` | `() => void` | Recarrega dados após registrar |

### `MovimentacoesTable`
Componente "burro": o estado de página/ordenação/filtros mora no hook `useMovimentacoes` (`MovimentacaoFilters` agora inclui `search`, `start_date`, `end_date` além de `stock_item_id`/`movement_type`/`source_module`).

| Prop | Tipo | Descrição |
|------|------|-----------|
| `data` | `Paginated<StockMovement>` | Página atual de movimentações |
| `loading` | `boolean` | Exibe skeleton |
| `page` / `sort` | — | Página e ordenação atuais |
| `onPageChange` / `onSortChange` | — | Callbacks de paginação/ordenação (server-side) |
| `filters` / `onFiltersChange` | `MovimentacaoFilters` | Busca, datas e filtros de item/tipo/módulo |
| `hideItemFilter` | `boolean?` | Oculta filtro de item (usado no Sheet de histórico) |
| `items` | `{ id, name }[]?` | Opções do filtro de item |

### `InventarioModal`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback de abertura/fechamento |
| `inventory` | `Inventory \| null` | Dados do inventário |
| `loading` | `boolean` | Exibe "Carregando inventário..." |

## Fluxo de geração de PDF

1. Usuário clica "Exportar PDF" no `InventarioModal`
2. `jsPDF` é importado dinamicamente (`await import("jspdf")`) para não aumentar o bundle inicial
3. O PDF é montado client-side:
   - Título centralizado + data de geração
   - Cabeçalho de tabela com fundo cinza
   - Linhas dos itens com separadores horizontais
   - Total geral em destaque no rodapé
4. Arquivo salvo como `inventario_{YYYY-MM-DD}.pdf` (data extraída de `generated_at`)

## Como o histórico por item funciona

1. Usuário clica em qualquer `StockItemRow`
2. A page chama `getMovimentacoes({ stock_item_id: item.id, order_by: "occurred_at", order_dir: "desc" })`
3. Os dados são armazenados em `historyMovements` (estado local da page)
4. O `Sheet` abre com `MovimentacoesTable` recebendo `hideItemFilter=true`
5. Os filtros de tipo e módulo continuam disponíveis dentro do Sheet

### `ConferenciaRecebimento`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `order` | `PurchaseOrderWithReceipts` | Ordem em conferência com receipts |
| `onFinalized` | `() => void` | Chamado após finalizar — recarrega itens, movimentações e recebimentos |

**Comportamento:**
- Formulário com React Hook Form + Zod (`z.number().min(0)` + `valueAsNumber: true`)
- Linha por receipt item: `quantity_accepted`, `quantity_rejected`, `rejection_reason`
- Validação: `accepted + rejected ≤ ordered`; motivo obrigatório se `rejected > 0`
- Exibe total a pagar (itens aceitos × preço unitário)
- AlertDialog de confirmação antes de chamar `finalizarConferencia()`
- Toast de sucesso com valor da conta a pagar + toast de aviso sobre devoluções se houver

## Dependências adicionais

- `jspdf@^4.2.1` — geração de PDF client-side (instalado via `npm install jspdf`)
