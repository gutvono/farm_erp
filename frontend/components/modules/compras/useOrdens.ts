"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getOrdensPaginated } from "@/services/compras"
import { Paginated, PurchaseOrder, PurchaseOrderStatus } from "@/types/index"
import { useDebouncedValue } from "@/lib/use-debounced-value"

export const ORDENS_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

interface OrdensFilters {
  search?: string
  status?: PurchaseOrderStatus
  supplier_id?: string
}

const EMPTY_PAGE: Paginated<PurchaseOrder> = {
  items: [],
  total: 0,
  page: 1,
  page_size: ORDENS_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de ordens de compra (Demanda 8).
 * Filtros (status, fornecedor), busca por fornecedor (debounce) e ordenação por
 * `ordered_at`/`status` (allowlist do backend).
 */
export function useOrdens() {
  const [data, setData] = useState<Paginated<PurchaseOrder>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "ordered_at", dir: "desc" })
  const [filters, setFiltersState] = useState<OrdensFilters>({})

  const [searchInput, setSearchInput] = useState("")
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  useEffect(() => {
    setFiltersState((prev) => ({ ...prev, search: debouncedSearch || undefined }))
    setPage(1)
  }, [debouncedSearch])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getOrdensPaginated({
        page,
        page_size: ORDENS_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        search: filters.search,
        status: filters.status,
        supplier_id: filters.supplier_id,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar ordens")
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

  const setStatus = useCallback((value: PurchaseOrderStatus | undefined) => {
    setFiltersState((prev) => ({ ...prev, status: value }))
    setPage(1)
  }, [])

  const setSupplierId = useCallback((value: string | undefined) => {
    setFiltersState((prev) => ({ ...prev, supplier_id: value }))
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
    status: filters.status,
    setStatus,
    supplierId: filters.supplier_id,
    setSupplierId,
    reload: load,
  }
}
