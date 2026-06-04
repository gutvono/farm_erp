# Infra de Tabela Paginada (Frontend)

Fundação reutilizável de listagens paginadas server-side, criada na Demanda 0
(infra-first). As demandas seguintes (1–7) devem reusar estes blocos em vez de
reimplementar paginação/ordenação por módulo.

Consome o contrato do backend descrito em
[`docs/backend/_shared-paginacao.md`](../backend/_shared-paginacao.md): o
endpoint paginado responde o **envelope cru** `Page[T]`
(`{ items, total, page, page_size, pages }`), **não** dentro de
`{ success, message, data }`.

Arquitetura respeitada: **Page → Service → API**. O componente `DataTable` é
"burro" (só recebe props e emite callbacks); o estado de query mora no hook/página.

---

## Blocos disponíveis

| Bloco | Arquivo | Papel |
|-------|---------|-------|
| `Paginated<T>` | `types/index.ts` | Tipo do envelope de resposta |
| `fetchPaginated<T, TRaw>` | `lib/pagination.ts` | Helper de fetch paginado |
| `DataTable<T>` | `components/ui/data-table.tsx` | Tabela genérica (shadcn) |

---

### `Paginated<T>` (`types/index.ts`)

```ts
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}
```

`pages = ceil(total / page_size)`; `pages = 0` quando `total = 0`.

---

### `fetchPaginated` (`lib/pagination.ts`)

```ts
export async function fetchPaginated<T, TRaw = T>(
  path: string,
  query?: PaginatedQuery,
  parseItem?: (raw: TRaw) => T
): Promise<Paginated<T>>
```

- **`path`** — rota do endpoint (ex.: `/api/estoque/movimentacoes`).
- **`query`** — `PaginationParams` (`page`, `page_size`, `order_by`, `order_dir`,
  `search`) **+** filtros extras do endpoint. Chaves com valor
  `undefined`/`null`/`""` são **omitidas** da query string.
- **`parseItem`** — opcional; aplicado a cada item (ex.: converter Decimal
  `string`→`number`). Sem ele, os itens passam direto.
- Usa `apiFetch` por baixo (mantém `credentials` de sessão e o tratamento
  `401 → /login` do projeto).

```ts
type QueryValue = string | number | boolean | undefined | null
export type PaginatedQuery = PaginationParams & Record<string, QueryValue>

export interface PaginationParams {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
}
```

> **Por que `<T, TRaw>`?** O backend manda Decimals como **string**. `TRaw` é o
> formato cru; `T` é o tipo já parseado. Ex.:
> `fetchPaginated<StockMovement, RawStockMovement>(path, params, parseMovement)`.

---

### `DataTable<T>` (`components/ui/data-table.tsx`)

Tabela genérica sobre o `Table` do shadcn, com ordenação clicável, paginação e
estados de loading/empty.

```ts
export interface DataTableColumn<T> {
  key: string                 // em colunas sortable, casa com o `order_by` do backend
  label: string
  sortable?: boolean
  align?: "left" | "right" | "center"
  render?: (row: T) => React.ReactNode  // sem render → usa row[key] como texto
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  loading: boolean
  emptyMessage?: string                 // default: "Nenhum registro encontrado"
  page: number                          // 1-based
  pageSize: number
  total: number
  pages: number
  onPageChange: (page: number) => void
  sort?: { by: string; dir: "asc" | "desc" }
  onSortChange?: (key: string) => void  // alterna asc/desc na mesma coluna
  rowKey?: (row: T) => string           // sem ela, usa o índice
}
```

**Comportamento:**

- Cabeçalho clicável **só** nas colunas `sortable`; mostra seta ↑/↓ (e ↕ neutra).
  Ao clicar, dispara `onSortChange(column.key)`.
- Rodapé: `"Mostrando X–Y de N"`, botões **Anterior/Próxima** (desabilitados nos
  limites e durante o loading) e indicador `"Página P de PAGES"`.
- `loading` → 5 linhas de `Skeleton`. `rows` vazio → `emptyMessage`.
- **Sem `any`**: tipado por generics `<T>`; `render`/`rowKey` recebem `T`.

> **Ordenação é server-side.** Só marque `sortable` em colunas cujo `key` esteja
> na allowlist `order_by` do backend daquele endpoint. Clicar não ordena no
> cliente: dispara `onSortChange`, que deve refazer a chamada.

---

## Onde mora o estado

