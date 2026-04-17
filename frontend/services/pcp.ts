import { apiFetch } from "@/lib/api"
import {
  ActivityType,
  ApiResponse,
  LaborType,
  Plot,
  PlotActivity,
  ProductionInput,
  ProductionOrder,
  ProductionOrderStatus,
  ProductionResult,
} from "@/types/index"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

interface RawPlot {
  id: string
  name: string
  location: string | null
  variety: string
  capacity_sacas: string | number
  notes: string | null
  created_at: string
  updated_at: string
}

function parsePlot(raw: RawPlot): Plot {
  return {
    id: raw.id,
    name: raw.name,
    location: raw.location,
    variety: raw.variety,
    capacity_sacas: toNumber(raw.capacity_sacas),
    notes: raw.notes,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawActivity {
  id: string
  plot_id: string
  plot_name?: string
  activity_type: ActivityType
  activity_date: string
  labor_type: LaborType
  cost: string | number
  details: string | null
  created_at: string
  updated_at: string
}

function parseActivity(raw: RawActivity): PlotActivity {
  return {
    id: raw.id,
    plot_id: raw.plot_id,
    plot_name: raw.plot_name,
    activity_type: raw.activity_type,
    activity_date: raw.activity_date,
    labor_type: raw.labor_type,
    cost: toNumber(raw.cost),
    details: raw.details,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawProductionInput {
  id: string
  stock_item_id: string
  stock_item_name: string
  unit: string
  quantity: string | number
  unit_cost: string | number
  subtotal: string | number
}

function parseInput(raw: RawProductionInput): ProductionInput {
  return {
    id: raw.id,
    stock_item_id: raw.stock_item_id,
    stock_item_name: raw.stock_item_name,
    unit: raw.unit,
    quantity: toNumber(raw.quantity),
    unit_cost: toNumber(raw.unit_cost),
    subtotal: toNumber(raw.subtotal),
  }
}

interface RawProductionOrder {
  id: string
  plot_id: string
  plot_name: string
  status: ProductionOrderStatus
  planned_date: string | null
  executed_at: string | null
  total_sacas: string | number
  especial_sacas: string | number
  superior_sacas: string | number
  tradicional_sacas: string | number
  total_cost: string | number
  notes: string | null
  inputs: RawProductionInput[]
  created_at: string
  updated_at: string
}

function parseOrder(raw: RawProductionOrder): ProductionOrder {
  return {
    id: raw.id,
    plot_id: raw.plot_id,
    plot_name: raw.plot_name,
    status: raw.status,
    planned_date: raw.planned_date,
    executed_at: raw.executed_at,
    total_sacas: toNumber(raw.total_sacas),
    especial_sacas: toNumber(raw.especial_sacas),
    superior_sacas: toNumber(raw.superior_sacas),
    tradicional_sacas: toNumber(raw.tradicional_sacas),
    total_cost: toNumber(raw.total_cost),
    notes: raw.notes,
    inputs: (raw.inputs ?? []).map(parseInput),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawProductionResult {
  order_id: string
  total_sacas: string | number
  especial_sacas: string | number
  superior_sacas: string | number
  tradicional_sacas: string | number
  inputs_consumed: RawProductionInput[]
  items_below_minimum: string[]
  executed_at: string
}

function parseResult(raw: RawProductionResult): ProductionResult {
  return {
    order_id: raw.order_id,
    total_sacas: toNumber(raw.total_sacas),
    especial_sacas: toNumber(raw.especial_sacas),
    superior_sacas: toNumber(raw.superior_sacas),
    tradicional_sacas: toNumber(raw.tradicional_sacas),
    inputs_consumed: (raw.inputs_consumed ?? []).map(parseInput),
    items_below_minimum: raw.items_below_minimum ?? [],
    executed_at: raw.executed_at,
  }
}

// ── Talhões ───────────────────────────────────────────────────────────────────

export async function getTalhoes(): Promise<Plot[]> {
  const response = await apiFetch<ApiResponse<RawPlot[]>>("/api/pcp/talhoes")
  return response.data.map(parsePlot)
}

export async function createTalhao(data: {
  name: string
  location?: string
  variety: string
  capacity_sacas: number
  notes?: string
}): Promise<Plot> {
  const response = await apiFetch<ApiResponse<RawPlot>>("/api/pcp/talhoes", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parsePlot(response.data)
}

export async function updateTalhao(
  id: string,
  data: Partial<{
    name: string
    location: string
    variety: string
    capacity_sacas: number
    notes: string
  }>
): Promise<Plot> {
  const response = await apiFetch<ApiResponse<RawPlot>>(`/api/pcp/talhoes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
  return parsePlot(response.data)
}

export async function deleteTalhao(id: string): Promise<void> {
  await apiFetch(`/api/pcp/talhoes/${id}`, { method: "DELETE" })
}

// ── Atividades ────────────────────────────────────────────────────────────────

export async function getAtividades(plot_id?: string): Promise<PlotActivity[]> {
  const response = await apiFetch<ApiResponse<RawActivity[]>>("/api/pcp/atividades", {
    params: { plot_id },
  })
  return response.data.map(parseActivity)
}

export async function createAtividade(data: {
  plot_id: string
  activity_type: ActivityType
  activity_date: string
  labor_type: LaborType
  cost: number
  details?: string
}): Promise<PlotActivity> {
  const response = await apiFetch<ApiResponse<RawActivity>>("/api/pcp/atividades", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseActivity(response.data)
}

// ── Ordens de Produção ────────────────────────────────────────────────────────

export async function getOrdens(status?: string): Promise<ProductionOrder[]> {
  const response = await apiFetch<ApiResponse<RawProductionOrder[]>>("/api/pcp/ordens", {
    params: { status },
  })
  return response.data.map(parseOrder)
}

export async function createOrdem(data: {
  plot_id: string
  planned_date: string
  notes?: string
  inputs: { stock_item_id: string; quantity: number }[]
}): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<RawProductionOrder>>("/api/pcp/ordens", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseOrder(response.data)
}

export async function produzirSafra(id: string): Promise<ProductionResult> {
  const response = await apiFetch<ApiResponse<RawProductionResult>>(
    `/api/pcp/ordens/${id}/produzir`,
    { method: "POST" }
  )
  return parseResult(response.data)
}

export async function deleteOrdem(id: string): Promise<void> {
  await apiFetch(`/api/pcp/ordens/${id}`, { method: "DELETE" })
}
