import { apiFetch } from "@/lib/api"
import { fetchPaginated } from "@/lib/pagination"
import {
  ApiResponse,
  Inventory,
  InventoryItemOut,
  Paginated,
  StockItem,
  StockMovement,
  StockMovementType,
  SystemRole,
  StockUnit,
} from "@/types/index"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

interface RawStockItem {
  id: string
  sku: string
  name: string
  category_id: string
  category_name: string
  unit: StockUnit
  quantity_on_hand: string | number
  minimum_stock: string | number
  unit_cost: string | number
  hourly_cost: string | number | null
  description: string | null
  is_below_minimum: boolean
  created_at: string
  updated_at: string
}

function parseStockItem(raw: RawStockItem): StockItem {
  return {
    id: raw.id,
    sku: raw.sku,
    name: raw.name,
    category_id: raw.category_id,
    category_name: raw.category_name,
    unit: raw.unit,
    quantity_on_hand: toNumber(raw.quantity_on_hand),
    minimum_stock: toNumber(raw.minimum_stock),
    unit_cost: toNumber(raw.unit_cost),
    hourly_cost: raw.hourly_cost != null ? toNumber(raw.hourly_cost) : null,
    description: raw.description,
    is_below_minimum: raw.is_below_minimum,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawStockMovement {
  id: string
  stock_item_id: string
  stock_item_name: string
  movement_type: StockMovementType
  quantity: string | number
  unit_cost: string | number
  total_value: string | number
  description: string
  source_module: string
  reference_id: string | null
  occurred_at: string
  created_at: string
}

function parseMovement(raw: RawStockMovement): StockMovement {
  return {
    id: raw.id,
    stock_item_id: raw.stock_item_id,
    stock_item_name: raw.stock_item_name,
    movement_type: raw.movement_type,
    quantity: toNumber(raw.quantity),
    unit_cost: toNumber(raw.unit_cost),
    total_value: toNumber(raw.total_value),
    description: raw.description,
    source_module: raw.source_module,
    reference_id: raw.reference_id,
    occurred_at: raw.occurred_at,
    created_at: raw.created_at,
  }
}

interface RawInventoryItem {
  id: string
  sku: string
  name: string
  category_id: string
  category_name: string
  unit: StockUnit
  quantity_on_hand: string | number
  unit_cost: string | number
  total_value: string | number
  is_below_minimum: boolean
}

interface RawInventory {
  items: RawInventoryItem[]
  total_value: string | number
  generated_at: string
}

function parseInventory(raw: RawInventory): Inventory {
  return {
    items: raw.items.map((item): InventoryItemOut => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      category_id: item.category_id,
      category_name: item.category_name,
      unit: item.unit,
      quantity_on_hand: toNumber(item.quantity_on_hand),
      unit_cost: toNumber(item.unit_cost),
      total_value: toNumber(item.total_value),
      is_below_minimum: item.is_below_minimum,
    })),
    total_value: toNumber(raw.total_value),
    generated_at: raw.generated_at,
  }
}

/**
 * Lista itens de estoque como ARRAY (seletor/dropdown — venda, ordem de compra,
 * cotação, movimentação, destinos de configuração). O endpoint é paginado
 * (`Page[T]`, Demanda 8); aqui pedimos uma página grande e devolvemos só os
 * `items`, preservando a assinatura `StockItem[]` e os filtros que os chamadores
 * fora do escopo já usam (ex.: `role: "produto_vendavel"`). Para a TABELA
 * paginada de itens use `getItensPaginated`.
 */
export async function getItens(params?: {
  category_id?: string
  role?: SystemRole
  below_minimum?: boolean
}): Promise<StockItem[]> {
  const result = await fetchPaginated<StockItem, RawStockItem>(
    "/api/estoque/itens",
    {
      page_size: 100,
      category_id: params?.category_id,
      role: params?.role,
      below_minimum: params?.below_minimum,
    },
    parseStockItem
  )
  return result.items
}

/** Lista paginada de itens (`GET /api/estoque/itens`, `Page[T]`).
 * `order_by` aceito: `name`, `sku`; filtros: `category_id`, `role`,
 * `below_minimum`; `search` por nome/sku. */
export async function getItensPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
  category_id?: string
  role?: SystemRole
  below_minimum?: boolean
}): Promise<Paginated<StockItem>> {
  return fetchPaginated<StockItem, RawStockItem>(
    "/api/estoque/itens",
    params,
    parseStockItem
  )
}

export async function createItem(data: {
  sku: string
  name: string
  category_id: string
  unit: StockUnit
  minimum_stock: number
  unit_cost: number
  hourly_cost?: number
  description?: string
}): Promise<StockItem> {
  const response = await apiFetch<ApiResponse<RawStockItem>>("/api/estoque/itens", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseStockItem(response.data)
}

export async function updateItem(
  id: string,
  data: Partial<{
    name: string
    category_id: string
    unit: StockUnit
    minimum_stock: number
    unit_cost: number
    hourly_cost: number
    description: string
  }>
): Promise<StockItem> {
  const response = await apiFetch<ApiResponse<RawStockItem>>(
    `/api/estoque/itens/${id}`,
    { method: "PUT", body: JSON.stringify(data) }
  )
  return parseStockItem(response.data)
}

export async function deleteItem(id: string): Promise<void> {
  await apiFetch(`/api/estoque/itens/${id}`, { method: "DELETE" })
}

/**
 * Lista paginada de movimentações de estoque (`GET /api/estoque/movimentacoes`).
 * O endpoint passou a responder o envelope `Page[T]` na Demanda 0 — por isso a
 * busca usa `fetchPaginated` (e não mais o `ApiResponse`). Os Decimals chegam
 * como string e são convertidos para number por `parseMovement`.
 *
 * `order_by` aceito pelo backend: `occurred_at`, `quantity`, `total_value`,
 * `unit_cost` (default `occurred_at desc`). Filtros: `stock_item_id`,
 * `movement_type`, `source_module`, `search` (ILIKE na descrição/nome do item) e
 * intervalo `start_date`/`end_date` (sobre `occurred_at`).
 */
export async function getMovimentacoesPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  stock_item_id?: string
  movement_type?: StockMovementType
  source_module?: string
  search?: string
  start_date?: string
  end_date?: string
}): Promise<Paginated<StockMovement>> {
  return fetchPaginated<StockMovement, RawStockMovement>(
    "/api/estoque/movimentacoes",
    params,
    parseMovement
  )
}

export async function createMovimentacao(data: {
  stock_item_id: string
  movement_type: StockMovementType
  quantity: number
  unit_cost?: number
  description: string
  source_module?: string
}): Promise<StockMovement> {
  const payload = {
    ...data,
    source_module: data.source_module ?? "manual",
  }
  const response = await apiFetch<ApiResponse<RawStockMovement>>(
    "/api/estoque/movimentacoes",
    { method: "POST", body: JSON.stringify(payload) }
  )
  return parseMovement(response.data)
}

export async function getInventario(): Promise<Inventory> {
  const response = await apiFetch<ApiResponse<RawInventory>>("/api/estoque/inventario")
  return parseInventory(response.data)
}
