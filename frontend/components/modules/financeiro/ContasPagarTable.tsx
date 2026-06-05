"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { AccountsPayable, Paginated, PayableStatus } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"
import { StatusBadge } from "./StatusBadge"
import { ContasPagarFilters } from "./useContasPagar"

const ALL = "all"

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os status" },
  { value: "em_aberto", label: "Em aberto" },
  { value: "paga", label: "Paga" },
  { value: "cancelada", label: "Cancelada" },
]

interface ContasPagarTableProps {
  data: Paginated<AccountsPayable>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  filters: ContasPagarFilters
  onFiltersChange: (filters: ContasPagarFilters) => void
  onSelect: (conta: AccountsPayable) => void
}

export function ContasPagarTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  filters,
  onFiltersChange,
  onSelect,
}: ContasPagarTableProps) {
  const columns: DataTableColumn<AccountsPayable>[] = [
    {
      key: "number",
      label: "Nº",
      render: (c) => (
        <span className="font-mono text-xs text-slate-500">{c.number}</span>
      ),
    },
    {
      key: "description",
      label: "Descrição",
      render: (c) => (
        <span className="block max-w-[260px] truncate text-sm font-medium text-slate-800">
          {c.description}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "due_date",
      label: "Vencimento",
      sortable: true,
      render: (c) => (
        <span className="text-sm text-slate-600">{formatDate(c.due_date)}</span>
      ),
    },
    {
      key: "amount",
      label: "Valor",
      sortable: true,
      align: "right",
      render: (c) => (
        <span className="font-semibold text-slate-800">
          {formatCurrency(c.amount)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (c) => (
        <Button variant="ghost" size="sm" onClick={() => onSelect(c)}>
          Detalhes
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Buscar</Label>
          <Input
            value={filters.search ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, search: e.target.value || undefined })
            }
            placeholder="Nº, descrição ou fornecedor..."
            className="w-64"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Vence de</Label>
          <Input
            type="date"
            value={filters.due_after ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, due_after: e.target.value || undefined })
            }
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Vence até</Label>
          <Input
            type="date"
            value={filters.due_before ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, due_before: e.target.value || undefined })
            }
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Status</Label>
          <Select
            value={filters.status ?? ALL}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                status: value === ALL ? undefined : (value as PayableStatus),
              })
            }
          >
            <SelectTrigger className="w-44">
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
      </div>

      <DataTable<AccountsPayable>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhuma conta encontrada"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={onPageChange}
        sort={sort}
        onSortChange={onSortChange}
        rowKey={(c) => c.id}
      />
    </div>
  )
}
