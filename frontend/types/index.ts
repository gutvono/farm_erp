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

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  reference_module: string | null
  reference_id: string | null
  created_at: string
  read_at: string | null
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
