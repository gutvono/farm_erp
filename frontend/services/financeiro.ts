import { apiFetch } from "@/lib/api"
import { fetchPaginated } from "@/lib/pagination"
import { parsePaymentRequest, type RawPaymentRequest } from "@/services/folha"
import {
  AccountsPayable,
  AccountsReceivable,
  ApiResponse,
  Balance,
  BoletoPaymentInfo,
  CashFlowPoint,
  CashFlowResult,
  DefaulterItem,
  EncargoBreakdown,
  FinancialMovement,
  MovementType,
  Paginated,
  PayableStatus,
  PaymentMethod,
  PayrollPaymentRequest,
  PixPaymentInfo,
  ReceivableStatus,
} from "@/types/index"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

interface RawMovement {
  id: string
  movement_type: MovementType
  category: string
  amount: string | number
  description: string
  source_module: string | null
  reference_id: string | null
  occurred_at: string
  created_at: string
}

function parseMovement(raw: RawMovement): FinancialMovement {
  return {
    id: raw.id,
    movement_type: raw.movement_type,
    category: raw.category,
    amount: toNumber(raw.amount),
    description: raw.description,
    source_module: raw.source_module,
    reference_id: raw.reference_id,
    occurred_at: raw.occurred_at,
    created_at: raw.created_at,
  }
}

interface RawPayable {
  id: string
  number: string
  description: string
  amount: string | number
  due_date: string
  paid_at: string | null
  status: PayableStatus
  supplier_id: string | null
  purchase_order_id: string | null
  notes: string | null
  installment_number: number | null
  installment_total: number | null
  payment_method: PaymentMethod | null
  created_at: string
  updated_at: string
}

