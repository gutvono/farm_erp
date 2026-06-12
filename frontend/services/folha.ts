import { apiFetch } from "@/lib/api"
import { fetchPaginated } from "@/lib/pagination"
import {
  ApiResponse,
  ContractType,
  Employee,
  EmployeePayslip,
  JobPosition,
  Paginated,
  PayrollCalculationPreview,
  PayrollCalculationRequest,
  PayrollEntry,
  PayrollEntryItem,
  PayrollEntryStatus,
  PayrollEvent,
  PayrollCalculationType,
  PayrollEventType,
  PayrollItemSource,
  PayrollPaymentRequest,
  PayrollPaymentRequestEntry,
  PayrollPaymentRequestStatus,
  PayrollPaymentRequestType,
  PayrollPeriod,
  PayrollPeriodStatus,
} from "@/types/index"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return toNumber(value)
}

function buildPhotoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  const path = raw.startsWith("/") ? raw : `/${raw}`
  return `${API_BASE_URL}${path}`
}

// ── Funcionários ─────────────────────────────────────────────────────────────

interface RawEmployee {
  id: string
  name: string
  cpf: string
  position_id: string
  position_name: string
  base_salary: string | number
  contract_type: ContractType
  admission_date: string
  photo_path?: string | null
  photo_url: string | null
  is_active: boolean
  termination_cost_override: string | number | null
  transport_voucher_cost?: string | number | null
  meal_voucher_value?: string | number | null
  pharmacy_voucher_value?: string | number | null
  life_insurance_value?: string | number | null
  dependents_count?: string | number
  created_at: string
}

function parseEmployee(raw: RawEmployee): Employee {
  return {
    id: raw.id,
    name: raw.name,
    cpf: raw.cpf,
    position_id: raw.position_id,
    position_name: raw.position_name,
    base_salary: toNumber(raw.base_salary),
    contract_type: raw.contract_type,
    admission_date: raw.admission_date,
    photo_path: raw.photo_path ?? null,
    photo_url: buildPhotoUrl(raw.photo_url),
    is_active: raw.is_active,
    termination_cost_override: toNumberOrNull(raw.termination_cost_override),
    transport_voucher_cost: toNumberOrNull(raw.transport_voucher_cost),
    meal_voucher_value: toNumberOrNull(raw.meal_voucher_value),
    pharmacy_voucher_value: toNumberOrNull(raw.pharmacy_voucher_value),
    life_insurance_value: toNumberOrNull(raw.life_insurance_value),
    dependents_count: toNumber(raw.dependents_count),
    created_at: raw.created_at,
  }
}

/**
 * Lista funcionários como ARRAY (seletor/dropdown — atividade de talhão no PCP,
 * mapa de avatares dos holerites). O endpoint é paginado (`Page[T]`, Demanda 8);
 * pede uma página grande e devolve só os `items`, preservando a assinatura
 * `Employee[]` e os filtros (`is_active`, `contract_type`) dos chamadores fora do
 * escopo. Para a TABELA paginada use `getFuncionariosPaginated`.
 */
export async function getFuncionarios(params?: {
  is_active?: boolean
  contract_type?: ContractType
}): Promise<Employee[]> {
  const result = await fetchPaginated<Employee, RawEmployee>(
    "/api/folha/funcionarios",
    {
      page_size: 100,
      is_active: params?.is_active,
      contract_type: params?.contract_type,
    },
    parseEmployee
  )
  return result.items
}

/** Lista paginada de funcionários (`GET /api/folha/funcionarios`, `Page[T]`).
 * `order_by` aceito: `name`; filtros: `is_active`, `contract_type`; `search`
 * por nome/documento. */
export async function getFuncionariosPaginated(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
  is_active?: boolean
  contract_type?: ContractType
}): Promise<Paginated<Employee>> {
  return fetchPaginated<Employee, RawEmployee>(
    "/api/folha/funcionarios",
    params,
    parseEmployee
  )
}

export async function createFuncionario(data: FormData): Promise<Employee> {
  const response = await fetch(`${API_BASE_URL}/api/folha/funcionarios`, {
    method: "POST",
    credentials: "include",
    body: data,
  })

  const json = await response.json().catch(() => null)

  if (response.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login"
    throw new Error("Sessão expirada. Redirecionando para login...")
  }

  if (!response.ok) {
    const message =
      json?.message ?? `Erro ${response.status}: ${response.statusText}`
    throw new Error(message)
  }

  return parseEmployee((json as ApiResponse<RawEmployee>).data)
}

