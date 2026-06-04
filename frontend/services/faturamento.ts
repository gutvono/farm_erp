import { apiFetch } from "@/lib/api"
import { ApiResponse, Invoice, InvoiceItem, InvoiceStatus } from "@/types/index"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

interface RawInvoiceItem {
  id: string
  description: string
  quantity: string | number
  unit_price: string | number
  subtotal: string | number
}

function parseInvoiceItem(raw: RawInvoiceItem): InvoiceItem {
  return {
    id: raw.id,
    description: raw.description,
    quantity: toNumber(raw.quantity),
    unit_price: toNumber(raw.unit_price),
    subtotal: toNumber(raw.subtotal),
  }
}

interface RawInvoice {
  id: string
  number: string
  sale_id: string | null
  client_id: string | null
  client_name: string
  status: InvoiceStatus
  total_amount: string | number
  issue_date: string
  due_date: string | null
  notes: string | null
  invoice_type: string
  installment_number: number | null
  installment_total: number | null
  parent_invoice_id: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  items: RawInvoiceItem[]
  created_at: string
  updated_at: string
}

function parseInvoice(raw: RawInvoice): Invoice {
  return {
    id: raw.id,
    number: raw.number,
    sale_id: raw.sale_id,
    client_id: raw.client_id,
    client_name: raw.client_name,
    status: raw.status,
    total_amount: toNumber(raw.total_amount),
    issue_date: raw.issue_date,
    due_date: raw.due_date,
    notes: raw.notes,
    invoice_type: raw.invoice_type ?? "venda",
    installment_number: raw.installment_number ?? null,
    installment_total: raw.installment_total ?? null,
    parent_invoice_id: raw.parent_invoice_id ?? null,
    cancelled_at: raw.cancelled_at ?? null,
    cancellation_reason: raw.cancellation_reason ?? null,
    items: (raw.items ?? []).map(parseInvoiceItem),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

export async function getFaturas(params?: {
  status?: string
  client_id?: string
  order_id?: string
}): Promise<Invoice[]> {
  const response = await apiFetch<ApiResponse<RawInvoice[]>>(
    "/api/faturamento/faturas",
    {
      params: {
        status: params?.status,
        client_id: params?.client_id,
        order_id: params?.order_id,
      },
    }
  )
  return response.data.map(parseInvoice)
}

export async function createFatura(data: {
  client_id: string
  notes?: string
  due_date?: string
  items: { description: string; quantity: number; unit_price: number }[]
}): Promise<Invoice> {
  const response = await apiFetch<ApiResponse<RawInvoice>>(
    "/api/faturamento/faturas",
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseInvoice(response.data)
}

export async function getFatura(id: string): Promise<Invoice> {
  const response = await apiFetch<ApiResponse<RawInvoice>>(
    `/api/faturamento/faturas/${id}`
  )
  return parseInvoice(response.data)
}

export async function updateFaturaStatus(
  id: string,
  status: InvoiceStatus
): Promise<Invoice> {
  const response = await apiFetch<ApiResponse<RawInvoice>>(
    `/api/faturamento/faturas/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  )
  return parseInvoice(response.data)
}

/**
 * Cancela uma NF com estorno ponta a ponta, conforme o `invoice_type`
 * (venda/recebimento/transporte/devolucao). O backend responde o wrapper
 * `SuccessResponse` — extraímos `data` (InvoiceOut já cancelada). O `reason`
 * é opcional e enviado como motivo do cancelamento.
 *
 * Erros do backend (ex.: 400 "Nota fiscal já cancelada") são propagados
 * verbatim por `apiFetch`.
 */
export async function cancelarFatura(id: string, reason?: string): Promise<Invoice> {
  const trimmed = reason?.trim()
  const response = await apiFetch<ApiResponse<RawInvoice>>(
    `/api/faturamento/faturas/${id}/cancelar`,
    {
      method: "POST",
      body: JSON.stringify(trimmed ? { reason: trimmed } : {}),
    }
  )
  return parseInvoice(response.data)
}
