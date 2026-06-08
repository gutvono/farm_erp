"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getVendasPaginated } from "@/services/comercial"
import { Paginated, Sale, SaleStatus } from "@/types/index"

export const VENDAS_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<Sale> = {
  items: [],
  total: 0,
  page: 1,
  page_size: VENDAS_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de vendas (Demanda 8). Filtro por
 * status e ordenação por `sold_at`/`status` (allowlist do backend). Sem busca
 * textual. Espelha `useContasPagar`.
 */
export function useVendas() {
  const [data, setData] = useState<Paginated<Sale>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "sold_at", dir: "desc" })
  const [status, setStatusState] = useState<SaleStatus | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getVendasPaginated({
        page,
        page_size: VENDAS_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        status,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar vendas")
    } finally {
      setLoading(false)
    }
  }, [page, sort, status])

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

  const setStatus = useCallback((value: SaleStatus | undefined) => {
    setStatusState(value)
    setPage(1)
  }, [])

  return {
    data,
    loading,
    page,
    setPage,
    sort,
    toggleSort,
    status,
    setStatus,
    reload: load,
  }
}
