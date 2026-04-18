import { apiFetch } from "@/lib/api"
import type { ApiResponse, Notification } from "@/types"

const BASE = "/api/dashboard/notificacoes"

export async function listNotifications(unreadOnly = false): Promise<Notification[]> {
  const response = await apiFetch<ApiResponse<Notification[]>>(BASE, {
    params: unreadOnly ? { unread_only: true } : undefined,
  })
  return response.data
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`${BASE}/${id}/lida`, { method: "PATCH" })
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch(`${BASE}/todas-lidas`, { method: "PATCH" })
}
