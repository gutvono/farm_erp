import { apiFetch } from "@/lib/api"
import {
  ActivityResult,
  ActivityType,
  ApiResponse,
  ConsumoInsumoItem,
  CustoPrevistoVsRealizadoItem,
  HarvestInputConsumed,
  LaborType,
  OrdensResumo,
  PCPReport,
  Plot,
  PlotActivity,
  ProducaoPorTalhaoItem,
  ProductionHarvest,
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
  hours_spent: string | number | null
  employee_id: string | null
  employee_name: string | null
  quantity_applied: string | number | null
  quantity_unit: string | null
  result: ActivityResult | null
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
    hours_spent: raw.hours_spent != null ? toNumber(raw.hours_spent) : null,
    employee_id: raw.employee_id,
    employee_name: raw.employee_name,
    quantity_applied: raw.quantity_applied != null ? toNumber(raw.quantity_applied) : null,
    quantity_unit: raw.quantity_unit,
    result: raw.result,
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

interface RawHarvestInputConsumed {
  stock_item_id: string
  name: string
  quantity: string | number
  unit: string
}

interface RawProductionHarvest {
  id: string
  production_order_id: string
  harvest_number: number
  percentage_harvested: string | number
  sacks_total: string | number
  sacks_especial: string | number
  sacks_superior: string | number
  sacks_tradicional: string | number
  inputs_consumed: RawHarvestInputConsumed[]
  is_final: boolean
  harvested_at: string
}

function parseHarvest(raw: RawProductionHarvest): ProductionHarvest {
  return {
    id: raw.id,
    production_order_id: raw.production_order_id,
    harvest_number: raw.harvest_number,
    percentage_harvested: toNumber(raw.percentage_harvested),
    sacks_total: toNumber(raw.sacks_total),
    sacks_especial: toNumber(raw.sacks_especial),
    sacks_superior: toNumber(raw.sacks_superior),
    sacks_tradicional: toNumber(raw.sacks_tradicional),
    inputs_consumed: (raw.inputs_consumed ?? []).map(
      (i): HarvestInputConsumed => ({
        stock_item_id: i.stock_item_id,
        name: i.name,
        quantity: toNumber(i.quantity),
        unit: i.unit,
      })
    ),
    is_final: raw.is_final,
    harvested_at: raw.harvested_at,
  }
}

interface RawProductionOrderWorker {
  id: string
  employee_id: string
  employee_name: string
  salary_snapshot: string | number
  is_responsible: boolean
}

interface RawProductionOrderService {
  id: string
  supplier_id: string
  supplier_name: string
  description: string
  amount: string | number
  due_date: string
  accounts_payable_id: string | null
}

interface RawProductionOrder {
  id: string
  plot_id: string
  plot_name: string
  order_number: string
  status: ProductionOrderStatus
  planned_date: string | null
  start_date: string | null
  expected_end_date: string | null
  executed_at: string | null
  total_sacas: string | number
  especial_sacas: string | number
  superior_sacas: string | number
  tradicional_sacas: string | number
  total_cost: string | number
  estimated_cost: string | number
  realized_cost: string | number
  harvest_progress: string | number
  is_overdue: boolean
  notes: string | null
  inputs: RawProductionInput[]
  harvests: RawProductionHarvest[]
  workers: RawProductionOrderWorker[]
  services: RawProductionOrderService[]
  created_at: string
  updated_at: string
}

function parseOrder(raw: RawProductionOrder): ProductionOrder {
  return {
    id: raw.id,
    plot_id: raw.plot_id,
    plot_name: raw.plot_name,
    order_number: raw.order_number ?? "",
    status: raw.status,
    planned_date: raw.planned_date,
    start_date: raw.start_date,
    expected_end_date: raw.expected_end_date,
    executed_at: raw.executed_at,
    total_sacas: toNumber(raw.total_sacas),
    especial_sacas: toNumber(raw.especial_sacas),
    superior_sacas: toNumber(raw.superior_sacas),
    tradicional_sacas: toNumber(raw.tradicional_sacas),
    total_cost: toNumber(raw.total_cost),
    estimated_cost: toNumber(raw.estimated_cost),
    realized_cost: toNumber(raw.realized_cost),
    harvest_progress: toNumber(raw.harvest_progress),
    is_overdue: raw.is_overdue ?? false,
    notes: raw.notes,
    inputs: (raw.inputs ?? []).map(parseInput),
    harvests: (raw.harvests ?? []).map(parseHarvest),
    workers: (raw.workers ?? []).map((w) => ({
      id: w.id,
      employee_id: w.employee_id,
      employee_name: w.employee_name,
      salary_snapshot: toNumber(w.salary_snapshot),
      is_responsible: w.is_responsible,
    })),
    services: (raw.services ?? []).map((s) => ({
      id: s.id,
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      description: s.description,
      amount: toNumber(s.amount),
      due_date: s.due_date,
      accounts_payable_id: s.accounts_payable_id,
    })),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

interface RawProductionResult {
  order_id: string
  harvest: RawProductionHarvest
  order: RawProductionOrder
  items_below_minimum: string[]
}

function parseResult(raw: RawProductionResult): ProductionResult {
  return {
    order_id: raw.order_id,
    harvest: parseHarvest(raw.harvest),
    order: parseOrder(raw.order),
    items_below_minimum: raw.items_below_minimum ?? [],
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
  hours_spent?: number
  employee_id?: string
  quantity_applied?: number
  quantity_unit?: string
  result?: ActivityResult
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
  planned_date?: string
  start_date?: string
  expected_end_date?: string
  notes?: string
  inputs: { stock_item_id: string; quantity: number }[]
  workers?: { employee_id: string; is_responsible: boolean }[]
  services?: { supplier_id: string; description: string; amount: number; due_date: string }[]
}): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<RawProductionOrder>>("/api/pcp/ordens", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseOrder(response.data)
}

export async function getFuncionariosEmProducao(): Promise<string[]> {
  const response = await apiFetch<ApiResponse<string[]>>(
    "/api/pcp/ordens/funcionarios-em-producao"
  )
  return response.data
}

export async function registrarColheita(
  id: string,
  percentage_harvested: number
): Promise<ProductionResult> {
  const response = await apiFetch<ApiResponse<RawProductionResult>>(
    `/api/pcp/ordens/${id}/colher`,
    {
      method: "POST",
      body: JSON.stringify({ percentage_harvested }),
    }
  )
  return parseResult(response.data)
}

export async function produzirSafra(id: string): Promise<ProductionResult> {
  const response = await apiFetch<ApiResponse<RawProductionResult>>(
    `/api/pcp/ordens/${id}/produzir`,
    { method: "POST" }
  )
  return parseResult(response.data)
}

export async function iniciarProducao(id: string): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<RawProductionOrder>>(
    `/api/pcp/ordens/${id}/iniciar`,
    { method: "POST" }
  )
  return parseOrder(response.data)
}

export async function deleteOrdem(id: string): Promise<void> {
  await apiFetch(`/api/pcp/ordens/${id}`, { method: "DELETE" })
}

// ── Relatórios ────────────────────────────────────────────────────────────────

export async function getRelatorios(): Promise<PCPReport> {
  const response = await apiFetch<ApiResponse<{
    producao_por_talhao: Array<{
      plot_id: string
      plot_name: string
      total_sacas: string | number
      especial_sacas: string | number
      superior_sacas: string | number
      tradicional_sacas: string | number
      total_orders: number
    }>
    consumo_insumos: Array<{
      stock_item_id: string
      stock_item_name: string
      total_quantity: string | number
      total_subtotal: string | number
      unit: string
    }>
    ordens_resumo: {
      planejada: number
      em_producao: number
      em_execucao: number
      pausada: number
      concluida: number
      cancelada: number
      atrasadas: number
    }
    custo_previsto_vs_realizado: Array<{
      order_id: string
      order_number: string
      plot_name: string
      status: ProductionOrderStatus
      estimated_cost: string | number
      realized_cost: string | number
      diferenca: string | number
    }>
  }>>("/api/pcp/relatorios")

  const d = response.data

  const producao_por_talhao: ProducaoPorTalhaoItem[] = d.producao_por_talhao.map((r) => ({
    plot_id: r.plot_id,
    plot_name: r.plot_name,
    total_sacas: toNumber(r.total_sacas),
    especial_sacas: toNumber(r.especial_sacas),
    superior_sacas: toNumber(r.superior_sacas),
    tradicional_sacas: toNumber(r.tradicional_sacas),
    total_orders: r.total_orders,
  }))

  const consumo_insumos: ConsumoInsumoItem[] = d.consumo_insumos.map((r) => ({
    stock_item_id: r.stock_item_id,
    stock_item_name: r.stock_item_name,
    total_quantity: toNumber(r.total_quantity),
    total_subtotal: toNumber(r.total_subtotal),
    unit: r.unit,
  }))

  const ordens_resumo: OrdensResumo = {
    planejada: d.ordens_resumo.planejada ?? 0,
    em_producao: d.ordens_resumo.em_producao ?? 0,
    em_execucao: d.ordens_resumo.em_execucao ?? 0,
    pausada: d.ordens_resumo.pausada ?? 0,
    concluida: d.ordens_resumo.concluida ?? 0,
    cancelada: d.ordens_resumo.cancelada ?? 0,
    atrasadas: d.ordens_resumo.atrasadas ?? 0,
  }

  const custo_previsto_vs_realizado: CustoPrevistoVsRealizadoItem[] =
    d.custo_previsto_vs_realizado.map((r) => ({
      order_id: r.order_id,
      order_number: r.order_number,
      plot_name: r.plot_name,
      status: r.status,
      estimated_cost: toNumber(r.estimated_cost),
      realized_cost: toNumber(r.realized_cost),
      diferenca: toNumber(r.diferenca),
    }))

  return { producao_por_talhao, consumo_insumos, ordens_resumo, custo_previsto_vs_realizado }
}
