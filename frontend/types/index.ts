export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}

/**
 * Envelope genérico de resposta paginada do backend (Demanda 0 — infra de
 * paginação). Espelha exatamente o `Page[T]` retornado pela API:
 * `{ items, total, page, page_size, pages }`. Reutilizado por todos os
 * endpoints paginados via `fetchPaginated` (ver `lib/pagination.ts`).
 */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  module: string | null
  created_at: string
}

export interface User {
  id: string
  username: string
  is_active: boolean
  created_at: string
}

export interface DashboardKPIs {
  balance: number
  monthly_revenue: number
  monthly_expenses: number
  pending_payables: number
  pending_receivables: number
  low_stock_items: number
  open_production_orders: number
  defaulter_clients: number
}

export interface CashFlowPoint {
  month: string
  income: number
  expenses: number
}

export interface DashboardData {
  kpis: DashboardKPIs
  cash_flow: CashFlowPoint[]
}

export type PaymentMethod = "a_vista" | "parcelado" | "pix" | "boleto"

export interface PixPaymentInfo {
  pix_key: string
  pix_code: string
  amount: number
  description: string
}

export interface BoletoPaymentInfo {
  boleto_number: string
  barcode: string
  due_date: string
  amount: number
  beneficiary: string
  payer: string
}

export type MovementType = "entrada" | "saida"

export interface FinancialMovement {
  id: string
  movement_type: MovementType
  category: string
  amount: number
  description: string
  source_module: string | null
  reference_id: string | null
  occurred_at: string
  created_at: string
}

export type PayableStatus = "em_aberto" | "paga" | "cancelada"

