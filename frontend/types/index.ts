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
