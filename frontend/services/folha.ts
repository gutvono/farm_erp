import { apiFetch } from "@/lib/api"
import {
  ApiResponse,
  ContractType,
  Employee,
  PayrollBatchResult,
  PayrollEntry,
  PayrollEntryStatus,
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
  role: string
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
    role: raw.role,
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
    role: string
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
}

function parseEntry(raw: RawPayrollEntry): PayrollEntry {
  const overtime = raw.overtime_amount ?? raw.extras_value ?? 0
  const deductions = raw.deductions ?? raw.deductions_value ?? 0
  const total = raw.total_amount ?? raw.net_amount ?? 0
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
