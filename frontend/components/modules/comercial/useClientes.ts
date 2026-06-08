"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getClientesPaginated } from "@/services/comercial"
import { Client, Paginated } from "@/types/index"
import { useDebouncedValue } from "@/lib/use-debounced-value"

export const CLIENTES_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

interface ClientesFilters {
  search?: string
  is_delinquent?: boolean
}

const EMPTY_PAGE: Paginated<Client> = {
  items: [],
  total: 0,
  page: 1,
  page_size: CLIENTES_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de clientes (Demanda 8). Página,
 * ordenação, filtro de inadimplência e busca (com debounce) vivem aqui; a tabela
 * é só apresentação. Espelha `useContasPagar` do Financeiro.
 */
export function useClientes() {
  const [data, setData] = useState<Paginated<Client>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" })
  const [filters, setFiltersState] = useState<ClientesFilters>({})

  const [searchInput, setSearchInput] = useState("")
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  // Busca com debounce: ao estabilizar, entra nos filtros e reseta a página.
  // Ambos os setState no mesmo efeito são agrupados (1 render → 1 fetch).
  useEffect(() => {
    setFiltersState((prev) => ({ ...prev, search: debouncedSearch || undefined }))
    setPage(1)
  }, [debouncedSearch])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getClientesPaginated({
        page,
        page_size: CLIENTES_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        search: filters.search,
        is_delinquent: filters.is_delinquent,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar clientes")
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

  const setDelinquentOnly = useCallback((value: boolean) => {
    setFiltersState((prev) => ({ ...prev, is_delinquent: value || undefined }))
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
    delinquentOnly: filters.is_delinquent ?? false,
    setDelinquentOnly,
    reload: load,
  }
}
