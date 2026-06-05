"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getContasReceber } from "@/services/financeiro"
import { AccountsReceivable, Paginated, ReceivableStatus } from "@/types/index"

export const CONTAS_RECEBER_PAGE_SIZE = 20

export interface ContasReceberFilters {
  status?: ReceivableStatus
  search?: string
  due_after?: string
  due_before?: string
}

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<AccountsReceivable> = {
  items: [],
  total: 0,
  page: 1,
  page_size: CONTAS_RECEBER_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de contas a receber. Página,
 * ordenação e filtros vivem aqui (no hook); a tabela permanece de apresentação.
 */
export function useContasReceber(initialFilters: ContasReceberFilters = {}) {
  const [data, setData] = useState<Paginated<AccountsReceivable>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "due_date", dir: "asc" })
  const [filters, setFiltersState] = useState<ContasReceberFilters>(initialFilters)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getContasReceber({
        page,
        page_size: CONTAS_RECEBER_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        ...filters,
      })
      setData(result)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao carregar contas a receber"
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

  const setFilters = useCallback((next: ContasReceberFilters) => {
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
