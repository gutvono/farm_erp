"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { getFuncionariosPaginated } from "@/services/folha"
import { ContractType, Employee, Paginated } from "@/types/index"
import { useDebouncedValue } from "@/lib/use-debounced-value"

export const FUNCIONARIOS_PAGE_SIZE = 20

interface SortState {
  by: string
  dir: "asc" | "desc"
}

interface FuncionariosFilters {
  search?: string
  is_active?: boolean
  contract_type?: ContractType
}

const EMPTY_PAGE: Paginated<Employee> = {
  items: [],
  total: 0,
  page: 1,
  page_size: FUNCIONARIOS_PAGE_SIZE,
  pages: 0,
}

/**
 * Estado + carregamento da listagem paginada de funcionários (Demanda 8).
 * Filtros (ativo, tipo de contrato), busca por nome/documento (debounce) e
 * ordenação por `name` (allowlist do backend). Começa com `is_active=true`,
 * espelhando o comportamento anterior ("Apenas ativos").
 */
export function useFuncionarios() {
  const [data, setData] = useState<Paginated<Employee>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" })
  const [filters, setFiltersState] = useState<FuncionariosFilters>({ is_active: true })

  const [searchInput, setSearchInput] = useState("")
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  useEffect(() => {
    setFiltersState((prev) => ({ ...prev, search: debouncedSearch || undefined }))
    setPage(1)
  }, [debouncedSearch])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getFuncionariosPaginated({
        page,
        page_size: FUNCIONARIOS_PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
        search: filters.search,
        is_active: filters.is_active,
        contract_type: filters.contract_type,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar funcionários")
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

  const setActiveOnly = useCallback((value: boolean) => {
    setFiltersState((prev) => ({ ...prev, is_active: value || undefined }))
    setPage(1)
  }, [])

  const setContractType = useCallback((value: ContractType | undefined) => {
    setFiltersState((prev) => ({ ...prev, contract_type: value }))
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
    activeOnly: filters.is_active ?? false,
    setActiveOnly,
    contractType: filters.contract_type,
    setContractType,
    reload: load,
  }
}
