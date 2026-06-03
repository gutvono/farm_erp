"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getCargos } from "@/services/folha"
import { JobPosition, Paginated } from "@/types/index"

export const CARGOS_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<JobPosition> = {
  items: [],
  total: 0,
  page: 1,
  page_size: CARGOS_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de cargos (`/api/folha/cargos`).
 * Mantém página, ordenação e busca, refazendo a chamada server-side a cada
 * mudança. Espelha o padrão de `useMovimentacoes`: o estado de query mora no
 * hook, deixando a tabela de apresentação "burra".
 *
 * Ordenação server-side apenas nas colunas da allowlist do backend
 * (`name`, `base_salary`).
 */
export function useCargos() {
  const [data, setData] = useState<Paginated<JobPosition>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" })
  const [search, setSearchState] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getCargos({
        page,
        page_size: CARGOS_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        search: search || undefined,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar cargos")
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
