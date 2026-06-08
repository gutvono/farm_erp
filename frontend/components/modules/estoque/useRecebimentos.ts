"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getRecebimentosPaginated } from "@/services/compras"
import { Paginated, PurchaseOrderWithReceipts } from "@/types/index"

export const RECEBIMENTOS_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<PurchaseOrderWithReceipts> = {
  items: [],
  total: 0,
  page: 1,
  page_size: RECEBIMENTOS_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de recebimentos (Demanda 8). A
 * seleção (ordens de PRODUTO aprovadas/em conferência) é fixa no backend; aqui
 * só paginamos e ordenamos por `ordered_at`/`status`.
 */
export function useRecebimentos() {
  const [data, setData] = useState<Paginated<PurchaseOrderWithReceipts>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "ordered_at", dir: "desc" })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getRecebimentosPaginated({
        page,
        page_size: RECEBIMENTOS_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar recebimentos")
    } finally {
      setLoading(false)
    }
  }, [page, sort])

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

  return {
    data,
    loading,
    page,
    setPage,
    sort,
    toggleSort,
    reload: load,
  }
}
