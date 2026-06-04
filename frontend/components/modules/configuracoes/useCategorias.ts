"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getCategorias } from "@/services/configuracoes"
import { Category, Paginated } from "@/types/index"

export const CATEGORIAS_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<Category> = {
  items: [],
  total: 0,
  page: 1,
  page_size: CATEGORIAS_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de categorias de estoque.
 * Espelha `useMovimentacoes`/`useCargos`: o estado de query (página/ordenação/
 * busca) mora no hook; o `DataTable` permanece "burro". `order_by` server-side só
 * em `name` (allowlist do backend).
 */
export function useCategorias() {
  const [data, setData] = useState<Paginated<Category>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" })
  const [search, setSearchState] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getCategorias({
        page,
        page_size: CATEGORIAS_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        search: search || undefined,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar categorias")
    } finally {
      setLoading(false)
    }
  }, [page, sort, search])

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

  const setSearch = useCallback((next: string) => {
    setSearchState(next)
    setPage(1)
  }, [])

  return {
    data,
    loading,
    page,
    setPage,
    sort,
    toggleSort,
    search,
    setSearch,
    reload: load,
  }
}
