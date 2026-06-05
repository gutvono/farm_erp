"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getContasPagar } from "@/services/financeiro"
import { AccountsPayable, Paginated, PayableStatus } from "@/types/index"

export const CONTAS_PAGAR_PAGE_SIZE = 20

export interface ContasPagarFilters {
  status?: PayableStatus
  search?: string
  due_after?: string
  due_before?: string
}

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<AccountsPayable> = {
  items: [],
  total: 0,
  page: 1,
  page_size: CONTAS_PAGAR_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de contas a pagar. Página,
 * ordenação e filtros vivem aqui (no hook); a tabela permanece de apresentação.
 * Espelha `useMovimentacoes` do Estoque (Demanda 0).
 */
export function useContasPagar(initialFilters: ContasPagarFilters = {}) {
  const [data, setData] = useState<Paginated<AccountsPayable>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "due_date", dir: "asc" })
  const [filters, setFiltersState] = useState<ContasPagarFilters>(initialFilters)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getContasPagar({
        page,
        page_size: CONTAS_PAGAR_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        ...filters,
      })
      setData(result)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao carregar contas a pagar"
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
        : { by: key, dir: "asc" }
    )
    setPage(1)
  }, [])

  const setFilters = useCallback((next: ContasPagarFilters) => {
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
