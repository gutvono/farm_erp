"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ClearFiltersButton } from "@/components/ui/clear-filters-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { TruncatedText } from "@/components/ui/truncated-text"
import { AccountsReceivable, Paginated, ReceivableStatus } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"
import { StatusBadge } from "./StatusBadge"
import { ContasReceberFilters } from "./useContasReceber"

const ALL = "all"

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os status" },
  { value: "em_aberto", label: "Em aberto" },
  { value: "parcialmente_pago", label: "Parcialmente pago" },
  { value: "quitado", label: "Quitado" },
  { value: "cancelada", label: "Cancelada" },
]

interface ContasReceberTableProps {
  data: Paginated<AccountsReceivable>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  filters: ContasReceberFilters
  onFiltersChange: (filters: ContasReceberFilters) => void
  onSelect: (conta: AccountsReceivable) => void
}

export function ContasReceberTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  filters,
  onFiltersChange,
  onSelect,
}: ContasReceberTableProps) {
  const columns: DataTableColumn<AccountsReceivable>[] = [
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
        <TruncatedText
          text={c.description}
          className="max-w-[260px] text-sm font-medium text-slate-800"
        />
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
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-slate-600">{formatDate(c.due_date)}</span>
          {c.is_overdue && (
            <span className="flex items-center gap-1">
              <Badge className="bg-red-100 text-red-700">Vencida</Badge>
              <span className="text-xs text-red-600">
                há {c.days_overdue} dia{c.days_overdue !== 1 ? "s" : ""}
              </span>
            </span>
          )}
        </div>
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
            placeholder="Nº, descrição ou cliente..."
            className="w-64"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Período de vencimento</Label>
          <DateRangePicker
            value={{ from: filters.due_after, to: filters.due_before }}
            onChange={(range) =>
              onFiltersChange({
                ...filters,
                due_after: range.from,
                due_before: range.to,
              })
            }
            className="w-64"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Status</Label>
          <Select
            value={filters.status ?? ALL}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                status: value === ALL ? undefined : (value as ReceivableStatus),
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

        <ClearFiltersButton
          active={Boolean(
            filters.search ||
              filters.status ||
              filters.due_after ||
              filters.due_before
          )}
          onClear={() => onFiltersChange({})}
        />
      </div>

      <DataTable<AccountsReceivable>
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