function parsePayable(raw: RawPayable): AccountsPayable {
  return {
    id: raw.id,
    number: raw.number,
    description: raw.description,
    amount: toNumber(raw.amount),
    due_date: raw.due_date,
    paid_at: raw.paid_at,
    status: raw.status,
    supplier_id: raw.supplier_id,
    purchase_order_id: raw.purchase_order_id,
    notes: raw.notes,
    installment_number: raw.installment_number,
    installment_total: raw.installment_total,
    payment_method: raw.payment_method ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawReceivable {
  id: string
  number: string
  description: string
  amount: string | number
  amount_received: string | number
  due_date: string
  received_at: string | null
  status: ReceivableStatus
  client_id: string
  sale_id: string | null
  invoice_id: string | null
  notes: string | null
  installment_number: number | null
  installment_total: number | null
  payment_method: PaymentMethod | null
  is_overdue?: boolean
  days_overdue?: number
  created_at: string
  updated_at: string
}

function parseReceivable(raw: RawReceivable): AccountsReceivable {
  return {
    id: raw.id,
    number: raw.number,
    description: raw.description,
    amount: toNumber(raw.amount),
    amount_received: toNumber(raw.amount_received),
    due_date: raw.due_date,
    received_at: raw.received_at,
    status: raw.status,
    client_id: raw.client_id,
    sale_id: raw.sale_id,
    invoice_id: raw.invoice_id,
    notes: raw.notes,
    installment_number: raw.installment_number,
    installment_total: raw.installment_total,
    payment_method: raw.payment_method ?? null,
    is_overdue: raw.is_overdue ?? false,
    days_overdue: raw.days_overdue ?? 0,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawBalance {
  total_entradas: string | number
  total_saidas: string | number
  saldo: string | number
}

interface RawCashFlowItem {
  period: string
  entradas: string | number
  saidas: string | number
  saldo: string | number
}

interface RawCashFlow {
  items: RawCashFlowItem[]
  total_entradas: string | number
  total_saidas: string | number
  saldo: string | number
}

interface RawDefaulter {
  client_id: string
  client_name: string
  receivable_id: string
  receivable_number: string
  amount: string | number
  amount_received: string | number
  due_date: string
}

interface RawPixInfo {
  pix_key: string
  pix_code: string
  amount: string | number
  description: string
}

interface RawBoletoInfo {
  boleto_number: string
  barcode: string
  due_date: string
  amount: string | number
  beneficiary: string
  payer: string
}

export async function getSaldo(): Promise<Balance> {
  const response = await apiFetch<ApiResponse<RawBalance>>("/api/financeiro/saldo")
  const raw = response.data
  return {
    total_entradas: toNumber(raw.total_entradas),
    total_saidas: toNumber(raw.total_saidas),
    saldo: toNumber(raw.saldo),
  }
}

/**
 * Lista paginada de movimentações (`GET /api/financeiro/movimentacoes`).
 * Endpoint paginado da Demanda 0 → responde o envelope `Page[T]` cru, por isso
 * usa `fetchPaginated`. `amount` chega como string e é convertido em
 * `parseMovement`. Filtros: `movement_type`, `category`, `source_module`,
 * `start_date`/`end_date` (sobre `occurred_at`), `search` (ILIKE em descrição).
 * Ordenação aceita pelo backend: `occurred_at`, `amount` (default `occurred_at desc`).
 */
export async function getMovimentacoes(params?: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  movement_type?: MovementType
  category?: string
  source_module?: string
  search?: string
  start_date?: string
  end_date?: string
}): Promise<Paginated<FinancialMovement>> {
  return fetchPaginated<FinancialMovement, RawMovement>(
    "/api/financeiro/movimentacoes",
    params,
    parseMovement
  )
}

/**
 * Lista paginada de contas a pagar (`GET /api/financeiro/contas-pagar`).
 * Filtros: `status`, `supplier_id`, `due_after`/`due_before`, `search` (ILIKE em
 * número/descrição/nome do fornecedor). Ordenação: `due_date`, `amount`,
 * `created_at` (default `due_date asc`).
 */
export async function getContasPagar(params?: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  status?: PayableStatus
  supplier_id?: string
  search?: string
  due_after?: string
  due_before?: string
}): Promise<Paginated<AccountsPayable>> {
  return fetchPaginated<AccountsPayable, RawPayable>(
    "/api/financeiro/contas-pagar",
    params,
    parsePayable
  )
}

export async function createContaPagar(data: {
  description: string
  amount: number
  due_date: string
  supplier_id?: string
}): Promise<AccountsPayable> {
  const response = await apiFetch<ApiResponse<RawPayable>>(
    "/api/financeiro/contas-pagar",
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  )
  return parsePayable(response.data)
}

export async function pagarConta(id: string): Promise<AccountsPayable> {
  const response = await apiFetch<ApiResponse<RawPayable>>(
    `/api/financeiro/contas-pagar/${id}/pagar`,
    { method: "PUT", body: JSON.stringify({}) }
  )
  return parsePayable(response.data)
}

export async function cancelarConta(id: string): Promise<AccountsPayable> {
  const response = await apiFetch<ApiResponse<RawPayable>>(
    `/api/financeiro/contas-pagar/${id}/cancelar`,
    { method: "PUT" }
  )
  return parsePayable(response.data)
}

export async function atualizarMetodoPagamentoPagar(
  id: string,
  payment_method: PaymentMethod
): Promise<AccountsPayable> {
  const response = await apiFetch<ApiResponse<RawPayable>>(
    `/api/financeiro/contas-pagar/${id}/metodo-pagamento`,
    { method: "PATCH", body: JSON.stringify({ payment_method }) }
  )
  return parsePayable(response.data)
}

export async function getPixPagar(id: string): Promise<PixPaymentInfo> {
  const response = await apiFetch<ApiResponse<RawPixInfo>>(
    `/api/financeiro/contas-pagar/${id}/pix`
  )
  return { ...response.data, amount: toNumber(response.data.amount) }
}

export async function getBoletoPagar(id: string): Promise<BoletoPaymentInfo> {
  const response = await apiFetch<ApiResponse<RawBoletoInfo>>(
    `/api/financeiro/contas-pagar/${id}/boleto`
  )
  return { ...response.data, amount: toNumber(response.data.amount) }
}

/**
 * Lista paginada de contas a receber (`GET /api/financeiro/contas-receber`).
 * Filtros: `status`, `client_id`, `due_after`/`due_before`, `search` (ILIKE em
 * número/descrição/nome do cliente). Ordenação: `due_date`, `amount`,
 * `created_at` (default `due_date asc`).
 */
export async function getContasReceber(params?: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  status?: ReceivableStatus
  client_id?: string
  search?: string
  due_after?: string
  due_before?: string
}): Promise<Paginated<AccountsReceivable>> {
  return fetchPaginated<AccountsReceivable, RawReceivable>(
    "/api/financeiro/contas-receber",
    params,
    parseReceivable
  )
}

export async function createContaReceber(data: {
  description: string
  amount: number
  due_date: string
  client_id: string
}): Promise<AccountsReceivable> {
  const response = await apiFetch<ApiResponse<RawReceivable>>(
    "/api/financeiro/contas-receber",
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  )
  return parseReceivable(response.data)
}

/**
 * Registra a baixa de uma parcela. `encargo` (Demanda 9.B) é o override opcional
 * do encargo por atraso: só vale na baixa que QUITA uma parcela vencida, `0` =
 * perdão, ausente = backend usa o cálculo automático (multa + juros).
 */
export async function receberConta(
  id: string,
  amount: number,
  encargo?: number
): Promise<AccountsReceivable> {
  const response = await apiFetch<ApiResponse<RawReceivable>>(
    `/api/financeiro/contas-receber/${id}/receber`,
    {
      method: "PUT",
      body: JSON.stringify(encargo === undefined ? { amount } : { amount, encargo }),
    }
  )
  return parseReceivable(response.data)
}

interface RawEncargo {
  receivable_id: string
  number: string
  saldo: number | string
  dias_atraso: number
  multa: number | string
  juros: number | string
  total: number | string
}

/**
 * Calcula o breakdown do encargo por atraso de uma parcela
 * (`GET /api/financeiro/contas-receber/{id}/encargo`). Tudo `0` quando a parcela
 * não está vencida.
 */
export async function getEncargo(id: string): Promise<EncargoBreakdown> {
  const response = await apiFetch<ApiResponse<RawEncargo>>(
    `/api/financeiro/contas-receber/${id}/encargo`
  )
  const raw = response.data
  return {
    receivable_id: raw.receivable_id,
    number: raw.number,
    saldo: toNumber(raw.saldo),
    dias_atraso: raw.dias_atraso,
    multa: toNumber(raw.multa),
    juros: toNumber(raw.juros),
    total: toNumber(raw.total),
  }
}

export async function marcarInadimplente(id: string): Promise<AccountsReceivable> {
  const response = await apiFetch<ApiResponse<RawReceivable>>(
    `/api/financeiro/contas-receber/${id}/inadimplente`,
    { method: "PUT" }
  )
  return parseReceivable(response.data)
}

export async function reverterInadimplencia(
  id: string
): Promise<AccountsReceivable> {
  const response = await apiFetch<ApiResponse<RawReceivable>>(
    `/api/financeiro/contas-receber/${id}/reverter-inadimplencia`,
    { method: "PUT" }
  )
  return parseReceivable(response.data)
}

export async function atualizarMetodoPagamentoReceber(
  id: string,
  payment_method: PaymentMethod
): Promise<AccountsReceivable> {
  const response = await apiFetch<ApiResponse<RawReceivable>>(
    `/api/financeiro/contas-receber/${id}/metodo-pagamento`,
    { method: "PATCH", body: JSON.stringify({ payment_method }) }
  )
  return parseReceivable(response.data)
}

export async function getPixReceber(id: string): Promise<PixPaymentInfo> {
  const response = await apiFetch<ApiResponse<RawPixInfo>>(
    `/api/financeiro/contas-receber/${id}/pix`
  )
  return { ...response.data, amount: toNumber(response.data.amount) }
}

export async function getBoletoReceber(id: string): Promise<BoletoPaymentInfo> {
  const response = await apiFetch<ApiResponse<RawBoletoInfo>>(
    `/api/financeiro/contas-receber/${id}/boleto`
  )
  return { ...response.data, amount: toNumber(response.data.amount) }
}

export async function getFluxoCaixa(months = 6): Promise<CashFlowResult> {
  const response = await apiFetch<ApiResponse<RawCashFlow>>(
    "/api/financeiro/fluxo-caixa",
    { params: { months } }
  )
  const raw = response.data
  return {
    items: raw.items.map((item) => ({
      period: item.period,
      entradas: toNumber(item.entradas),
      saidas: toNumber(item.saidas),
      saldo: toNumber(item.saldo),
    })),
    total_entradas: toNumber(raw.total_entradas),
    total_saidas: toNumber(raw.total_saidas),
    saldo: toNumber(raw.saldo),
  }
}

export async function getFluxoCaixaChartData(months = 6): Promise<CashFlowPoint[]> {
  const flow = await getFluxoCaixa(months)
  return flow.items.map((item) => ({
    month: item.period,
    income: item.entradas,
    expenses: item.saidas,
  }))
}

export async function getInadimplentes(): Promise<DefaulterItem[]> {
  const response = await apiFetch<ApiResponse<RawDefaulter[]>>(
    "/api/financeiro/relatorio-inadimplencia"
  )
  return response.data.map((raw) => ({
    client_id: raw.client_id,
    client_name: raw.client_name,
    receivable_id: raw.receivable_id,
    receivable_number: raw.receivable_number,
    amount: toNumber(raw.amount),
    amount_received: toNumber(raw.amount_received),
    due_date: raw.due_date,
  }))
}

// ── Aprovação de pagamento de folha (Demanda 4) ───────────────────────────────

/**
 * Fila de solicitações de pagamento de folha aguardando aprovação do Financeiro
 * (`GET /api/financeiro/aprovacoes-folha`). Resposta é `SuccessResponse` cujo
 * `data` é a lista de solicitações.
 */
export async function getAprovacoesFolha(): Promise<PayrollPaymentRequest[]> {
  const response = await apiFetch<ApiResponse<RawPaymentRequest[]>>(
    "/api/financeiro/aprovacoes-folha"
  )
  return response.data.map(parsePaymentRequest)
}

/**
 * Aprova uma solicitação de folha. O backend valida o saldo do total: se for
 * insuficiente, responde 400 (a mensagem deve ser exibida em toast). Ao aprovar,
 * gera 1 movimento `saida/folha` e 1 NF `folha_pagamento` por funcionário.
 */
export async function aprovarFolha(
  requestId: string
): Promise<PayrollPaymentRequest> {
  const response = await apiFetch<ApiResponse<RawPaymentRequest>>(
    `/api/financeiro/aprovacoes-folha/${requestId}/aprovar`,
    { method: "POST" }
  )
  return parsePaymentRequest(response.data)
}

/**
 * Recusa uma solicitação de folha com motivo obrigatório. Os holerites voltam a
 * `pendente`; nenhum movimento financeiro é gerado.
 */
export async function recusarFolha(
  requestId: string,
  note: string
): Promise<PayrollPaymentRequest> {
  const response = await apiFetch<ApiResponse<RawPaymentRequest>>(
    `/api/financeiro/aprovacoes-folha/${requestId}/recusar`,
    { method: "POST", body: JSON.stringify({ note }) }
  )
  return parsePaymentRequest(response.data)
}