O `DataTable` **não** guarda página/ordenação/filtros — quem guarda é a página
ou um hook. No piloto isso vive no hook `useMovimentacoes`
(`components/modules/estoque/useMovimentacoes.ts`), que centraliza
`page`/`sort`/`filters` e refaz a chamada a cada mudança. Trocar de página,
ordenar ou filtrar **sempre** reseta para `page = 1` (exceto a própria troca de
página) e dispara um novo fetch.

---

## Exemplo de adoção em outro módulo

Suponha paginar fornecedores (`GET /api/compras/fornecedores`).

### 1. Service (`services/compras.ts`)

```ts
import { fetchPaginated } from "@/lib/pagination"
import { Paginated, Supplier } from "@/types/index"

export async function getFornecedoresPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
}): Promise<Paginated<Supplier>> {
  return fetchPaginated<Supplier, RawSupplier>(
    "/api/compras/fornecedores",
    params,
    parseSupplier, // converte Decimals string→number, se houver
  )
}
```

### 2. Página/hook — estado de query

```tsx
const [page, setPage] = useState(1)
const [sort, setSort] = useState({ by: "name", dir: "asc" as const })
const [data, setData] = useState<Paginated<Supplier>>(EMPTY)
const [loading, setLoading] = useState(false)

const load = useCallback(async () => {
  setLoading(true)
  try {
    setData(await getFornecedoresPaginated({
      page, page_size: 20, order_by: sort.by, order_dir: sort.dir,
    }))
  } finally {
    setLoading(false)
  }
}, [page, sort])
useEffect(() => { load() }, [load])

function toggleSort(key: string) {
  setSort((p) => p.by === key
    ? { by: key, dir: p.dir === "asc" ? "desc" : "asc" }
    : { by: key, dir: "asc" })
  setPage(1)
}
```

### 3. Render — `DataTable`

```tsx
const columns: DataTableColumn<Supplier>[] = [
  { key: "name", label: "Nome", sortable: true,
    render: (s) => <span className="font-medium">{s.name}</span> },
  { key: "document", label: "Documento", render: (s) => s.document ?? "—" },
  { key: "email", label: "E-mail", render: (s) => s.email ?? "—" },
]

<DataTable<Supplier>
  columns={columns}
  rows={data.items}
  loading={loading}
  page={page}
  pageSize={data.page_size}
  total={data.total}
  pages={data.pages}
  onPageChange={setPage}
  sort={sort}
  onSortChange={toggleSort}
  rowKey={(s) => s.id}
/>
```

---

## Referência: o piloto (Estoque → Movimentações)

- **Service:** `services/estoque.ts` → `getMovimentacoesPaginated(...)`.
- **Estado:** hook `components/modules/estoque/useMovimentacoes.ts`
  (`MOVIMENTACOES_PAGE_SIZE = 20`).
- **Apresentação:** `components/modules/estoque/MovimentacoesTable.tsx` (monta
  `columns` + filtros e renderiza `DataTable`).
- **Histórico por item:** `components/modules/estoque/MovimentacoesHistory.tsx`
  reusa o mesmo hook fixando `stock_item_id` (renderizar com `key={itemId}` para
  reiniciar a paginação ao trocar de item).

Colunas do piloto (colunas sortable casam com a allowlist do backend
`occurred_at`, `quantity`, `unit_cost`, `total_value`):

```ts
const columns: DataTableColumn<StockMovement>[] = [
  { key: "occurred_at",     label: "Data",        sortable: true,
    render: (m) => <span className="text-sm">{formatDateTime(m.occurred_at)}</span> },
  { key: "stock_item_name", label: "Item",
    render: (m) => <span className="font-medium">{m.stock_item_name}</span> },
  { key: "movement_type",   label: "Tipo",
    render: (m) => <Badge className={m.movement_type === "entrada"
      ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
      {m.movement_type === "entrada" ? "Entrada" : "Saída"}</Badge> },
  { key: "quantity",        label: "Quantidade",  sortable: true, align: "right",
    render: (m) => m.quantity },
  { key: "unit_cost",       label: "Valor unit.", sortable: true, align: "right",
    render: (m) => formatCurrency(m.unit_cost) },
  { key: "total_value",     label: "Valor total", sortable: true, align: "right",
    render: (m) => formatCurrency(m.total_value) },
  { key: "description",     label: "Descrição",
    render: (m) => <span className="block max-w-[200px] truncate ...">{m.description}</span> },
  { key: "source_module",   label: "Módulo",
    render: (m) => <span className="text-sm text-slate-500">{m.source_module}</span> },
]
```
