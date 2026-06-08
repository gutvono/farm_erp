"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getCotacoesPaginated } from "@/services/compras"
import { Paginated, Quotation, QuotationStatus } from "@/types/index"

export const COTACOES_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

interface CotacoesFilters {
  status?: QuotationStatus
  order_type?: string
}

const EMPTY_PAGE: Paginated<Quotation> = {
  items: [],
  total: 0,
  page: 1,
  page_size: COTACOES_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de cotações (Demanda 8). Filtros
 * (status, tipo) e ordenação por `status`/`created_at` (allowlist do backend).
 * Sem busca textual.
 */
export function useCotacoes() {
  const [data, setData] = useState<Paginated<Quotation>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "created_at", dir: "desc" })
  const [filters, setFiltersState] = useState<CotacoesFilters>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getCotacoesPaginated({
        page,
        page_size: COTACOES_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        status: filters.status,
        order_type: filters.order_type,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar cotações")
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

  const setStatus = useCallback((value: QuotationStatus | undefined) => {
    setFiltersState((prev) => ({ ...prev, status: value }))
    setPage(1)
  }, [])

  const setOrderType = useCallback((value: string | undefined) => {
    setFiltersState((prev) => ({ ...prev, order_type: value }))
    setPage(1)
  }, [])

  return {
    data,
    loading,
    page,
    setPage,
    sort,
    toggleSort,
    status: filters.status,
    setStatus,
    orderType: filters.order_type,
    setOrderType,
    reload: load,
  }
}
