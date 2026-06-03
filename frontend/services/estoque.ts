import { apiFetch } from "@/lib/api"
import { fetchPaginated } from "@/lib/pagination"
import {
  ApiResponse,
  Inventory,
  InventoryItemOut,
  Paginated,
  StockCategory,
  StockItem,
  StockMovement,
  StockMovementType,
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
  category: StockCategory
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
    category: raw.category,
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
  category: StockCategory
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
      category: item.category,
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

export async function getItens(params?: {
  category?: StockCategory
  below_minimum?: boolean
}): Promise<StockItem[]> {
  const response = await apiFetch<ApiResponse<RawStockItem[]>>(
    "/api/estoque/itens",
    { params: { category: params?.category, below_minimum: params?.below_minimum } }
  )
  return response.data.map(parseStockItem)
}

export async function createItem(data: {
  sku: string
  name: string
  category: StockCategory
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
    category: StockCategory
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
 * `unit_cost` (default `occurred_at desc`).
 */
export async function getMovimentacoesPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  stock_item_id?: string
  movement_type?: StockMovementType
  source_module?: string
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
