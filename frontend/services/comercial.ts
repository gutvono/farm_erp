import { apiFetch } from "@/lib/api"
import {
  ApiResponse,
  Client,
  Sale,
  SaleItem,
  SaleStatus,
} from "@/types/index"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

interface RawClient {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  is_delinquent: boolean
  created_at: string
  updated_at: string
}

function parseClient(raw: RawClient): Client {
  return {
    id: raw.id,
    name: raw.name,
    document: raw.document,
    email: raw.email,
    phone: raw.phone,
    address: raw.address,
    notes: raw.notes,
    is_delinquent: raw.is_delinquent,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawSaleItem {
  id: string
  stock_item_id: string
  stock_item_name: string
  quantity: string | number
  unit_price: string | number
  subtotal: string | number
  description: string | null
}

function parseSaleItem(raw: RawSaleItem): SaleItem {
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

interface RawSale {
  id: string
  client_id: string
  client_name: string
  status: SaleStatus
  total_amount: string | number
  notes: string | null
  sold_at: string
  delivered_at: string | null
  items: RawSaleItem[]
  created_at: string
  updated_at: string
}

function parseSale(raw: RawSale): Sale {
  return {
    id: raw.id,
    client_id: raw.client_id,
    client_name: raw.client_name,
    status: raw.status,
    total_amount: toNumber(raw.total_amount),
    notes: raw.notes,
    sold_at: raw.sold_at,
    delivered_at: raw.delivered_at,
    items: (raw.items ?? []).map(parseSaleItem),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

// ── Clientes ──────────────────────────────────────────────────────────────────

export async function getClientes(is_delinquent?: boolean): Promise<Client[]> {
  const response = await apiFetch<ApiResponse<RawClient[]>>("/api/comercial/clientes", {
    params: { is_delinquent },
  })
  return response.data.map(parseClient)
}

export async function createCliente(data: {
  name: string
  document?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
}): Promise<Client> {
  const response = await apiFetch<ApiResponse<RawClient>>("/api/comercial/clientes", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseClient(response.data)
}

export async function updateCliente(
  id: string,
  data: Partial<{
    name: string
    document: string
    email: string
    phone: string
    address: string
    notes: string
  }>
): Promise<Client> {
  const response = await apiFetch<ApiResponse<RawClient>>(
    `/api/comercial/clientes/${id}`,
    { method: "PUT", body: JSON.stringify(data) }
  )
  return parseClient(response.data)
}

export async function deleteCliente(id: string): Promise<void> {
  await apiFetch(`/api/comercial/clientes/${id}`, { method: "DELETE" })
}

export async function marcarInadimplente(id: string): Promise<Client> {
  const response = await apiFetch<ApiResponse<RawClient>>(
    `/api/comercial/clientes/${id}/inadimplente`,
    { method: "PUT" }
  )
  return parseClient(response.data)
}

export async function reverterInadimplencia(id: string): Promise<Client> {
  const response = await apiFetch<ApiResponse<RawClient>>(
    `/api/comercial/clientes/${id}/reverter-inadimplencia`,
    { method: "PUT" }
  )
  return parseClient(response.data)
}

// ── Vendas ────────────────────────────────────────────────────────────────────

export async function getVendas(status?: string): Promise<Sale[]> {
  const response = await apiFetch<ApiResponse<RawSale[]>>("/api/comercial/vendas", {
    params: { status },
  })
  return response.data.map(parseSale)
}

export async function createVenda(data: {
  client_id: string
  notes?: string
  items: { stock_item_id: string; quantity: number; unit_price: number }[]
}): Promise<Sale> {
  const response = await apiFetch<ApiResponse<RawSale>>("/api/comercial/vendas", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseSale(response.data)
}

export async function getVenda(id: string): Promise<Sale> {
  const response = await apiFetch<ApiResponse<RawSale>>(`/api/comercial/vendas/${id}`)
  return parseSale(response.data)
}

export async function updateVendaStatus(id: string, status: SaleStatus): Promise<Sale> {
  const response = await apiFetch<ApiResponse<RawSale>>(
    `/api/comercial/vendas/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  )
  return parseSale(response.data)
}
