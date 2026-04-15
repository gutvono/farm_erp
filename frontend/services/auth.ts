import { apiFetch } from "@/lib/api"
import type { ApiResponse, User } from "@/types"

interface LoginPayload {
  username: string
  password: string
}

export async function login(payload: LoginPayload): Promise<void> {
  await apiFetch<ApiResponse<User>>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" })
}

export async function getMe(): Promise<User> {
  const response = await apiFetch<ApiResponse<User>>("/api/auth/me")
  return response.data
}
