import { apiFetch } from "@/lib/api"
import {
  ApiResponse,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  Supplier,
} from "@/types/index"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

interface RawSupplier {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function parseSupplier(raw: RawSupplier): Supplier {
  return {
    id: raw.id,
    name: raw.name,
    document: raw.document,
    email: raw.email,
    phone: raw.phone,
    address: raw.address,
    notes: raw.notes,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawOrderItem {
  id: string
  stock_item_id: string
  stock_item_name: string
  quantity: string | number
  unit_price: string | number
  subtotal: string | number
  description: string | null
}

function parseOrderItem(raw: RawOrderItem): PurchaseOrderItem {
  return {
    id: raw.id,
    stock_item_id: raw.stock_item_id,
    stock_item_name: raw.stock_item_name,
    quantity: toNumber(raw.quantity),
    unit_price: toNumber(raw.unit_price),
    subtotal: toNumber(raw.subtotal),
    description: raw.description,
  }
}

interface RawOrder {
  id: string
  supplier_id: string
  supplier_name: string
  status: PurchaseOrderStatus
  total_amount: string | number
  notes: string | null
  ordered_at: string
  received_at: string | null
  items: RawOrderItem[]
  created_at: string
  updated_at: string
}

function parseOrder(raw: RawOrder): PurchaseOrder {
  return {
    id: raw.id,
    supplier_id: raw.supplier_id,
    supplier_name: raw.supplier_name,
    status: raw.status,
    total_amount: toNumber(raw.total_amount),
    notes: raw.notes,
    ordered_at: raw.ordered_at,
    received_at: raw.received_at,
    items: (raw.items ?? []).map(parseOrderItem),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

// ── Fornecedores ──────────────────────────────────────────────────────────────

export async function getFornecedores(): Promise<Supplier[]> {
  const response = await apiFetch<ApiResponse<RawSupplier[]>>("/api/compras/fornecedores")
  return response.data.map(parseSupplier)
}

export async function createFornecedor(data: {
  name: string
  document?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
}): Promise<Supplier> {
  const response = await apiFetch<ApiResponse<RawSupplier>>("/api/compras/fornecedores", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseSupplier(response.data)
}

export async function updateFornecedor(
  id: string,
  data: Partial<{
    name: string
    document: string
    email: string
    phone: string
    address: string
    notes: string
  }>
): Promise<Supplier> {
  const response = await apiFetch<ApiResponse<RawSupplier>>(
    `/api/compras/fornecedores/${id}`,
    { method: "PUT", body: JSON.stringify(data) }
  )
  return parseSupplier(response.data)
}

export async function deleteFornecedor(id: string): Promise<void> {
  await apiFetch(`/api/compras/fornecedores/${id}`, { method: "DELETE" })
}

// ── Ordens de Compra ──────────────────────────────────────────────────────────

export async function getOrdens(status?: string): Promise<PurchaseOrder[]> {
  const response = await apiFetch<ApiResponse<RawOrder[]>>("/api/compras/ordens", {
    params: { status },
  })
  return response.data.map(parseOrder)
}

export async function createOrdem(data: {
  supplier_id: string
  notes?: string
  items: { stock_item_id: string; quantity: number; unit_price: number; description?: string }[]
}): Promise<PurchaseOrder> {
  const response = await apiFetch<ApiResponse<RawOrder>>("/api/compras/ordens", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseOrder(response.data)
}

export async function getOrdem(id: string): Promise<PurchaseOrder> {
  const response = await apiFetch<ApiResponse<RawOrder>>(`/api/compras/ordens/${id}`)
  return parseOrder(response.data)
}

export async function updateOrdemStatus(
  id: string,
  status: PurchaseOrderStatus
): Promise<PurchaseOrder> {
  const response = await apiFetch<ApiResponse<RawOrder>>(
    `/api/compras/ordens/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  )
  return parseOrder(response.data)
}

export async function deleteOrdem(id: string): Promise<void> {
  await apiFetch(`/api/compras/ordens/${id}`, { method: "DELETE" })
}
