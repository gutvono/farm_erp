import { apiFetch } from "@/lib/api"
import { ApiResponse, DashboardData } from "@/types/index"

export async function getDashboard(): Promise<DashboardData> {
  const response = await apiFetch<ApiResponse<DashboardData>>("/api/dashboard/")
  return response.data
}
