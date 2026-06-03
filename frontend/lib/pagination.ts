import { apiFetch } from "@/lib/api"
import { Paginated } from "@/types/index"

/**
 * Parâmetros padrão de paginação/ordenação aceitos por qualquer endpoint
 * paginado do backend (ver `docs/backend/_shared-paginacao.md`).
 */
export interface PaginationParams {
  page?: number
  page_size?: number
  order_by?: string
  order_dir?: "asc" | "desc"
  search?: string
}

type QueryValue = string | number | boolean | undefined | null

/**
 * Parâmetros de paginação + filtros extras específicos de cada endpoint
 * (ex.: `stock_item_id`, `movement_type`). Valores `undefined`/`null`/`""`
 * são omitidos da query string.
 */
export type PaginatedQuery = PaginationParams & Record<string, QueryValue>

/**
 * Helper genérico de fetch paginado.
 *
 * - Monta a query string a partir de `query`, omitindo chaves vazias.
 * - Usa `apiFetch` (mantém `credentials` de sessão e o tratamento 401→/login).
 * - O backend paginado responde o envelope CRU `{ items, total, page,
 *   page_size, pages }` (NÃO dentro de `{ success, message, data }`).
 * - Aplica `parseItem` em cada item (ex.: converter Decimal `string`→`number`).
 *
 * @typeParam T    Tipo final de cada item (já parseado).
 * @typeParam TRaw Tipo cru de cada item vindo da API (default = `T`).
 */
export async function fetchPaginated<T, TRaw = T>(
  path: string,
  query: PaginatedQuery = {},
  parseItem?: (raw: TRaw) => T
): Promise<Paginated<T>> {
  const params: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    params[key] = value
  }

  const raw = await apiFetch<Paginated<TRaw>>(path, { params })

  const items = parseItem
    ? raw.items.map(parseItem)
    : (raw.items as unknown as T[])

  return {
    items,
    total: raw.total,
    page: raw.page,
    page_size: raw.page_size,
    pages: raw.pages,
  }
}
