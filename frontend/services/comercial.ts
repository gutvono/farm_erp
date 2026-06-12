import { apiFetch } from "@/lib/api"
import { fetchPaginated } from "@/lib/pagination"
import {
  ApiResponse,
  Client,
  Paginated,
  PaymentMethod,
  Sale,
  SaleItem,
  SalesGranularity,
  SalesReport,
  SaleStatus,
} from "@/types/index"

/**
 * `page_size` usado pelos helpers que ainda devolvem um ARRAY (seletores/
 * dropdowns fora do escopo da Demanda 8). Cobre a escala atual; se algum
 * seletor precisar de mais itens, migrá-lo para busca paginada.
 */
const SELECT_PAGE_SIZE = 100

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
  cep: string | null
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  notes: string | null
  is_delinquent: boolean
  has_overdue?: boolean
  is_delinquent_effective?: boolean
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
    cep: raw.cep ?? null,
    street: raw.street ?? null,
    number: raw.number ?? null,
    complement: raw.complement ?? null,
    neighborhood: raw.neighborhood ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    notes: raw.notes,
    is_delinquent: raw.is_delinquent,
    has_overdue: raw.has_overdue ?? false,
    is_delinquent_effective: raw.is_delinquent_effective ?? raw.is_delinquent,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

/** Campos de endereço estruturado aceitos no cadastro de cliente (Demanda 7). */
interface ClientAddressInput {
  cep?: string
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
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
  items_subtotal: string | number
  discount_percent: string | number
  discount_amount: string | number
  notes: string | null
  sold_at: string
  delivered_at: string | null
  installments: number
  first_due_date: string | null
  installment_interval_days: number
  payment_method: PaymentMethod | null
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
    items_subtotal: toNumber(raw.items_subtotal),
    discount_percent: toNumber(raw.discount_percent),
    discount_amount: toNumber(raw.discount_amount),
    notes: raw.notes,
    sold_at: raw.sold_at,
    delivered_at: raw.delivered_at,
    installments: raw.installments ?? 1,
    first_due_date: raw.first_due_date ?? null,
    installment_interval_days: raw.installment_interval_days ?? 30,
    payment_method: raw.payment_method ?? null,
    items: (raw.items ?? []).map(parseSaleItem),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

// ── Clientes ──────────────────────────────────────────────────────────────────

/**
 * Lista clientes como ARRAY (seletor/dropdown — ex.: nota manual no Faturamento,
 * seleção de cliente na venda). O endpoint é paginado (`Page[T]`, Demanda 8); aqui
 * pedimos uma página grande e devolvemos só os `items`, preservando a assinatura
 * `Client[]` que os chamadores fora do escopo já usam. Para a TABELA paginada de
 * clientes use `getClientesPaginated`.
 */
export async function getClientes(is_delinquent?: boolean): Promise<Client[]> {
  const result = await fetchPaginated<Client, RawClient>(
    "/api/comercial/clientes",
    { page_size: SELECT_PAGE_SIZE, is_delinquent },
    parseClient
  )
  return result.items
}

/** Lista paginada de clientes (`GET /api/comercial/clientes`, `Page[T]`).
 * `order_by` aceito: `name`, `created_at`; `search` por nome/documento. */
export async function getClientesPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
  is_delinquent?: boolean
}): Promise<Paginated<Client>> {
  return fetchPaginated<Client, RawClient>(
    "/api/comercial/clientes",
    params,
    parseClient
  )
}

export async function createCliente(data: {
  name: string
  document?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
} & ClientAddressInput): Promise<Client> {
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
    cep: string
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    state: string
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

/** Lista vendas como ARRAY (uso pontual). O endpoint é paginado (`Page[T]`);
 * pede uma página grande e devolve `items`. Para a TABELA use `getVendasPaginated`. */
export async function getVendas(status?: string): Promise<Sale[]> {
  const result = await fetchPaginated<Sale, RawSale>(
    "/api/comercial/vendas",
    { page_size: SELECT_PAGE_SIZE, status },
    parseSale
  )
  return result.items
}

/** Lista paginada de vendas (`GET /api/comercial/vendas`, `Page[T]`).
 * `order_by` aceito: `sold_at`, `status`; filtros: `status`, `client_id`. */
export async function getVendasPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  status?: string
  client_id?: string
}): Promise<Paginated<Sale>> {
  return fetchPaginated<Sale, RawSale>(
    "/api/comercial/vendas",
    params,
    parseSale
  )
}

