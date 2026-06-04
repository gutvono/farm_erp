import { apiFetch } from "@/lib/api"
import { fetchPaginated } from "@/lib/pagination"
import {
  ApiResponse,
  ContractType,
  Employee,
  JobPosition,
  Paginated,
  PayrollBatchResult,
  PayrollCalculationPreview,
  PayrollCalculationRequest,
  PayrollEntry,
  PayrollEntryItem,
  PayrollEntryStatus,
  PayrollEvent,
  PayrollCalculationType,
  PayrollEventType,
  PayrollItemSource,
  PayrollPeriod,
  PayrollPeriodStatus,
} from "@/types/index"



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
  return raw.startsWith("/") ? raw : `/${raw}`
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
  photo_path: string | null
  photo_url: string | null
  is_active: boolean
  termination_cost_override: string | number | null
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
    photo_path: raw.photo_path,
    photo_url: buildPhotoUrl(raw.photo_url),
    is_active: raw.is_active,
    termination_cost_override: toNumberOrNull(raw.termination_cost_override),
    created_at: raw.created_at,
  }
}

export async function getFuncionarios(params?: {
  is_active?: boolean
  contract_type?: ContractType
}): Promise<Employee[]> {
  const response = await apiFetch<ApiResponse<RawEmployee[]>>(
    "/api/folha/funcionarios",
    {
      params: {
        is_active: params?.is_active,
        contract_type: params?.contract_type,
      },
    }
  )
  return response.data.map(parseEmployee)
}

export async function createFuncionario(data: FormData): Promise<Employee> {
  const response = await fetch("/api/folha/funcionarios", {
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

export async function pagarEntry(id: string): Promise<PayrollEntry> {
  const response = await apiFetch<ApiResponse<RawPayrollEntry>>(
    `/api/folha/entries/${id}/pagar`,
    { method: "POST" }
  )
  return parseEntry(response.data)
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

interface RawBatchResult {
  paid_count: number
  total_paid: string | number
  insufficient_balance: boolean
  failed_employees: string[]
}

export async function pagarTodos(period_id: string): Promise<PayrollBatchResult> {
  const response = await apiFetch<ApiResponse<RawBatchResult>>(
    `/api/folha/periodos/${period_id}/pagar-todos`,
    { method: "POST" }
  )
  return {
    paid_count: response.data.paid_count,
    total_paid: toNumber(response.data.total_paid),
    insufficient_balance: response.data.insufficient_balance,
    failed_employees: response.data.failed_employees ?? [],
  }
}