export async function updateFuncionario(
  id: string,
  data: Partial<{
    name: string
    position_id: string
    base_salary: number
    contract_type: ContractType
    admission_date: string
    termination_cost_override: number
    transport_voucher_cost: number
    meal_voucher_value: number
    pharmacy_voucher_value: number
    life_insurance_value: number
    dependents_count: number
  }>
): Promise<Employee> {
  const response = await apiFetch<ApiResponse<RawEmployee>>(
    `/api/folha/funcionarios/${id}`,
    { method: "PUT", body: JSON.stringify(data) }
  )
  return parseEmployee(response.data)
}

export async function demitirFuncionario(id: string): Promise<Employee> {
  const response = await apiFetch<ApiResponse<RawEmployee>>(
    `/api/folha/funcionarios/${id}/demitir`,
    { method: "POST" }
  )
  return parseEmployee(response.data)
}

// ── Cargos (Job Positions) ───────────────────────────────────────────────────

interface RawJobPosition {
  id: string
  name: string
  description: string | null
  base_salary: string | number
  is_active: boolean
}

function parseJobPosition(raw: RawJobPosition): JobPosition {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    base_salary: toNumber(raw.base_salary),
    is_active: raw.is_active,
  }
}

/**
 * Lista paginada de cargos (`GET /api/folha/cargos`). O endpoint responde o
 * envelope `Page[T]` cru (infra de paginação da Demanda 0), por isso usa
 * `fetchPaginated`. `base_salary` chega como string e é convertido por
 * `parseJobPosition`. `order_by` aceito pelo backend: `name`, `base_salary`
 * (default `name asc`); `search` filtra por `name`.
 */
export async function getCargos(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
}): Promise<Paginated<JobPosition>> {
  return fetchPaginated<JobPosition, RawJobPosition>(
    "/api/folha/cargos",
    params,
    parseJobPosition
  )
}

