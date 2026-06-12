import { apiFetch } from "@/lib/api"
import { ApiResponse, DashboardData } from "@/types/index"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await apiFetch<ApiResponse<DashboardData>>("/api/dashboard/")
  const data = response.data
  // Headline de vendas do mês (Demanda 10): garante number mesmo se vier string.
  return {
    ...data,
    kpis: {
      ...data.kpis,
      sales_revenue_month: toNumber(data.kpis.sales_revenue_month),
      sales_count_month: toNumber(data.kpis.sales_count_month),
      sales_ticket_month: toNumber(data.kpis.sales_ticket_month),
    },
  }
}