export async function createVenda(data: {
  client_id: string
  notes?: string
  payment_method?: PaymentMethod
  installments?: number
  first_due_date?: string
  installment_interval_days?: number
  shipping_cost?: number
  /** Desconto de cabeçalho (% sobre o subtotal dos itens), default 0 — Demanda 9.C. */
  discount_percent?: number
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

/**
 * Cancela uma venda inteira (Demanda 7): delega ao motor do Faturamento, que
 * estorna estoque, cancela TODAS as NFs da venda, baixa TODAS as contas a
 * receber e marca a venda como `cancelada`. É irreversível. O `reason` é
 * opcional. Erros do backend (ex.: 400 "Venda já cancelada") são propagados
 * verbatim por `apiFetch`.
 */
export async function cancelarVenda(id: string, reason?: string): Promise<Sale> {
  const trimmed = reason?.trim()
  const response = await apiFetch<ApiResponse<RawSale>>(
    `/api/comercial/vendas/${id}/cancelar`,
    {
      method: "POST",
      body: JSON.stringify(trimmed ? { reason: trimmed } : {}),
    }
  )
  return parseSale(response.data)
}

// ── Relatório de Vendas (Demanda 10) ──────────────────────────────────────────

interface RawSalesReport {
  start: string
  end: string
  granularity: string
  kpis: {
    faturamento: string | number
    num_vendas: number
    ticket_medio: string | number
  }
  by_status: { status: string; count: number; total: string | number }[]
  mix: { category: string; count: number; total: string | number }[]
  timeseries: { period: string; count: number; total: string | number }[]
  top_products: {
    stock_item_id: string
    name: string
    quantity: string | number
    total: string | number
  }[]
  top_clients: {
    client_id: string
    name: string
    num_vendas: number
    total: string | number
  }[]
  receivables: {
    start: string
    end: string
    received_in_period: string | number
    to_receive_in_period: string | number
    overdue_total: string | number
    aging: { bucket: string; amount: string | number }[]
  }
}

function parseSalesReport(raw: RawSalesReport): SalesReport {
  return {
    start: raw.start,
    end: raw.end,
    granularity: raw.granularity,
    kpis: {
      faturamento: toNumber(raw.kpis.faturamento),
      num_vendas: raw.kpis.num_vendas,
      ticket_medio: toNumber(raw.kpis.ticket_medio),
    },
    by_status: (raw.by_status ?? []).map((s) => ({
      status: s.status,
      count: s.count,
      total: toNumber(s.total),
    })),
    mix: (raw.mix ?? []).map((m) => ({
      category: m.category,
      count: m.count,
      total: toNumber(m.total),
    })),
    timeseries: (raw.timeseries ?? []).map((t) => ({
      period: t.period,
      count: t.count,
      total: toNumber(t.total),
    })),
    top_products: (raw.top_products ?? []).map((p) => ({
      stock_item_id: p.stock_item_id,
      name: p.name,
      quantity: toNumber(p.quantity),
      total: toNumber(p.total),
    })),
    top_clients: (raw.top_clients ?? []).map((c) => ({
      client_id: c.client_id,
      name: c.name,
      num_vendas: c.num_vendas,
      total: toNumber(c.total),
    })),
    receivables: {
      start: raw.receivables.start,
      end: raw.receivables.end,
      received_in_period: toNumber(raw.receivables.received_in_period),
      to_receive_in_period: toNumber(raw.receivables.to_receive_in_period),
      overdue_total: toNumber(raw.receivables.overdue_total),
      aging: (raw.receivables.aging ?? []).map((a) => ({
        bucket: a.bucket,
        amount: toNumber(a.amount),
      })),
    },
  }
}

/**
 * Relatório de Vendas por período (`GET /api/comercial/relatorios/vendas`).
 * `start`/`end` no formato `YYYY-MM-DD`; `granularity` controla a série temporal.
 * Decimais chegam como string (Decimal do backend) e são convertidos para number.
 */
export async function getRelatorioVendas(params: {
  start: string
  end: string
  granularity: SalesGranularity
}): Promise<SalesReport> {
  const response = await apiFetch<ApiResponse<RawSalesReport>>(
    "/api/comercial/relatorios/vendas",
    { params }
  )
  return parseSalesReport(response.data)
}
