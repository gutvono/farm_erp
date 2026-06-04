"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getMovimentacoesPaginated } from "@/services/estoque"
import { Paginated, StockMovement, StockMovementType } from "@/types/index"

export const MOVIMENTACOES_PAGE_SIZE = 20

export interface MovimentacaoFilters {
  stock_item_id?: string
  movement_type?: StockMovementType
  source_module?: string
  search?: string
  start_date?: string
  end_date?: string
}

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<StockMovement> = {
  items: [],
  total: 0,
  page: 1,
  page_size: MOVIMENTACOES_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de movimentações de estoque.
 * Mantém página, ordenação e filtros, refazendo a chamada server-side a cada
 * mudança. Reutilizado pela aba Movimentações e pelo histórico por item.
 *
 * O estado de query (página/ordenação/filtros) mora aqui (no hook), não no
 * componente de apresentação — que permanece "burro".
 */
export function useMovimentacoes(initialFilters: MovimentacaoFilters = {}) {
  const [data, setData] = useState<Paginated<StockMovement>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "occurred_at", dir: "desc" })
  const [filters, setFiltersState] = useState<MovimentacaoFilters>(initialFilters)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getMovimentacoesPaginated({
        page,
        page_size: MOVIMENTACOES_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        ...filters,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar movimentações")
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
        : { by: key, dir: "desc" }
    )
    setPage(1)
  }, [])

  const setFilters = useCallback((next: MovimentacaoFilters) => {
    setFiltersState(next)
    setPage(1)
  }, [])

  return {
    data,
    loading,
    page,
    setPage,
    sort,
    toggleSort,
    filters,
    setFilters,
    reload: load,
  }
}
