"use client"

import { useCallback, useMemo, useState } from "react"

import { ContractType, PayrollEntry, PayrollEntryStatus } from "@/types/index"

export type HoleriteSortKey =
  | "employee_name"
  | "base_salary"
  | "overtime_amount"
  | "deductions"
  | "total_amount"

export interface HoleriteFilters {
  status?: PayrollEntryStatus
  contract_type?: ContractType
}

interface SortState {
  by: HoleriteSortKey
  dir: "asc" | "desc"
}

function compareBy(
  a: PayrollEntry,
  b: PayrollEntry,
  key: HoleriteSortKey
): number {
  if (key === "employee_name") {
    return a.employee_name.localeCompare(b.employee_name, "pt-BR", {
      sensitivity: "base",
    })
  }
  return a[key] - b[key]
}

/**
 * Estado de **visualização** (client-side) da tabela de holerites de um período.
 * A lista já vem completa do backend (`GET /folha/periodos/{id}/entries`); aqui
 * só filtramos/ordenamos em memória — sem paginação server-side.
 *
 * **Ordem estável (a dor real):** a ordem depende apenas do critério escolhido
 * (padrão: nome) com desempate por nome e por id — **nunca pelo status**. Assim,
 * ao solicitar pagamento de um funcionário, a linha dele **não muda de posição**
 * (o status muda, mas a ordenação reaplicada o mantém no mesmo lugar).
 */
export function useHolerites(entries: PayrollEntry[]) {
  const [sort, setSort] = useState<SortState>({
    by: "employee_name",
    dir: "asc",
  })
  const [filters, setFilters] = useState<HoleriteFilters>({})

  const rows = useMemo(() => {
    const filtered = entries.filter((e) => {
      if (filters.status && e.status !== filters.status) return false
      if (filters.contract_type && e.contract_type !== filters.contract_type)
        return false
      return true
    })
    return [...filtered].sort((a, b) => {
      let c = compareBy(a, b, sort.by)
      if (c === 0)
        c = a.employee_name.localeCompare(b.employee_name, "pt-BR", {
          sensitivity: "base",
        })
      if (c === 0) c = a.id.localeCompare(b.id)
      return sort.dir === "asc" ? c : -c
    })
  }, [entries, filters, sort])

  const toggleSort = useCallback((key: HoleriteSortKey) => {
    setSort((prev) =>
      prev.by === key
        ? { by: key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { by: key, dir: "asc" }
    )
  }, [])

  return { rows, sort, toggleSort, filters, setFilters }
}
