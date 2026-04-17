import { apiFetch } from "@/lib/api"
import {
  AccountsPayable,
  AccountsReceivable,
  ApiResponse,
  Balance,
  CashFlowPoint,
  CashFlowResult,
  DefaulterItem,
  FinancialMovement,
  MovementType,
  PayableStatus,
  ReceivableStatus,
} from "@/types/index"

// Backend returns Decimal fields as strings in JSON (Pydantic default).
// Parse them to numbers at the service boundary.
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

export async function getSaldo(): Promise<Balance> {
  const response = await apiFetch<ApiResponse<RawBalance>>("/api/financeiro/saldo")
  const raw = response.data
  return {
    total_entradas: toNumber(raw.total_entradas),
    total_saidas: toNumber(raw.total_saidas),
    saldo: toNumber(raw.saldo),
  }
}

export async function getMovimentacoes(params?: {
  source_module?: string
}): Promise<FinancialMovement[]> {
  const response = await apiFetch<ApiResponse<RawMovement[]>>(
    "/api/financeiro/movimentacoes",
    { params: { source_module: params?.source_module } }
  )
  return response.data.map(parseMovement)
}

export async function getContasPagar(status?: PayableStatus): Promise<AccountsPayable[]> {
  const response = await apiFetch<ApiResponse<RawPayable[]>>(
    "/api/financeiro/contas-pagar",
    { params: { status } }
  )
  return response.data.map(parsePayable)
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

export async function getContasReceber(
  status?: ReceivableStatus
): Promise<AccountsReceivable[]> {
  const response = await apiFetch<ApiResponse<RawReceivable[]>>(
    "/api/financeiro/contas-receber",
    { params: { status } }
  )
  return response.data.map(parseReceivable)
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

export async function receberConta(
  id: string,
  amount: number
): Promise<AccountsReceivable> {
  const response = await apiFetch<ApiResponse<RawReceivable>>(
    `/api/financeiro/contas-receber/${id}/receber`,
    {
      method: "PUT",
      body: JSON.stringify({ amount }),
    }
  )
  return parseReceivable(response.data)
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

// Adapts the financeiro cash-flow response to the CashFlowPoint shape
// expected by the shared CashFlowChart component.
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
