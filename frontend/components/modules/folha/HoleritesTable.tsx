"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { ClearFiltersButton } from "@/components/ui/clear-filters-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ContractType,
  Employee,
  PayrollEntry,
  PayrollEntryStatus,
  PayrollPeriod,
} from "@/types/index"
import { EntryRow } from "./EntryRow"
import { HoleriteSortKey, useHolerites } from "./useHolerites"

const ALL = "all"

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os status" },
  { value: "pendente", label: "Pendente" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação" },
  { value: "pago", label: "Pago" },
]

const CONTRACT_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os contratos" },
  { value: "clt", label: "CLT" },
  { value: "pj", label: "PJ" },
  { value: "temporario", label: "Temporário" },
]

interface HoleritesTableProps {
  entries: PayrollEntry[]
  period: PayrollPeriod
  employeeById: Map<string, Employee>
  loading: boolean
  onChanged: () => void
}

export function HoleritesTable({
  entries,
  period,
  employeeById,
  loading,
  onChanged,
}: HoleritesTableProps) {
  const { rows, sort, toggleSort, filters, setFilters } = useHolerites(entries)

  function SortableHead({
    label,
    sortKey,
    align,
  }: {
    label: string
    sortKey: HoleriteSortKey
    align?: "right"
  }) {
    return (
      <TableHead
        className={cn(
          "cursor-pointer select-none hover:text-foreground",
          align === "right" && "text-right"
        )}
        onClick={() => toggleSort(sortKey)}
      >
        {label}
        {sort.by !== sortKey ? (
          <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />
        ) : sort.dir === "asc" ? (
          <ArrowUp className="ml-1 inline h-3 w-3" />
        ) : (
          <ArrowDown className="ml-1 inline h-3 w-3" />
        )}
      </TableHead>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Status</Label>
          <Select
            value={filters.status ?? ALL}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                status: value === ALL ? undefined : (value as PayrollEntryStatus),
              })
            }
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Contrato</Label>
          <Select
            value={filters.contract_type ?? ALL}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                contract_type:
                  value === ALL ? undefined : (value as ContractType),
              })
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Contrato" />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ClearFiltersButton
          active={Boolean(filters.status || filters.contract_type)}
          onClear={() => setFilters({})}
        />

        <span className="ml-auto self-center text-xs text-slate-500">
          {rows.length} de {entries.length} holerite
          {entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          {loading ? "Carregando..." : "Nenhum holerite gerado para este período"}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          Nenhum holerite corresponde aos filtros
        </div>
      ) : (
        // Mantemos a tabela montada durante o reload (apenas esmaecida) para não
        // desmontar o modal de edição aberto numa das linhas.
        <div
          className={cn(
            "rounded-md border bg-white transition-opacity",
            loading && "pointer-events-none opacity-60"
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Funcionário" sortKey="employee_name" />
                <TableHead>Contrato</TableHead>
                <SortableHead label="Salário base" sortKey="base_salary" align="right" />
                <SortableHead label="Horas extras" sortKey="overtime_amount" align="right" />
                <SortableHead label="Descontos" sortKey="deductions" align="right" />
                <SortableHead label="Total" sortKey="total_amount" align="right" />
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  period={period}
                  employee={employeeById.get(entry.employee_id)}
                  onChanged={onChanged}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
