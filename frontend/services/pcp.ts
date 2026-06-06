import { apiFetch } from "@/lib/api"
import {
  ActivityResult,
  ActivityType,
  ApiResponse,
  CargoDisponivel,
  ConsumoInsumoItem,
  ContractType,
  CustoDiscriminado,
  CustoPrevistoVsRealizadoItem,
  HarvestInputConsumed,
  ResourceAvailable,
  LaborType,
  OrdensResumo,
  PCPReport,
  Plot,
  PlotActivity,
  PositionRequirement,
  ProducaoPorTalhaoItem,
  ProductionHarvest,
  ProductionInput,
  ProductionOrder,
  ProductionOrderStatus,
  ProductionResource,
  ProductionResult,
  StockItem,
  StockUnit,
  SystemRole,
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

// ── Stock items (insumos / recursos disponíveis) ───────────────────────────────

interface RawStockItem {
  id: string
  sku: string
  name: string
  category_id: string
  category_name: string
  unit: StockUnit
  minimum_stock: string | number
  unit_cost: string | number
  hourly_cost: string | number | null
  quantity_on_hand: string | number
  description: string | null
  is_below_minimum: boolean
  created_at: string
  updated_at: string
}

function parseStockItem(raw: RawStockItem): StockItem {
  return {
    id: raw.id,
    sku: raw.sku,
    name: raw.name,
    category_id: raw.category_id,
    category_name: raw.category_name,
    unit: raw.unit,
    quantity_on_hand: toNumber(raw.quantity_on_hand),
    minimum_stock: toNumber(raw.minimum_stock),
    unit_cost: toNumber(raw.unit_cost),
    hourly_cost: raw.hourly_cost != null ? toNumber(raw.hourly_cost) : null,
    description: raw.description,
    is_below_minimum: raw.is_below_minimum,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

// ── Plots ─────────────────────────────────────────────────────────────────────

interface RawPlot {
  id: string
  name: string
  location: string | null
  variety: string
  capacity_sacas: string | number
  total_hectares: string | number
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
    total_hectares: toNumber(raw.total_hectares),
    notes: raw.notes,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

// ── Activities ────────────────────────────────────────────────────────────────

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
    quantity_applied:
      raw.quantity_applied != null ? toNumber(raw.quantity_applied) : null,
    quantity_unit: raw.quantity_unit,
    result: raw.result,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

// ── Production sub-objects ─────────────────────────────────────────────────────

interface RawProductionInput {
  id: string
  stock_item_id: string
  stock_item_name: string
  sku: string
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
    sku: raw.sku,
    unit: raw.unit,
    quantity: toNumber(raw.quantity),
    unit_cost: toNumber(raw.unit_cost),
    subtotal: toNumber(raw.subtotal),
  }
}

interface RawPositionRequirement {
  id: string
  position_id: string
  position_name: string
  quantity: number
  contract_type: ContractType
  base_salary: string | number
}

function parsePositionRequirement(
  raw: RawPositionRequirement
): PositionRequirement {
  return {
    id: raw.id,
    position_id: raw.position_id,
    position_name: raw.position_name,
    quantity: raw.quantity,
    contract_type: raw.contract_type,
    base_salary: toNumber(raw.base_salary),
  }
}

interface RawProductionResource {
  id: string
  stock_item_id: string
  stock_item_name: string
  sku: string
  unit: string
  resource_role: SystemRole
  quantity: string | number | null
  accumulated_hours: string | number
  hourly_cost: string | number | null
  cost: string | number
}

function parseResource(raw: RawProductionResource): ProductionResource {
  return {
    id: raw.id,
    stock_item_id: raw.stock_item_id,
    stock_item_name: raw.stock_item_name,
    sku: raw.sku,
    unit: raw.unit,
    resource_role: raw.resource_role,
    quantity: toNumberOrNull(raw.quantity),
    accumulated_hours: toNumber(raw.accumulated_hours),
    hourly_cost: raw.hourly_cost != null ? toNumber(raw.hourly_cost) : null,
    cost: toNumber(raw.cost),
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
  hectares_harvested: string | number | null
  sacks_total: string | number
  sacks_industria: string | number
  sacks_embalagem: string | number
  sacks_descarte: string | number
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
    hectares_harvested: toNumberOrNull(raw.hectares_harvested),
    sacks_total: toNumber(raw.sacks_total),
    sacks_industria: toNumber(raw.sacks_industria),
    sacks_embalagem: toNumber(raw.sacks_embalagem),
    sacks_descarte: toNumber(raw.sacks_descarte),
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
  order_number: string | null
  status: ProductionOrderStatus
  hectares_used: string | number
  planned_date: string | null
  start_date: string | null
  expected_end_date: string | null
  executed_at: string | null
  total_sacas: string | number
  industria_sacas: string | number
  embalagem_sacas: string | number
  descarte_sacas: string | number
  total_cost: string | number
  estimated_cost: string | number
  realized_cost: string | number
  harvest_progress: string | number
  is_overdue: boolean
  early_closed_reason: string | null
  notes: string | null
  inputs: RawProductionInput[]
  harvests: RawProductionHarvest[]
  position_requirements: RawPositionRequirement[]
  resources: RawProductionResource[]
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
    hectares_used: toNumber(raw.hectares_used),
    planned_date: raw.planned_date,
    start_date: raw.start_date,
    expected_end_date: raw.expected_end_date,
    executed_at: raw.executed_at,
    total_sacas: toNumber(raw.total_sacas),
    industria_sacas: toNumber(raw.industria_sacas),
    embalagem_sacas: toNumber(raw.embalagem_sacas),
    descarte_sacas: toNumber(raw.descarte_sacas),
    total_cost: toNumber(raw.total_cost),
    estimated_cost: toNumber(raw.estimated_cost),
    realized_cost: toNumber(raw.realized_cost),
    harvest_progress: toNumber(raw.harvest_progress),
    is_overdue: raw.is_overdue ?? false,
    early_closed_reason: raw.early_closed_reason,
    notes: raw.notes,
    inputs: (raw.inputs ?? []).map(parseInput),
    harvests: (raw.harvests ?? []).map(parseHarvest),
    position_requirements: (raw.position_requirements ?? []).map(
      parsePositionRequirement
    ),
    resources: (raw.resources ?? []).map(parseResource),
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
  total_hectares: number
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
    total_hectares: number
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

// ── Insumos / Recursos disponíveis (selects do form) ───────────────────────────

/** Itens de papel `insumo` disponíveis para a OP. */
export async function getInsumosDisponiveis(): Promise<StockItem[]> {
  const response = await apiFetch<ApiResponse<RawStockItem[]>>(
    "/api/pcp/insumos-disponiveis"
  )
  return response.data.map(parseStockItem)
}

interface RawResourceAvailable extends RawStockItem {
  available_quantity: string | number
}

/**
 * Itens de um papel de recurso (`maquina`/`veiculo`/`embalagem`) com o disponível
 * (Demanda 5.1). **Nada é ocultado** — planejar é livre; o disponível é só
 * informativo (máquina/veículo: saldo − usado em OPs iniciadas; embalagem: saldo).
 */
export async function getRecursosDisponiveis(
  role: Extract<SystemRole, "maquina" | "veiculo" | "embalagem">
): Promise<ResourceAvailable[]> {
  const response = await apiFetch<ApiResponse<RawResourceAvailable[]>>(
    "/api/pcp/recursos-disponiveis",
    { params: { role } }
  )
  return response.data.map((raw) => ({
    ...parseStockItem(raw),
    available_quantity: toNumber(raw.available_quantity),
  }))
}

interface RawCargoDisponivel {
  position_id: string
  position_name: string
  base_salary: string | number
  total_headcount: number
  used: string | number
  available_quantity: string | number
}

/**
 * Cargos com headcount total e disponível (Demanda 5.1) para o requisito por
 * cargo da OP. `available_quantity = funcionários ativos do cargo − usados em
 * OPs iniciadas`. Pode-se planejar acima do disponível (validado ao iniciar).
 */
export async function getCargosDisponiveis(): Promise<CargoDisponivel[]> {
  const response = await apiFetch<ApiResponse<RawCargoDisponivel[]>>(
    "/api/pcp/cargos-disponiveis"
  )
  return response.data.map((raw) => ({
    position_id: raw.position_id,
    position_name: raw.position_name,
    base_salary: toNumber(raw.base_salary),
    total_headcount: raw.total_headcount,
    used: toNumber(raw.used),
    available_quantity: toNumber(raw.available_quantity),
  }))
}

// ── Ordens de Produção ────────────────────────────────────────────────────────

export interface CreateOrdemPayload {
  plot_id: string
  hectares_used: number
  planned_date?: string
  start_date?: string
  expected_end_date?: string
  notes?: string
  inputs: { stock_item_id: string; quantity: number }[]
  position_requirements: {
    position_id: string
    quantity: number
    contract_type: ContractType
  }[]
  resources: {
    stock_item_id: string
    resource_role: SystemRole
    quantity?: number
    hours?: number
  }[]
  services: {
    supplier_id: string
    description: string
    amount: number
    due_date: string
  }[]
}

export async function getOrdens(status?: string): Promise<ProductionOrder[]> {
  const response = await apiFetch<ApiResponse<RawProductionOrder[]>>("/api/pcp/ordens", {
    params: { status },
  })
  return response.data.map(parseOrder)
}

export async function createOrdem(
  data: CreateOrdemPayload
): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<RawProductionOrder>>("/api/pcp/ordens", {
    method: "POST",
    body: JSON.stringify(data),
  })
  return parseOrder(response.data)
}

export async function iniciarProducao(id: string): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<RawProductionOrder>>(
    `/api/pcp/ordens/${id}/iniciar`,
    { method: "POST" }
  )
  return parseOrder(response.data)
}

export interface ColheitaPayload {
  percentage_harvested: number
  sacks_industria: number
  sacks_embalagem: number
  sacks_descarte: number
  resource_hours?: { resource_id: string; hours: number }[]
}

export async function registrarColheita(
  id: string,
  data: ColheitaPayload
): Promise<ProductionResult> {
  const response = await apiFetch<ApiResponse<RawProductionResult>>(
    `/api/pcp/ordens/${id}/colher`,
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseResult(response.data)
}

export async function encerrarOrdem(
  id: string,
  reason: string
): Promise<ProductionOrder> {
  const response = await apiFetch<ApiResponse<RawProductionOrder>>(
    `/api/pcp/ordens/${id}/encerrar`,
    { method: "POST", body: JSON.stringify({ reason }) }
  )
  return parseOrder(response.data)
}

export async function deleteOrdem(id: string): Promise<void> {
  await apiFetch(`/api/pcp/ordens/${id}`, { method: "DELETE" })
}

// ── Relatórios ────────────────────────────────────────────────────────────────

interface RawCustoDiscriminado {
  insumos: string | number
  pessoal: string | number
  maquinas: string | number
  embalagens: string | number
  servicos: string | number
  total: string | number
}

function parseDiscriminado(raw: RawCustoDiscriminado): CustoDiscriminado {
  return {
    insumos: toNumber(raw.insumos),
    pessoal: toNumber(raw.pessoal),
    maquinas: toNumber(raw.maquinas),
    embalagens: toNumber(raw.embalagens),
    servicos: toNumber(raw.servicos),
    total: toNumber(raw.total),
  }
}

export async function getRelatorios(): Promise<PCPReport> {
  const response = await apiFetch<
    ApiResponse<{
      producao_por_talhao: Array<{
        plot_id: string
        plot_name: string
        total_sacas: string | number
        industria_sacas: string | number
        embalagem_sacas: string | number
        descarte_sacas: string | number
        orders_count: number
      }>
      consumo_insumos: Array<{
        stock_item_id: string
        stock_item_name: string
        total_quantity: string | number
        total_cost: string | number
        unit: string
      }>
      ordens_resumo: OrdensResumo
      custo_previsto_vs_realizado: Array<{
        order_id: string
        order_number: string | null
        plot_name: string
        status: ProductionOrderStatus
        estimated_cost: string | number
        realized_cost: string | number
        diferenca: string | number
        custo_realizado_discriminado: RawCustoDiscriminado
      }>
      custo_safra_discriminado: RawCustoDiscriminado
      generated_at: string
    }>
  >("/api/pcp/relatorios")

  const d = response.data

  const producao_por_talhao: ProducaoPorTalhaoItem[] = d.producao_por_talhao.map(
    (r) => ({
      plot_id: r.plot_id,
      plot_name: r.plot_name,
      total_sacas: toNumber(r.total_sacas),
      industria_sacas: toNumber(r.industria_sacas),
      embalagem_sacas: toNumber(r.embalagem_sacas),
      descarte_sacas: toNumber(r.descarte_sacas),
      orders_count: r.orders_count,
    })
  )

  const consumo_insumos: ConsumoInsumoItem[] = d.consumo_insumos.map((r) => ({
    stock_item_id: r.stock_item_id,
    stock_item_name: r.stock_item_name,
    total_quantity: toNumber(r.total_quantity),
    total_cost: toNumber(r.total_cost),
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
      order_number: r.order_number ?? "",
      plot_name: r.plot_name,
      status: r.status,
      estimated_cost: toNumber(r.estimated_cost),
      realized_cost: toNumber(r.realized_cost),
      diferenca: toNumber(r.diferenca),
      custo_realizado_discriminado: parseDiscriminado(
        r.custo_realizado_discriminado
      ),
    }))

  return {
    producao_por_talhao,
    consumo_insumos,
    ordens_resumo,
    custo_previsto_vs_realizado,
    custo_safra_discriminado: parseDiscriminado(d.custo_safra_discriminado),
    generated_at: d.generated_at,
  }
}
