"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getMovimentacoes } from "@/services/financeiro"
import { FinancialMovement, MovementType, Paginated } from "@/types/index"

export const MOVIMENTACOES_FIN_PAGE_SIZE = 20

export interface MovimentacaoFinFilters {
  movement_type?: MovementType
  category?: string
  source_module?: string
  search?: string
  start_date?: string
  end_date?: string
}

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<FinancialMovement> = {
  items: [],
  total: 0,
  page: 1,
  page_size: MOVIMENTACOES_FIN_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de movimentações do Financeiro.
 * Página/ordenação/filtros vivem aqui; a tabela é só apresentação. Espelha o
 * `useMovimentacoes` do Estoque (Demanda 0).
 */
export function useMovimentacoesFin(initialFilters: MovimentacaoFinFilters = {}) {
  const [data, setData] = useState<Paginated<FinancialMovement>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "occurred_at", dir: "desc" })
  const [filters, setFiltersState] =
    useState<MovimentacaoFinFilters>(initialFilters)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getMovimentacoes({
        page,
        page_size: MOVIMENTACOES_FIN_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        ...filters,
      })
      setData(result)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao carregar movimentações"
      )
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

  const setFilters = useCallback((next: MovimentacaoFinFilters) => {
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