export async function createCargo(data: {
  name: string
  description?: string
  base_salary: number
  is_active: boolean
}): Promise<JobPosition> {
  const response = await apiFetch<ApiResponse<RawJobPosition>>(
    "/api/folha/cargos",
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseJobPosition(response.data)
}

export async function updateCargo(
  id: string,
  data: Partial<{
    name: string
    description: string
    base_salary: number
    is_active: boolean
  }>
): Promise<JobPosition> {
  const response = await apiFetch<ApiResponse<RawJobPosition>>(
    `/api/folha/cargos/${id}`,
    { method: "PUT", body: JSON.stringify(data) }
  )
  return parseJobPosition(response.data)
}

export async function deleteCargo(id: string): Promise<void> {
  await apiFetch(`/api/folha/cargos/${id}`, { method: "DELETE" })
}

// ── Períodos ─────────────────────────────────────────────────────────────────

interface RawPayrollEntry {
  id: string
  payroll_period_id: string
  employee_id: string
  employee_name: string
  contract_type: ContractType
  base_salary: string | number
  overtime_amount?: string | number
  extras_value?: string | number
  deductions?: string | number
  deductions_value?: string | number
  total_amount?: string | number
  net_amount?: string | number
  status: PayrollEntryStatus
  paid_at: string | null
  gross_amount?: string | number
  total_earnings?: string | number
  total_deductions?: string | number
  total_informative?: string | number
  items?: RawPayrollEntryItem[]
}

interface RawPayrollEvent {
  id: string
  description: string
  event_type: PayrollEventType
  calculation_type: PayrollCalculationType
  is_automatic: boolean
  affects_net: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

interface RawPayrollEntryItem {
  id: string
  payroll_entry_id: string
  payroll_event_id: string
  event_description: string
  event_type: PayrollEventType
  calculation_type: PayrollCalculationType
  amount: string | number
  calculation_base: string | number | null
  quantity: string | number | null
  percentage: string | number | null
  metadata: Record<string, unknown>
  source: PayrollItemSource
  affects_net: boolean
  created_at: string
  updated_at: string
}

function parseEvent(raw: RawPayrollEvent): PayrollEvent {
  return {
    id: raw.id,
    description: raw.description,
    event_type: raw.event_type,
    calculation_type: raw.calculation_type,
    is_automatic: raw.is_automatic,
    affects_net: raw.affects_net,
    is_active: raw.is_active,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

function parseEntryItem(raw: RawPayrollEntryItem): PayrollEntryItem {
  return {
    id: raw.id,
    payroll_entry_id: raw.payroll_entry_id,
    payroll_event_id: raw.payroll_event_id,
    event_description: raw.event_description,
    event_type: raw.event_type,
    calculation_type: raw.calculation_type,
    amount: toNumber(raw.amount),
    calculation_base: toNumberOrNull(raw.calculation_base),
    quantity: toNumberOrNull(raw.quantity),
    percentage: toNumberOrNull(raw.percentage),
    metadata: raw.metadata ?? {},
    source: raw.source,
    affects_net: raw.affects_net,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

function parseEntry(raw: RawPayrollEntry): PayrollEntry {
  const overtime = raw.overtime_amount ?? raw.extras_value ?? 0
  const deductions = raw.deductions ?? raw.deductions_value ?? 0
  const total = raw.total_amount ?? raw.net_amount ?? 0
  const items = (raw.items ?? []).map(parseEntryItem)
  return {
    id: raw.id,
    payroll_period_id: raw.payroll_period_id,
    employee_id: raw.employee_id,
    employee_name: raw.employee_name,
    contract_type: raw.contract_type,
    base_salary: toNumber(raw.base_salary),
    overtime_amount: toNumber(overtime),
    deductions: toNumber(deductions),
    total_amount: toNumber(total),
    status: raw.status,
    paid_at: raw.paid_at,
    gross_amount: toNumber(raw.gross_amount ?? raw.base_salary),
    total_earnings: toNumber(raw.total_earnings ?? raw.base_salary),
    total_deductions: toNumber(raw.total_deductions ?? deductions),
    total_informative: toNumber(raw.total_informative ?? 0),
    items,
  }
}

interface RawEmployeePayslip extends RawPayrollEntry {
  reference_month: number
  reference_year: number
  period_status: PayrollPeriodStatus
}

function parseEmployeePayslip(raw: RawEmployeePayslip): EmployeePayslip {
  return {
    ...parseEntry(raw),
    reference_month: raw.reference_month,
    reference_year: raw.reference_year,
    period_status: raw.period_status,
  }
}

interface RawPayrollPeriod {
  id: string
  reference_month: number
  reference_year: number
  status: PayrollPeriodStatus
  total_amount: string | number
  entries?: RawPayrollEntry[]
  created_at: string
}

function parsePeriod(raw: RawPayrollPeriod): PayrollPeriod {
  return {
    id: raw.id,
    reference_month: raw.reference_month,
    reference_year: raw.reference_year,
    status: raw.status,
    total_amount: toNumber(raw.total_amount),
    entries: (raw.entries ?? []).map(parseEntry),
    created_at: raw.created_at,
  }
}

export async function getPeriodos(): Promise<PayrollPeriod[]> {
  const response = await apiFetch<ApiResponse<RawPayrollPeriod[]>>(
    "/api/folha/periodos"
  )
  return response.data.map(parsePeriod)
}

export async function createOrGetPeriodo(data: {
  reference_month: number
  reference_year: number
}): Promise<PayrollPeriod> {
  const response = await apiFetch<ApiResponse<RawPayrollPeriod>>(
    "/api/folha/periodos",
    { method: "POST", body: JSON.stringify(data) }
  )
  return parsePeriod(response.data)
}

export async function getPeriodo(id: string): Promise<PayrollPeriod> {
  const response = await apiFetch<ApiResponse<RawPayrollPeriod>>(
    `/api/folha/periodos/${id}`
  )
  return parsePeriod(response.data)
}

export async function getHoleritesFuncionario(
  employeeId: string,
  year: number
): Promise<EmployeePayslip[]> {
  const response = await apiFetch<ApiResponse<RawEmployeePayslip[]>>(
    `/api/folha/funcionarios/${employeeId}/holerites`,
    { params: { year } }
  )
  return response.data.map(parseEmployeePayslip)
}

export async function fecharPeriodo(id: string): Promise<PayrollPeriod> {
  const response = await apiFetch<ApiResponse<RawPayrollPeriod>>(
    `/api/folha/periodos/${id}/fechar`,
    { method: "POST" }
  )
  return parsePeriod(response.data)
}

// ── Entries ──────────────────────────────────────────────────────────────────

export async function updateEntry(
  id: string,
  data: { overtime_amount: number; deductions: number }
): Promise<PayrollEntry> {
  const response = await apiFetch<ApiResponse<RawPayrollEntry>>(
    `/api/folha/entries/${id}`,
    { method: "PATCH", body: JSON.stringify(data) }
  )
  return parseEntry(response.data)
}

// ── Solicitação de pagamento (Demanda 4) ──────────────────────────────────────

interface RawPaymentRequestEntry {
  entry_id: string
  employee_id: string
  employee_name: string
  net_amount: string | number
}

interface RawPaymentRequest {
  id: string
  payroll_period_id: string
  competency: string
  request_type: PayrollPaymentRequestType
  status: PayrollPaymentRequestStatus
  total_amount: string | number
  approval_note: string | null
  requested_at: string
  decided_at: string | null
  entries: RawPaymentRequestEntry[]
  created_at: string
  updated_at: string
}

function parsePaymentRequestEntry(
  raw: RawPaymentRequestEntry
): PayrollPaymentRequestEntry {
  return {
    entry_id: raw.entry_id,
    employee_id: raw.employee_id,
    employee_name: raw.employee_name,
    net_amount: toNumber(raw.net_amount),
  }
}

/**
 * Converte a solicitação de pagamento de folha vinda da API (decimais como
 * string) para o tipo do front. Reutilizado pelo serviço do Financeiro
 * (fila de aprovações) para manter um único formato.
 */
export function parsePaymentRequest(raw: RawPaymentRequest): PayrollPaymentRequest {
  return {
    id: raw.id,
    payroll_period_id: raw.payroll_period_id,
    competency: raw.competency,
    request_type: raw.request_type,
    status: raw.status,
    total_amount: toNumber(raw.total_amount),
    approval_note: raw.approval_note,
    requested_at: raw.requested_at,
    decided_at: raw.decided_at,
    entries: (raw.entries ?? []).map(parsePaymentRequestEntry),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

export type { RawPaymentRequest }

/**
 * Solicita o pagamento individual de um holerite. O dinheiro não sai aqui: a
 * solicitação vai para a fila de aprovação do Financeiro e o holerite passa a
 * `aguardando_aprovacao`.
 */
export async function solicitarPagamento(
  entryId: string
): Promise<PayrollPaymentRequest> {
  const response = await apiFetch<ApiResponse<RawPaymentRequest>>(
    `/api/folha/entries/${entryId}/solicitar-pagamento`,
    { method: "POST" }
  )
  return parsePaymentRequest(response.data)
}

export async function getEventosFolha(): Promise<PayrollEvent[]> {
  const response = await apiFetch<ApiResponse<RawPayrollEvent[]>>(
    "/api/folha/eventos"
  )
  return response.data.map(parseEvent)
}

export async function getEntryItens(id: string): Promise<PayrollEntryItem[]> {
  const response = await apiFetch<ApiResponse<RawPayrollEntryItem[]>>(
    `/api/folha/entries/${id}/itens`
  )
  return response.data.map(parseEntryItem)
}

interface RawCalculationPreview {
  event_id: string
  event_description: string
  event_type: PayrollEventType
  calculation_type: PayrollCalculationType
  amount: string | number
  calculation_base: string | number
  quantity: string | number | null
  percentage: string | number | null
  metadata: Record<string, unknown>
  affects_net: boolean
}

function parseCalculationPreview(
  raw: RawCalculationPreview
): PayrollCalculationPreview {
  return {
    event_id: raw.event_id,
    event_description: raw.event_description,
    event_type: raw.event_type,
    calculation_type: raw.calculation_type,
    amount: toNumber(raw.amount),
    calculation_base: toNumber(raw.calculation_base),
    quantity: toNumberOrNull(raw.quantity),
    percentage: toNumberOrNull(raw.percentage),
    metadata: raw.metadata ?? {},
    affects_net: raw.affects_net,
  }
}

export async function previewCalculoFolha(
  id: string,
  data: PayrollCalculationRequest
): Promise<PayrollCalculationPreview> {
  const response = await apiFetch<ApiResponse<RawCalculationPreview>>(
    `/api/folha/entries/${id}/calculos/preview`,
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseCalculationPreview(response.data)
}

export async function aplicarCalculoFolha(
  id: string,
  data: PayrollCalculationRequest
): Promise<PayrollEntry> {
  const response = await apiFetch<ApiResponse<RawPayrollEntry>>(
    `/api/folha/entries/${id}/calculos/aplicar`,
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseEntry(response.data)
}

export async function upsertEntryItem(
  id: string,
  data: {
    event_id: string
    amount: number
    calculation_base?: number
    quantity?: number
    percentage?: number
    metadata?: Record<string, unknown>
  }
): Promise<PayrollEntry> {
  const response = await apiFetch<ApiResponse<RawPayrollEntry>>(
    `/api/folha/entries/${id}/itens`,
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseEntry(response.data)
}

export async function deleteEntryItem(
  entryId: string,
  itemId: string
): Promise<PayrollEntry> {
  const response = await apiFetch<ApiResponse<RawPayrollEntry>>(
    `/api/folha/entries/${entryId}/itens/${itemId}`,
    { method: "DELETE" }
  )
  return parseEntry(response.data)
}

/**
 * Solicita o pagamento de todos os holerites pendentes do período em uma única
 * solicitação (lote). Move todos para `aguardando_aprovacao`; não move dinheiro.
 */
export async function solicitarPagamentoTodos(
  periodId: string
): Promise<PayrollPaymentRequest> {
  const response = await apiFetch<ApiResponse<RawPaymentRequest>>(
    `/api/folha/periodos/${periodId}/solicitar-pagamento-todos`,
    { method: "POST" }
  )
  return parsePaymentRequest(response.data)
}
