"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getItensPaginated } from "@/services/estoque"
import { Paginated, StockItem, SystemRole } from "@/types/index"
import { useDebouncedValue } from "@/lib/use-debounced-value"

export const ITENS_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

interface ItensFilters {
  search?: string
  category_id?: string
  role?: SystemRole
  below_minimum?: boolean
}

const EMPTY_PAGE: Paginated<StockItem> = {
  items: [],
  total: 0,
  page: 1,
  page_size: ITENS_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de itens de estoque (Demanda 8).
 * Filtros (categoria, papel, abaixo do mínimo), busca por nome/sku (debounce) e
 * ordenação por `name`/`sku` (allowlist do backend). Espelha `useContasPagar`.
 */
export function useItens() {
  const [data, setData] = useState<Paginated<StockItem>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" })
  const [filters, setFiltersState] = useState<ItensFilters>({})

  const [searchInput, setSearchInput] = useState("")
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  useEffect(() => {
    setFiltersState((prev) => ({ ...prev, search: debouncedSearch || undefined }))
    setPage(1)
  }, [debouncedSearch])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getItensPaginated({
        page,
        page_size: ITENS_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        search: filters.search,
        category_id: filters.category_id,
        role: filters.role,
        below_minimum: filters.below_minimum,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar itens")
    } finally {
      setLoading(false)
    }
  }, [page, sort, filters])

  useEffect(() => {
    load()
  }, [load])

  const toggleSort = useCallback((key: string) => {
    setSort((prev) =>
      prev.by === key
        ? { by: key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { by: key, dir: "asc" }
    )
    setPage(1)
  }, [])

  const setCategory = useCallback((category_id: string | undefined) => {
    setFiltersState((prev) => ({ ...prev, category_id }))
    setPage(1)
  }, [])

  const setRole = useCallback((role: SystemRole | undefined) => {
    setFiltersState((prev) => ({ ...prev, role }))
    setPage(1)
  }, [])

  const setBelowMinimum = useCallback((value: boolean) => {
    setFiltersState((prev) => ({ ...prev, below_minimum: value || undefined }))
    setPage(1)
  }, [])

  return {
    data,
    loading,
    page,
    setPage,
    sort,
    toggleSort,
    searchInput,
    setSearchInput,
    categoryId: filters.category_id,
    setCategory,
    role: filters.role,
    setRole,
    belowMinimum: filters.below_minimum ?? false,
    setBelowMinimum,
    reload: load,
  }
}
