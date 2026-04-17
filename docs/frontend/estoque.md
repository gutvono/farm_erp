# Frontend Module: Estoque

## Visão Geral

Página única com 3 abas (Tabs shadcn): **Itens**, **Movimentações** e **Inventário**. O histórico de movimentações por item abre em `Sheet` lateral sem sair da lista. O inventário completo é exibido em `Dialog` com exportação em PDF client-side via jsPDF.

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/estoque/page.tsx` | Page | Página em abas com toda a UI do módulo |
| `services/estoque.ts` | Service | Orquestra chamadas ao backend `/api/estoque/*`; converte Decimal → number |
| `types/index.ts` | Tipos | `StockItem`, `StockMovement`, `InventoryItemOut`, `Inventory`, `StockCategory`, `StockUnit`, `StockMovementType` |
| `components/modules/estoque/StockItemRow.tsx` | Componente | Linha de item com badge de categoria, ícone de alerta para críticos e ações inline |
| `components/modules/estoque/StockItemForm.tsx` | Componente | Dialog com React Hook Form + Zod para criar/editar item |
| `components/modules/estoque/MovimentacaoForm.tsx` | Componente | Dialog para registrar movimentação manual com validação de estoque |
| `components/modules/estoque/MovimentacoesTable.tsx` | Componente | Tabela com filtros por item, tipo e módulo; ordenação clicável em todas as colunas |
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

## Abas

### 1. Itens
- Contador de itens totais e críticos (abaixo do mínimo em vermelho)
- Filtro por categoria + toggle "Apenas críticos"
- Botão "Novo Item" abre `StockItemForm`
- Lista de `StockItemRow`; clique em qualquer linha abre Sheet com histórico de movimentações do item
- Botão editar (lápis) reabre `StockItemForm` em modo edição
- Botão excluir (lixeira) dispara `AlertDialog` de confirmação

### 2. Movimentações
- Botão "Registrar Movimentação" abre `MovimentacaoForm`
- `MovimentacoesTable` completa sem filtro pré-aplicado

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
| Prop | Tipo | Descrição |
|------|------|-----------|
| `movements` | `StockMovement[]` | Lista de movimentações |
| `loading` | `boolean` | Exibe "Carregando..." |
| `hideItemFilter` | `boolean?` | Oculta filtro de item (usado no Sheet de histórico) |
| `items` | `{ id, name }[]?` | Opções do filtro de item |
| `onFilterChange` | `(params) => void?` | Callback para ordenação server-side (opcional) |

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

## Dependências adicionais

- `jspdf@^4.2.1` — geração de PDF client-side (instalado via `npm install jspdf`)
