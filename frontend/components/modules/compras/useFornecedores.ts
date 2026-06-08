"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getFornecedoresPaginated } from "@/services/compras"
import { Paginated, Supplier } from "@/types/index"
import { useDebouncedValue } from "@/lib/use-debounced-value"

export const FORNECEDORES_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

const EMPTY_PAGE: Paginated<Supplier> = {
  items: [],
  total: 0,
  page: 1,
  page_size: FORNECEDORES_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de fornecedores (Demanda 8 — quita
 * a dívida da D6, que paginava no cliente). Busca por nome/documento (debounce)
 * e ordenação por `name` (allowlist do backend).
 */
export function useFornecedores() {
  const [data, setData] = useState<Paginated<Supplier>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" })

  const [searchInput, setSearchInput] = useState("")
  const [appliedSearch, setAppliedSearch] = useState<string | undefined>(undefined)
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  // Busca com debounce: ao estabilizar, vira o filtro aplicado e reseta a página
  // (ambos setState no mesmo efeito → 1 render → 1 fetch).
  useEffect(() => {
    setAppliedSearch(debouncedSearch || undefined)
    setPage(1)
  }, [debouncedSearch])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getFornecedoresPaginated({
        page,
        page_size: FORNECEDORES_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        search: appliedSearch,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar fornecedores")
    } finally {
      setLoading(false)
    }
  }, [page, sort, appliedSearch])

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
    searchInput,
    setSearchInput,
    reload: load,
  }
}