export interface AccountsPayable {
  id: string
  number: string
  description: string
  amount: number
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

export type ReceivableStatus =
  | "em_aberto"
  | "quitado"
  | "parcialmente_pago"
  | "cancelada"

export interface AccountsReceivable {
  id: string
  number: string
  description: string
  amount: number
  amount_received: number
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
  created_at: string
  updated_at: string
}

export interface Balance {
  total_entradas: number
  total_saidas: number
  saldo: number
}

export interface CashFlowItem {
  period: string
  entradas: number
  saidas: number
  saldo: number
}

export interface CashFlowResult {
  items: CashFlowItem[]
  total_entradas: number
  total_saidas: number
  saldo: number
}

export interface DefaulterItem {
  client_id: string
  client_name: string
  receivable_id: string
  receivable_number: string
  amount: number
  amount_received: number
  due_date: string
}

export type StockUnit = "saca" | "litro" | "kg" | "unidade"
export type StockMovementType = "entrada" | "saida"

export interface StockItem {
  id: string
  sku: string
  name: string
  category_id: string
  category_name: string
  unit: StockUnit
  quantity_on_hand: number
  minimum_stock: number
  unit_cost: number
  hourly_cost: number | null
  description: string | null
  is_below_minimum: boolean
  created_at: string
  updated_at: string
}

export interface StockMovement {
  id: string
  stock_item_id: string
  stock_item_name: string
  movement_type: StockMovementType
  quantity: number
  unit_cost: number
  total_value: number
  description: string
  source_module: string
  reference_id: string | null
  occurred_at: string
  created_at: string
}

export interface InventoryItemOut {
  id: string
  sku: string
  name: string
  category_id: string
  category_name: string
  unit: StockUnit
  quantity_on_hand: number
  unit_cost: number
  total_value: number
  is_below_minimum: boolean
}

export interface Inventory {
  items: InventoryItemOut[]
  total_value: number
  generated_at: string
}

// ── CONFIGURAÇÕES ─────────────────────────────────────────────────────────────

/** Vocabulário fixo de papéis de sistema (enum Postgres `system_role`). */
export type SystemRole =
  | "maquina"
  | "veiculo"
  | "embalagem"
  | "insumo"
  | "produto_final"
  | "produto_inacabado"
  | "produto_descartado"
  | "produto_vendavel"

export interface Category {
  id: string
  name: string
  description: string | null
  is_active: boolean
  roles: SystemRole[]
}

export interface HarvestDestinations {
  industria_item_id: string | null
  embalagem_item_id: string | null
  descarte_item_id: string | null
}

// ── COMPRAS ──────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  /** Endereço legado (texto livre) — mantido por compatibilidade. */
  address: string | null
  /** Endereço estruturado (Demanda 6). */
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

/**
 * Item do catálogo de um fornecedor (Demanda 6): o item de estoque que ele
 * vende, com o preço de referência e o flag de ativo.
 */
export interface SupplierItem {
  id: string
  supplier_id: string
  stock_item_id: string
  stock_item_name: string
  stock_item_sku: string
  unit_price: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Fornecedor que vende um item de estoque, com o preço sugerido do catálogo
 * (fluxo produto→fornecedor na ordem de compra).
 */
export interface SupplierForStockItem {
  supplier_id: string
  supplier_name: string
  unit_price: number
}

export interface PurchaseOrderItem {
  id: string
  stock_item_id: string
  stock_item_name: string
  quantity: number
  unit_price: number
  subtotal: number
  description: string | null
}

export type PurchaseOrderStatus =
  | "em_andamento"
  | "aguardando_aprovacao_financeiro"
  | "aprovada"
  | "em_conferencia"
  | "aguardando_pagamento"
  | "concluida"
  | "cancelada"

export interface PurchaseOrder {
  id: string
  supplier_id: string
  supplier_name: string
  status: PurchaseOrderStatus
  order_type: "produto" | "servico"
  service_description: string | null
  total_amount: number
  receipt_total_amount: number
  financial_approval_note: string | null
  notes: string | null
  ordered_at: string
  received_at: string | null
  installments: number
  first_due_date: string | null
  installment_interval_days: number
  payment_method: PaymentMethod | null
  items: PurchaseOrderItem[]
  created_at: string
  updated_at: string
}

export interface PurchaseOrderReceiptItem {
  id: string
  purchase_order_id: string
  purchase_order_item_id: string
  stock_item_id: string
  stock_item_name: string
  quantity_ordered: number
  quantity_accepted: number
  quantity_rejected: number
  unit_price: number
  rejection_reason: string | null
  status: "pendente" | "conferido"
  created_at: string
  updated_at: string
}

export interface PurchaseOrderWithReceipts extends PurchaseOrder {
  receipts: PurchaseOrderReceiptItem[]
}

export type QuotationStatus =
  | "em_andamento"
  | "aguardando_aprovacao_financeiro"
  | "aprovado_financeiro"
  | "concluida"
  | "cancelada"

export interface QuotationProposalItem {
  id: string
  proposal_id: string
  quotation_item_id: string
  unit_price: number
}

export interface QuotationProposal {
  id: string
  quotation_id: string
  supplier_id: string
  supplier_name: string
  total_price: number | null
  notes: string | null
  proposal_items: QuotationProposalItem[]
}

export interface QuotationItem {
  id: string
  stock_item_id: string
  stock_item_name: string
  quantity: number
}

export interface Quotation {
  id: string
  order_type: "produto" | "servico"
  status: QuotationStatus
  service_description: string | null
  notes: string | null
  cancellation_note: string | null
  winning_proposal_id: string | null
  purchase_order_id: string | null
  items: QuotationItem[]
  proposals: QuotationProposal[]
  created_at: string
  updated_at: string
}

// ── COMERCIAL ─────────────────────────────────────────────────────────────────

export interface Client {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  is_delinquent: boolean
  created_at: string
  updated_at: string
}

export interface SaleItem {
  id: string
  stock_item_id: string
  stock_item_name: string
  quantity: number
  unit_price: number
  subtotal: number
  description: string | null
}

export type SaleStatus = "realizada" | "entregue" | "cancelada"

export interface Sale {
  id: string
  client_id: string
  client_name: string
  status: SaleStatus
  total_amount: number
  notes: string | null
  sold_at: string
  delivered_at: string | null
  installments: number
  first_due_date: string | null
  installment_interval_days: number
  payment_method: PaymentMethod | null
  items: SaleItem[]
  created_at: string
  updated_at: string
}

// ── FATURAMENTO ───────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  subtotal: number
}

export type InvoiceStatus = "emitida" | "paga" | "cancelada"

export interface Invoice {
  id: string
  number: string
  sale_id: string | null
  client_id: string | null
  client_name: string
  status: InvoiceStatus
  total_amount: number
  issue_date: string
  due_date: string | null
  notes: string | null
  invoice_type: string
  installment_number: number | null
  installment_total: number | null
  parent_invoice_id: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  items: InvoiceItem[]
  created_at: string
  updated_at: string
}

// ── PCP ───────────────────────────────────────────────────────────────────────

export interface Plot {
  id: string
  name: string
  location: string | null
  variety: string
  capacity_sacas: number
  /** Área total do talhão em hectares (> 0). Base do controle de área das OPs. */
  total_hectares: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type ActivityType = "plantio" | "adubacao" | "poda" | "colheita" | "irrigacao" | "outra"
export type LaborType = "interna" | "externa"
export type ActivityResult = "concluida" | "parcial" | "reagendada"

export interface PlotActivity {
  id: string
  plot_id: string
  plot_name?: string
  activity_type: ActivityType
  activity_date: string
  labor_type: LaborType
  cost: number
  details: string | null
  hours_spent: number | null
  employee_id: string | null
  employee_name: string | null
  quantity_applied: number | null
  quantity_unit: string | null
  result: ActivityResult | null
  created_at: string
  updated_at: string
}

export interface ProductionInput {
  id: string
  stock_item_id: string
  stock_item_name: string
  sku: string
  unit: string
  quantity: number
  unit_cost: number
  subtotal: number
}

export type ProductionOrderStatus =
  | "planejada"
  | "em_producao"
  | "em_execucao"
  | "pausada"
  | "concluida"
  | "cancelada"

/** Requisito de mão de obra por cargo (sem seleção nominal de funcionário). */
export interface PositionRequirement {
  id: string
  position_id: string
  position_name: string
  quantity: number
  contract_type: ContractType
  base_salary: number
}

/**
 * Item de recurso disponível para a OP (Demanda 5.1). Estende `StockItem` com o
 * disponível derivado (`available_quantity = saldo − Σ usado em OPs INICIADAS`).
 * Planejar é livre: o item nunca some; o disponível é só informativo.
 */
export interface ResourceAvailable extends StockItem {
  available_quantity: number
}

/** Cargo com headcount total e disponível (Demanda 5.1) para o select da OP. */
export interface CargoDisponivel {
  position_id: string
  position_name: string
  base_salary: number
  total_headcount: number
  used: number
  available_quantity: number
}

/** Recurso alocado à OP: máquina/veículo (reserva exclusiva) ou embalagem (consumo). */
export interface ProductionResource {
  id: string
  stock_item_id: string
  stock_item_name: string
  sku: string
  unit: string
  resource_role: SystemRole
  /** Quantidade — usada para embalagens (consumo); nula para máquina/veículo. */
  quantity: number | null
  /** Horas acumuladas (incremental) para máquina/veículo. */
  accumulated_hours: number
  hourly_cost: number | null
  /** Custo do recurso = accumulated_hours × hourly_cost (0 para embalagem). */
  cost: number
}

export interface HarvestInputConsumed {
  stock_item_id: string
  name: string
  quantity: number
  unit: string
}

export interface ProductionHarvest {
  id: string
  production_order_id: string
  harvest_number: number
  percentage_harvested: number
  /** Hectares colhidos = (percentual/100) × hectares da OP. */
  hectares_harvested: number | null
  sacks_total: number
  sacks_industria: number
  sacks_embalagem: number
  sacks_descarte: number
  inputs_consumed: HarvestInputConsumed[]
  is_final: boolean
  harvested_at: string
}

export interface ProductionOrderService {
  id: string
  supplier_id: string
  supplier_name: string
  description: string
  amount: number
  due_date: string
  accounts_payable_id: string | null
}

export interface ProductionOrder {
  id: string
  plot_id: string
  plot_name: string
  order_number: string
  status: ProductionOrderStatus
  hectares_used: number
  planned_date: string | null
  start_date: string | null
  expected_end_date: string | null
  executed_at: string | null
  total_sacas: number
  industria_sacas: number
  embalagem_sacas: number
  descarte_sacas: number
  total_cost: number
  estimated_cost: number
  realized_cost: number
  harvest_progress: number
  is_overdue: boolean
  early_closed_reason: string | null
  notes: string | null
  inputs: ProductionInput[]
  harvests: ProductionHarvest[]
  position_requirements: PositionRequirement[]
  resources: ProductionResource[]
  services: ProductionOrderService[]
  created_at: string
  updated_at: string
}

export interface ProductionResult {
  order_id: string
  harvest: ProductionHarvest
  order: ProductionOrder
  items_below_minimum: string[]
}

// ── PCP Reports ───────────────────────────────────────────────────────────────

/** Custo da OP/safra quebrado por tipo (decisão travada da Demanda 5). */
export interface CustoDiscriminado {
  insumos: number
  pessoal: number
  maquinas: number
  embalagens: number
  servicos: number
  total: number
}

export interface ProducaoPorTalhaoItem {
  plot_id: string
  plot_name: string
  total_sacas: number
  industria_sacas: number
  embalagem_sacas: number
  descarte_sacas: number
  orders_count: number
}

export interface ConsumoInsumoItem {
  stock_item_id: string
  stock_item_name: string
  total_quantity: number
  total_cost: number
  unit: string
}

export interface OrdensResumo {
  planejada: number
  em_producao: number
  em_execucao: number
  pausada: number
  concluida: number
  cancelada: number
  atrasadas: number
}

export interface CustoPrevistoVsRealizadoItem {
  order_id: string
  order_number: string
  plot_name: string
  status: ProductionOrderStatus
  estimated_cost: number
  realized_cost: number
  diferenca: number
  custo_realizado_discriminado: CustoDiscriminado
}

export interface PCPReport {
  producao_por_talhao: ProducaoPorTalhaoItem[]
  consumo_insumos: ConsumoInsumoItem[]
  ordens_resumo: OrdensResumo
  custo_previsto_vs_realizado: CustoPrevistoVsRealizadoItem[]
  custo_safra_discriminado: CustoDiscriminado
  generated_at: string
}

// ── FOLHA DE PAGAMENTO ────────────────────────────────────────────────────────

export type ContractType = "clt" | "pj" | "temporario"
export type PayrollEntryStatus = "pendente" | "aguardando_aprovacao" | "pago"
export type PayrollPeriodStatus = "aberta" | "fechada"
export type PayrollEventType = "provento" | "desconto" | "informativo"
export type PayrollCalculationType =
  | "manual"
  | "overtime"
  | "night_shift"
  | "inss"
  | "fgts"
  | "transport_voucher"
export type PayrollItemSource = "manual" | "automatic"

export interface JobPosition {
  id: string
  name: string
  description: string | null
  base_salary: number
  is_active: boolean
}

export interface Employee {
  id: string
  name: string
  cpf: string
  position_id: string
  position_name: string
  base_salary: number
  contract_type: ContractType
  admission_date: string
  photo_path: string | null
  photo_url: string | null
  is_active: boolean
  termination_cost_override: number | null
  created_at: string
}

export interface PayrollEntry {
  id: string
  payroll_period_id: string
  employee_id: string
  employee_name: string
  contract_type: ContractType
  base_salary: number
  overtime_amount: number
  deductions: number
  total_amount: number
  status: PayrollEntryStatus
  paid_at: string | null
  gross_amount: number
  total_earnings: number
  total_deductions: number
  total_informative: number
  items: PayrollEntryItem[]
}

export interface PayrollPeriod {
  id: string
  reference_month: number
  reference_year: number
  status: PayrollPeriodStatus
  total_amount: number
  entries: PayrollEntry[]
  created_at: string
}

export interface PayrollEvent {
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

export interface PayrollEntryItem {
  id: string
  payroll_entry_id: string
  payroll_event_id: string
  event_description: string
  event_type: PayrollEventType
  calculation_type: PayrollCalculationType
  amount: number
  calculation_base: number | null
  quantity: number | null
  percentage: number | null
  metadata: Record<string, unknown>
  source: PayrollItemSource
  affects_net: boolean
  created_at: string
  updated_at: string
}

export interface PayrollCalculationRequest {
  calculation_type: PayrollCalculationType
  event_id?: string
  base_amount?: number
  quantity?: number
  percentage?: number
  start_time?: string
  end_time?: string
  rule?: "urbana" | "rural"
  real_transport_cost?: number
}

export interface PayrollCalculationPreview {
  event_id: string
  event_description: string
  event_type: PayrollEventType
  calculation_type: PayrollCalculationType
  amount: number
  calculation_base: number
  quantity: number | null
  percentage: number | null
  metadata: Record<string, unknown>
  affects_net: boolean
}

// ── Aprovação de pagamento de folha (Demanda 4) ───────────────────────────────

export type PayrollPaymentRequestType = "individual" | "lote"

export type PayrollPaymentRequestStatus =
  | "aguardando_aprovacao_financeiro"
  | "aprovada"
  | "recusada"

/** Holerite incluído numa solicitação de pagamento de folha. */
export interface PayrollPaymentRequestEntry {
  entry_id: string
  employee_id: string
  employee_name: string
  net_amount: number
}

/**
 * Solicitação de pagamento de folha que aguarda aprovação do Financeiro.
 * Criada na Folha ("Solicitar pagamento"); aprovada/recusada no Financeiro.
 */
export interface PayrollPaymentRequest {
  id: string
  payroll_period_id: string
  competency: string
  request_type: PayrollPaymentRequestType
  status: PayrollPaymentRequestStatus
  total_amount: number
  approval_note: string | null
  requested_at: string
  decided_at: string | null
  entries: PayrollPaymentRequestEntry[]
  created_at: string
  updated_at: string
}
