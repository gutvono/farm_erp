"use client"

import { Badge } from "@/components/ui/badge"
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
import { Paginated, StockMovement, StockMovementType } from "@/types/index"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { MovimentacaoFilters } from "./useMovimentacoes"

interface MovimentacoesTableProps {
  data: Paginated<StockMovement>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  filters: MovimentacaoFilters
  onFiltersChange: (filters: MovimentacaoFilters) => void
  hideItemFilter?: boolean
  items?: { id: string; name: string }[]
}

const ALL = "all"

const columns: DataTableColumn<StockMovement>[] = [
  {
    key: "occurred_at",
    label: "Data",
    sortable: true,
    render: (m) => <span className="text-sm">{formatDateTime(m.occurred_at)}</span>,
  },
  {
    key: "stock_item_name",
    label: "Item",
    render: (m) => <span className="font-medium">{m.stock_item_name}</span>,
  },
  {
    key: "movement_type",
    label: "Tipo",
    render: (m) => (
      <Badge
        className={
          m.movement_type === "entrada"
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }
      >
        {m.movement_type === "entrada" ? "Entrada" : "Saída"}
      </Badge>
    ),
  },
  {
    key: "quantity",
    label: "Quantidade",
    sortable: true,
    align: "right",
    render: (m) => m.quantity,
  },
  {
    key: "unit_cost",
    label: "Valor unit.",
    sortable: true,
    align: "right",
    render: (m) => formatCurrency(m.unit_cost),
  },
  {
    key: "total_value",
    label: "Valor total",
    sortable: true,
    align: "right",
    render: (m) => formatCurrency(m.total_value),
  },
  {
    key: "description",
    label: "Descrição",
    render: (m) => (
      <span className="block max-w-[200px] truncate text-sm text-slate-600">
        {m.description}
      </span>
    ),
  },
  {
    key: "source_module",
    label: "Módulo",
    render: (m) => <span className="text-sm text-slate-500">{m.source_module}</span>,
  },
]

export function MovimentacoesTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  filters,
  onFiltersChange,
  hideItemFilter,
  items = [],
}: MovimentacoesTableProps) {
  // Opções de módulo derivadas da página atual + o valor selecionado, para que
  // o filtro ativo nunca suma da lista mesmo que não esteja na página exibida.
  const sourceModules = Array.from(
    new Set(
      [
        ...data.items.map((m) => m.source_module),
        filters.source_module,
      ].filter((mod): mod is string => Boolean(mod))
    )
  )

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
            placeholder="Descrição ou item..."
            className="w-56"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">De</Label>
          <Input
            type="date"
            value={filters.start_date ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, start_date: e.target.value || undefined })
            }
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Até</Label>
          <Input
            type="date"
            value={filters.end_date ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, end_date: e.target.value || undefined })
            }
            className="w-40"
          />
        </div>

        {!hideItemFilter && items.length > 0 && (
          <Select
            value={filters.stock_item_id ?? ALL}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                stock_item_id: value === ALL ? undefined : value,
              })
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os itens</SelectItem>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.movement_type ?? ALL}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              movement_type: value === ALL ? undefined : (value as StockMovementType),
            })
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            <SelectItem value="entrada">Entrada</SelectItem>
            <SelectItem value="saida">Saída</SelectItem>
          </SelectContent>
        </Select>

        {sourceModules.length > 0 && (
          <Select
            value={filters.source_module ?? ALL}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                source_module: value === ALL ? undefined : value,
              })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os módulos</SelectItem>
              {sourceModules.map((mod) => (
                <SelectItem key={mod} value={mod}>
                  {mod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <DataTable<StockMovement>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhuma movimentação encontrada"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={onPageChange}
        sort={sort}
        onSortChange={onSortChange}
        rowKey={(m) => m.id}
      />
    </div>
  )
}
