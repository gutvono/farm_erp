import { apiFetch } from "@/lib/api"
import { fetchPaginated } from "@/lib/pagination"
import {
  ApiResponse,
  Category,
  HarvestDestinations,
  Paginated,
  SystemRole,
} from "@/types/index"

// ── Categorias ────────────────────────────────────────────────────────────────

interface RawCategory {
  id: string
  name: string
  description: string | null
  is_active: boolean
  roles: SystemRole[]
}

function parseCategory(raw: RawCategory): Category {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    is_active: raw.is_active,
    roles: raw.roles ?? [],
  }
}

/**
 * Lista paginada de categorias de estoque (`GET /api/configuracoes/categorias`).
 * O endpoint responde o envelope `Page[T]` cru (infra de paginação da Demanda 0),
 * por isso usa `fetchPaginated`. Cada categoria já traz seus `roles`.
 * `order_by` aceito: `name` (default `name asc`); `search` filtra por nome.
 */
export async function getCategorias(params: {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
}): Promise<Paginated<Category>> {
  return fetchPaginated<Category, RawCategory>(
    "/api/configuracoes/categorias",
    params,
    parseCategory
  )
}

export async function createCategoria(data: {
  name: string
  description?: string
  is_active: boolean
}): Promise<Category> {
  const response = await apiFetch<ApiResponse<RawCategory>>(
    "/api/configuracoes/categorias",
    { method: "POST", body: JSON.stringify(data) }
  )
  return parseCategory(response.data)
}

export async function updateCategoria(
  id: string,
  data: Partial<{ name: string; description: string; is_active: boolean }>
): Promise<Category> {
  const response = await apiFetch<ApiResponse<RawCategory>>(
    `/api/configuracoes/categorias/${id}`,
    { method: "PUT", body: JSON.stringify(data) }
  )
  return parseCategory(response.data)
}

export async function deleteCategoria(id: string): Promise<void> {
  await apiFetch(`/api/configuracoes/categorias/${id}`, { method: "DELETE" })
}

/**
 * Substitui o conjunto de papéis de uma categoria
 * (`PUT /api/configuracoes/categorias/{id}/papeis`). Semântica de SUBSTITUIÇÃO:
 * envia o conjunto completo; enviar `[]` remove todos os papéis.
 */
export async function updateCategoriaPapeis(
  id: string,
  roles: SystemRole[]
): Promise<Category> {
  const response = await apiFetch<ApiResponse<RawCategory>>(
    `/api/configuracoes/categorias/${id}/papeis`,
    { method: "PUT", body: JSON.stringify({ roles }) }
  )
  return parseCategory(response.data)
}

// ── Papéis ────────────────────────────────────────────────────────────────────

/** Vocabulário fixo de papéis de sistema (fonte da verdade do backend). */
export async function getPapeis(): Promise<SystemRole[]> {
  const response = await apiFetch<ApiResponse<SystemRole[]>>(
    "/api/configuracoes/papeis"
  )
  return response.data
}

// ── Destinos da colheita ──────────────────────────────────────────────────────

export async function getDestinosColheita(): Promise<HarvestDestinations> {
  const response = await apiFetch<ApiResponse<HarvestDestinations>>(
    "/api/configuracoes/destinos-colheita"
  )
  return {
    industria_item_id: response.data.industria_item_id ?? null,
    embalagem_item_id: response.data.embalagem_item_id ?? null,
    descarte_item_id: response.data.descarte_item_id ?? null,
  }
}

export async function updateDestinosColheita(data: {
  industria_item_id: string
  embalagem_item_id: string
  descarte_item_id: string
}): Promise<HarvestDestinations> {
  const response = await apiFetch<ApiResponse<HarvestDestinations>>(
    "/api/configuracoes/destinos-colheita",
    { method: "PUT", body: JSON.stringify(data) }
  )
  return {
    industria_item_id: response.data.industria_item_id ?? null,
    embalagem_item_id: response.data.embalagem_item_id ?? null,
    descarte_item_id: response.data.descarte_item_id ?? null,
  }
}
