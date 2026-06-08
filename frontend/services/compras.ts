import { apiFetch } from "@/lib/api"
import { fetchPaginated, PaginatedQuery } from "@/lib/pagination"
import {
  ApiResponse,
  Paginated,
  PaymentMethod,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderReceiptItem,
  PurchaseOrderStatus,
  PurchaseOrderWithReceipts,
  Quotation,
  QuotationItem,
  QuotationProposal,
  QuotationProposalItem,
  QuotationStatus,
  Supplier,
  SupplierForStockItem,
  SupplierItem,
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
  cep: string | null
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
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
    cep: raw.cep ?? null,
    street: raw.street ?? null,
    number: raw.number ?? null,
    complement: raw.complement ?? null,
    neighborhood: raw.neighborhood ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    notes: raw.notes,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawSupplierItem {
  id: string
  supplier_id: string
  stock_item_id: string
  stock_item_name: string
  stock_item_sku: string
  unit_price: string | number
  is_active: boolean
  created_at: string
  updated_at: string
}

function parseSupplierItem(raw: RawSupplierItem): SupplierItem {
  return {
    id: raw.id,
    supplier_id: raw.supplier_id,
    stock_item_id: raw.stock_item_id,
    stock_item_name: raw.stock_item_name,
    stock_item_sku: raw.stock_item_sku,
    unit_price: toNumber(raw.unit_price),
    is_active: raw.is_active,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawSupplierForStockItem {
  supplier_id: string
  supplier_name: string
  unit_price: string | number
}

function parseSupplierForStockItem(raw: RawSupplierForStockItem): SupplierForStockItem {
  return {
    supplier_id: raw.supplier_id,
    supplier_name: raw.supplier_name,
    unit_price: toNumber(raw.unit_price),
  }
}

/** Campos de endereço/contato aceitos no cadastro/edição de fornecedor. */
export interface SupplierPayload {
  name: string
  document?: string
  email?: string
  phone?: string
  address?: string
  cep?: string
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
  notes?: string
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

/**
 * Lista fornecedores como ARRAY (seletor/dropdown — ordem de compra, propostas
 * de cotação, ordem de produção no PCP). O endpoint é paginado (`Page[T]`,
 * Demanda 8); pede uma página grande e devolve só os `items`, preservando a
 * assinatura `Supplier[]` dos chamadores fora do escopo. Para a TABELA paginada
 * use `getFornecedoresPaginated`.
 */
export async function getFornecedores(): Promise<Supplier[]> {
  const result = await fetchPaginated<Supplier, RawSupplier>(
    "/api/compras/fornecedores",
    { page_size: 100 },
    parseSupplier
  )
  return result.items
}

/** Lista paginada de fornecedores (`GET /api/compras/fornecedores`, `Page[T]`).
 * `order_by` aceito: `name`; `search` por nome/documento. */
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
    parseSupplier
  )
}

export async function createFornecedor(data: SupplierPayload): Promise<Supplier> {
  const response = await apiFetch<ApiResponse<RawSupplier>>("/api/compras/fornecedores", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseSupplier(response.data)
}

export async function updateFornecedor(
  id: string,
  data: Partial<SupplierPayload>
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

// ── Catálogo do fornecedor (itens vendidos) ────────────────────────────────────

/**
 * Lista paginada do catálogo de um fornecedor (`GET /fornecedores/{id}/itens`).
 * Responde o envelope `Page[T]` (Demanda 0). `order_by` aceito:
 * `stock_item_name`, `unit_price`, `created_at`.
 */
export async function getCatalogoFornecedor(
  supplierId: string,
  params: PaginatedQuery = {}
): Promise<Paginated<SupplierItem>> {
  return fetchPaginated<SupplierItem, RawSupplierItem>(
    `/api/compras/fornecedores/${supplierId}/itens`,
    params,
    parseSupplierItem
  )
}

export async function addItemCatalogo(
  supplierId: string,
  data: { stock_item_id: string; unit_price: number }
): Promise<SupplierItem> {
  const response = await apiFetch<ApiResponse<RawSupplierItem>>(
    `/api/compras/fornecedores/${supplierId}/itens`,
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseSupplierItem(response.data)
}

export async function updateItemCatalogo(
  supplierId: string,
  itemId: string,
  data: Partial<{ unit_price: number; is_active: boolean }>
): Promise<SupplierItem> {
  const response = await apiFetch<ApiResponse<RawSupplierItem>>(
    `/api/compras/fornecedores/${supplierId}/itens/${itemId}`,
    { method: "PUT", body: JSON.stringify(data) }
  )
  return parseSupplierItem(response.data)
}

export async function deleteItemCatalogo(
  supplierId: string,
  itemId: string
): Promise<void> {
  await apiFetch(`/api/compras/fornecedores/${supplierId}/itens/${itemId}`, {
    method: "DELETE",
  })
}

/**
 * Fornecedores que vendem um item de estoque, com o preço sugerido do catálogo
 * (`GET /compras/produtos/{stock_item_id}/fornecedores`). Base do fluxo
 * produto→fornecedor na ordem de compra.
 */
export async function getFornecedoresDoProduto(
  stockItemId: string
): Promise<SupplierForStockItem[]> {
  const response = await apiFetch<ApiResponse<RawSupplierForStockItem[]>>(
    `/api/compras/produtos/${stockItemId}/fornecedores`
  )
  return response.data.map(parseSupplierForStockItem)
}

// ── Ordens de Compra ──────────────────────────────────────────────────────────

/** Lista ordens como ARRAY (uso fora do escopo: PCP, fila do Financeiro). O
 * endpoint é paginado (`Page[T]`); pede uma página grande e devolve `items`.
 * Para a TABELA de ordens use `getOrdensPaginated`. */
export async function getOrdens(status?: string): Promise<PurchaseOrder[]> {
  const result = await fetchPaginated<PurchaseOrder, RawOrder>(
    "/api/compras/ordens",
    { page_size: 100, status },
    parseOrder
  )
  return result.items
}

/** Lista paginada de ordens de compra (`GET /api/compras/ordens`, `Page[T]`).
 * `order_by` aceito: `ordered_at`, `status`; filtros: `status`, `supplier_id`;
 * `search` por nome/documento do fornecedor. */
export async function getOrdensPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
  status?: string
  supplier_id?: string
}): Promise<Paginated<PurchaseOrder>> {
  return fetchPaginated<PurchaseOrder, RawOrder>(
    "/api/compras/ordens",
    params,
    parseOrder
  )
}

export async function createOrdem(data: {
  supplier_id: string
  notes?: string
  order_type?: "produto" | "servico"
  service_description?: string
  total_amount?: number
  shipping_cost?: number
  items: { stock_item_id: string; quantity: number; unit_price: number; description?: string }[]
}): Promise<PurchaseOrder> {
  const response = await apiFetch<ApiResponse<RawOrder>>("/api/compras/ordens", {
    method: "POST",
    body: JSON.stringify(data),
  })
  // TODO BACKEND DEV: o endpoint POST /api/compras/ordens deve aceitar o campo opcional
  // shipping_cost (number >= 0). Quando presente e > 0, o service de backend deve:
  // 1. Persistir shipping_cost na tabela purchase_orders (nova coluna NUMERIC(12,2), default 0)
  // 2. Incluir shipping_cost no total_amount da ordem OU rastreá-lo separadamente (decisão do dev)
  // 3. Na função complete_order_after_payment (chamada pelo Financeiro ao pagar a conta a pagar),
  //    após gerar a NF de recebimento, verificar se purchase_order.shipping_cost > 0 e chamar
  //    fat_service.criar_nota_transporte(db, order_id=order.id, shipping_cost=order.shipping_cost)
  //    — função nova no faturamento service — que cria uma Invoice com invoice_type="transporte",
  //    client_id=NULL (padrão das NFs de compras), sale_id=NULL, 1 item com
  //    description="Custo de transporte — Ordem #{order.id}", quantity=1, unit_price=shipping_cost.
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

/** Lista recebimentos como ARRAY (uso pontual). Endpoint paginado (`Page[T]`);
 * já filtra no backend ordens de PRODUTO em conferência. Para a TABELA use
 * `getRecebimentosPaginated`. */
export async function getRecebimentos(): Promise<PurchaseOrderWithReceipts[]> {
  const result = await fetchPaginated<PurchaseOrderWithReceipts, RawOrderWithReceipts>(
    "/api/compras/recebimentos",
    { page_size: 100 },
    parseOrderWithReceipts
  )
  return result.items
}

/** Lista paginada de recebimentos (`GET /api/compras/recebimentos`, `Page[T]`).
 * A seleção (ordens de produto APROVADA/EM_CONFERENCIA) é fixa no backend.
 * `order_by` aceito: `ordered_at`, `status`. */
export async function getRecebimentosPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
}): Promise<Paginated<PurchaseOrderWithReceipts>> {
  return fetchPaginated<PurchaseOrderWithReceipts, RawOrderWithReceipts>(
    "/api/compras/recebimentos",
    params,
    parseOrderWithReceipts
  )
}

export async function getRecebimento(id: string): Promise<PurchaseOrderWithReceipts> {
  const response = await apiFetch<ApiResponse<RawOrderWithReceipts>>(
    `/api/compras/recebimentos/${id}`
  )
  return parseOrderWithReceipts(response.data)
}

// ── Cotações ────────────────────────────────────────────────────────────────

interface RawQuotationProposalItem {
  id: string
  proposal_id: string
  quotation_item_id: string
  unit_price: string | number
}

interface RawQuotationProposal {
  id: string
  quotation_id: string
  supplier_id: string
  supplier_name: string
  total_price: string | number | null
  notes: string | null
  proposal_items: RawQuotationProposalItem[]
}

interface RawQuotationItem {
  id: string
  stock_item_id: string
  stock_item_name: string
  quantity: string | number
}

interface RawQuotation {
  id: string
  order_type: "produto" | "servico"
  status: QuotationStatus
  service_description: string | null
  notes: string | null
  cancellation_note: string | null
  winning_proposal_id: string | null
  purchase_order_id: string | null
  items: RawQuotationItem[]
  proposals: RawQuotationProposal[]
  created_at: string
  updated_at: string
}

function parseQuotationProposalItem(raw: RawQuotationProposalItem): QuotationProposalItem {
  return {
    id: raw.id,
    proposal_id: raw.proposal_id,
    quotation_item_id: raw.quotation_item_id,
    unit_price: toNumber(raw.unit_price),
  }
}

function parseQuotationProposal(raw: RawQuotationProposal): QuotationProposal {
  return {
    id: raw.id,
    quotation_id: raw.quotation_id,
    supplier_id: raw.supplier_id,
    supplier_name: raw.supplier_name,
    total_price: raw.total_price === null ? null : toNumber(raw.total_price),
    notes: raw.notes,
    proposal_items: (raw.proposal_items ?? []).map(parseQuotationProposalItem),
  }
}

function parseQuotationItem(raw: RawQuotationItem): QuotationItem {
  return {
    id: raw.id,
    stock_item_id: raw.stock_item_id,
    stock_item_name: raw.stock_item_name,
    quantity: toNumber(raw.quantity),
  }
}

function parseQuotation(raw: RawQuotation): Quotation {
  return {
    id: raw.id,
    order_type: raw.order_type ?? "produto",
    status: raw.status,
    service_description: raw.service_description,
    notes: raw.notes,
    cancellation_note: raw.cancellation_note,
    winning_proposal_id: raw.winning_proposal_id,
    purchase_order_id: raw.purchase_order_id,
    items: (raw.items ?? []).map(parseQuotationItem),
    proposals: (raw.proposals ?? []).map(parseQuotationProposal),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

/** Lista cotações como ARRAY (uso fora do escopo: fila do Financeiro). Endpoint
 * paginado (`Page[T]`); pede página grande e devolve `items`. Para a TABELA use
 * `getCotacoesPaginated`. */
export async function getCotacoes(
  status?: QuotationStatus,
  order_type?: string
): Promise<Quotation[]> {
  const result = await fetchPaginated<Quotation, RawQuotation>(
    "/api/compras/cotacoes",
    { page_size: 100, status, order_type },
    parseQuotation
  )
  return result.items
}

/** Lista paginada de cotações (`GET /api/compras/cotacoes`, `Page[T]`).
 * `order_by` aceito: `status`, `created_at`; filtros: `status`, `order_type`. */
export async function getCotacoesPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  status?: string
  order_type?: string
}): Promise<Paginated<Quotation>> {
  return fetchPaginated<Quotation, RawQuotation>(
    "/api/compras/cotacoes",
    params,
    parseQuotation
  )
}

export async function getCotacao(id: string): Promise<Quotation> {
  const response = await apiFetch<ApiResponse<RawQuotation>>(`/api/compras/cotacoes/${id}`)
  return parseQuotation(response.data)
}

export async function createCotacao(data: {
  order_type: "produto" | "servico"
  service_description?: string
  notes?: string
  items: { stock_item_id: string; quantity: number }[]
}): Promise<Quotation> {
  const response = await apiFetch<ApiResponse<RawQuotation>>("/api/compras/cotacoes", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseQuotation(response.data)
}

export async function deleteCotacao(id: string): Promise<void> {
  await apiFetch(`/api/compras/cotacoes/${id}`, { method: "DELETE" })
}

export async function addProposta(
  quotation_id: string,
  data: {
    supplier_id: string
    total_price?: number
    notes?: string
    proposal_items: { quotation_item_id: string; unit_price: number }[]
  }
): Promise<QuotationProposal> {
  const response = await apiFetch<ApiResponse<RawQuotationProposal>>(
    `/api/compras/cotacoes/${quotation_id}/propostas`,
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseQuotationProposal(response.data)
}

export async function updateProposta(
  quotation_id: string,
  proposal_id: string,
  data: Partial<{
    total_price: number
    notes: string
    proposal_items: { quotation_item_id: string; unit_price: number }[]
  }>
): Promise<QuotationProposal> {
  const response = await apiFetch<ApiResponse<RawQuotationProposal>>(
    `/api/compras/cotacoes/${quotation_id}/propostas/${proposal_id}`,
    { method: "PUT", body: JSON.stringify(data) }
  )
  return parseQuotationProposal(response.data)
}

export async function deleteProposta(
  quotation_id: string,
  proposal_id: string
): Promise<void> {
  await apiFetch(`/api/compras/cotacoes/${quotation_id}/propostas/${proposal_id}`, {
    method: "DELETE",
  })
}

export async function selecionarVencedor(
  quotation_id: string,
  proposal_id: string
): Promise<Quotation> {
  const response = await apiFetch<ApiResponse<RawQuotation>>(
    `/api/compras/cotacoes/${quotation_id}/selecionar-vencedor`,
    { method: "POST", body: JSON.stringify({ proposal_id }) }
  )
  return parseQuotation(response.data)
}

export async function aprovarCotacao(quotation_id: string): Promise<Quotation> {
  const response = await apiFetch<ApiResponse<RawQuotation>>(
    `/api/compras/cotacoes/${quotation_id}/aprovar`,
    { method: "POST" }
  )
  return parseQuotation(response.data)
}

export async function cancelarCotacao(
  quotation_id: string,
  note: string
): Promise<Quotation> {
  const response = await apiFetch<ApiResponse<RawQuotation>>(
    `/api/compras/cotacoes/${quotation_id}/cancelar`,
    { method: "POST", body: JSON.stringify({ note }) }
  )
  return parseQuotation(response.data)
}

export async function realizarPedido(
  quotation_id: string,
  data: { shipping_cost?: number; ordered_at?: string; notes?: string }
): Promise<Quotation> {
  const response = await apiFetch<ApiResponse<RawQuotation>>(
    `/api/compras/cotacoes/${quotation_id}/realizar-pedido`,
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseQuotation(response.data)
}
