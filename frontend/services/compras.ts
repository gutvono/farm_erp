import { apiFetch } from "@/lib/api"
import {
  ApiResponse,
  PaymentMethod,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderReceiptItem,
  PurchaseOrderStatus,
  PurchaseOrderWithReceipts,
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

interface RawReceiptItem {
  id: string
  purchase_order_id: string
  purchase_order_item_id: string
  stock_item_id: string
  stock_item_name: string
  quantity_ordered: string | number
  quantity_accepted: string | number
  quantity_rejected: string | number
  unit_price: string | number
  rejection_reason: string | null
  status: "pendente" | "conferido"
  created_at: string
  updated_at: string
}

function parseReceiptItem(raw: RawReceiptItem): PurchaseOrderReceiptItem {
  return {
    id: raw.id,
    purchase_order_id: raw.purchase_order_id,
    purchase_order_item_id: raw.purchase_order_item_id,
    stock_item_id: raw.stock_item_id,
    stock_item_name: raw.stock_item_name,
    quantity_ordered: toNumber(raw.quantity_ordered),
    quantity_accepted: toNumber(raw.quantity_accepted),
    quantity_rejected: toNumber(raw.quantity_rejected),
    unit_price: toNumber(raw.unit_price),
    rejection_reason: raw.rejection_reason,
    status: raw.status,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawOrder {
  id: string
  supplier_id: string
  supplier_name: string
  status: PurchaseOrderStatus
  order_type: "produto" | "servico"
  service_description: string | null
  total_amount: string | number
  receipt_total_amount: string | number
  financial_approval_note: string | null
  notes: string | null
  ordered_at: string
  received_at: string | null
  installments: number
  first_due_date: string | null
  installment_interval_days: number
  payment_method: PaymentMethod | null
  items: RawOrderItem[]
  created_at: string
  updated_at: string
}

interface RawOrderWithReceipts extends RawOrder {
  receipts: RawReceiptItem[]
}

function parseOrder(raw: RawOrder): PurchaseOrder {
  return {
    id: raw.id,
    supplier_id: raw.supplier_id,
    supplier_name: raw.supplier_name,
    status: raw.status,
    order_type: raw.order_type ?? "produto",
    service_description: raw.service_description ?? null,
    total_amount: toNumber(raw.total_amount),
    receipt_total_amount: toNumber(raw.receipt_total_amount),
    financial_approval_note: raw.financial_approval_note,
    notes: raw.notes,
    ordered_at: raw.ordered_at,
    received_at: raw.received_at,
    installments: raw.installments ?? 1,
    first_due_date: raw.first_due_date ?? null,
    installment_interval_days: raw.installment_interval_days ?? 30,
    payment_method: raw.payment_method ?? null,
    items: (raw.items ?? []).map(parseOrderItem),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

function parseOrderWithReceipts(raw: RawOrderWithReceipts): PurchaseOrderWithReceipts {
  return {
    ...parseOrder(raw),
    receipts: (raw.receipts ?? []).map(parseReceiptItem),
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
  order_type?: "produto" | "servico"
  service_description?: string
  total_amount?: number
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

// ── Fluxo de aprovação / conferência ─────────────────────────────────────────

export async function enviarParaAprovacao(id: string): Promise<PurchaseOrder> {
  const response = await apiFetch<ApiResponse<RawOrder>>(
    `/api/compras/ordens/${id}/enviar-aprovacao`,
    { method: "POST" }
  )
  return parseOrder(response.data)
}

export interface ApproveOrderData {
  payment_method: PaymentMethod
  installments?: number
  first_due_date?: string
  installment_interval_days?: number
}

export async function aprovarOrdem(id: string, data: ApproveOrderData): Promise<PurchaseOrder> {
  const response = await apiFetch<ApiResponse<RawOrder>>(
    `/api/compras/ordens/${id}/aprovar`,
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseOrder(response.data)
}

export async function recusarOrdem(id: string, note: string): Promise<PurchaseOrder> {
  const response = await apiFetch<ApiResponse<RawOrder>>(
    `/api/compras/ordens/${id}/recusar`,
    { method: "POST", body: JSON.stringify({ note }) }
  )
  return parseOrder(response.data)
}

export async function concluirServico(id: string): Promise<PurchaseOrder> {
  const response = await apiFetch<ApiResponse<RawOrder>>(
    `/api/compras/ordens/${id}/concluir-servico`,
    { method: "POST" }
  )
  return parseOrder(response.data)
}

export async function iniciarConferencia(id: string): Promise<PurchaseOrderWithReceipts> {
  const response = await apiFetch<ApiResponse<RawOrderWithReceipts>>(
    `/api/compras/ordens/${id}/iniciar-conferencia`,
    { method: "POST" }
  )
  return parseOrderWithReceipts(response.data)
}

export async function finalizarConferencia(
  id: string,
  items: {
    purchase_order_item_id: string
    quantity_accepted: number
    quantity_rejected: number
    rejection_reason?: string
  }[]
): Promise<PurchaseOrderWithReceipts> {
  const response = await apiFetch<ApiResponse<RawOrderWithReceipts>>(
    `/api/compras/ordens/${id}/finalizar-conferencia`,
    { method: "POST", body: JSON.stringify({ items }) }
  )
  return parseOrderWithReceipts(response.data)
}

// ── Recebimentos ──────────────────────────────────────────────────────────────

export async function getRecebimentos(): Promise<PurchaseOrderWithReceipts[]> {
  const response = await apiFetch<ApiResponse<RawOrderWithReceipts[]>>("/api/compras/recebimentos")
  return response.data.map(parseOrderWithReceipts)
}

export async function getRecebimento(id: string): Promise<PurchaseOrderWithReceipts> {
  const response = await apiFetch<ApiResponse<RawOrderWithReceipts>>(
    `/api/compras/recebimentos/${id}`
  )
  return parseOrderWithReceipts(response.data)
}
