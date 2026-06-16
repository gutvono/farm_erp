"use client"

import { Badge } from "@/components/ui/badge"
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
import { FinancialMovement, MovementType, Paginated } from "@/types/index"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { MovimentacaoFinFilters } from "./useMovimentacoesFin"

const ALL = "all"

const KNOWN_MODULES = [
  "comercial",
  "compras",
  "estoque",
  "financeiro",
  "faturamento",
  "folha",
  "pcp",
]

const CATEGORIES: { value: string; label: string }[] = [
  { value: "venda", label: "Venda" },
  { value: "compra", label: "Compra" },
  { value: "folha", label: "Folha" },
  { value: "producao", label: "Produção" },
  { value: "ajuste", label: "Ajuste" },
  { value: "recebimento", label: "Recebimento" },
  { value: "pagamento", label: "Pagamento" },
  { value: "saldo_inicial", label: "Saldo inicial" },
  { value: "outro", label: "Outro" },
]

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
)

const columns: DataTableColumn<FinancialMovement>[] = [
  {
    key: "occurred_at",
    label: "Data",
    sortable: true,
    render: (m) => (
      <span className="text-xs text-slate-500">{formatDateTime(m.occurred_at)}</span>
    ),
  },
  {
    key: "description",
    label: "Descrição",
    render: (m) => (
      <TruncatedText text={m.description} className="max-w-[280px] text-sm text-slate-700" />
    ),
  },
  {
    key: "category",
    label: "Categoria",
    render: (m) => (
      <span className="text-sm text-slate-600">
        {CATEGORY_LABELS[m.category] ?? m.category}
      </span>
    ),
  },
  {
    key: "source_module",
    label: "Módulo",
    render: (m) => (
      <span className="text-xs text-slate-500">{m.source_module ?? "—"}</span>
    ),
  },
  {
    key: "movement_type",
    label: "Tipo",
    render: (m) =>
      m.movement_type === "entrada" ? (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Entrada
        </Badge>
      ) : (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Saída</Badge>
      ),
  },
  {
    key: "amount",
    label: "Valor",
    sortable: true,
    align: "right",
    render: (m) => (
      <span
        className={
          m.movement_type === "entrada"
            ? "font-medium text-green-600"
            : "font-medium text-red-600"
        }
      >
        {formatCurrency(m.amount)}
      </span>
    ),
  },
]

interface MovimentacoesTableProps {
  data: Paginated<FinancialMovement>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  filters: MovimentacaoFinFilters
  onFiltersChange: (filters: MovimentacaoFinFilters) => void
}

export function MovimentacoesTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  filters,
  onFiltersChange,
}: MovimentacoesTableProps) {
  // Módulos da página atual + os fixos + o filtro ativo, para que o módulo
  // selecionado nunca suma da lista mesmo fora da página exibida.
  const sourceModules = Array.from(
    new Set(
      [
        ...KNOWN_MODULES,
        ...data.items.map((m) => m.source_module),
        filters.source_module,
      ].filter((mod): mod is string => Boolean(mod))
    )
  ).sort()

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
            placeholder="Descrição..."
            className="w-56"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Período</Label>
          <DateRangePicker
            value={{ from: filters.start_date, to: filters.end_date }}
            onChange={(range) =>
              onFiltersChange({
                ...filters,
                start_date: range.from,
                end_date: range.to,
              })
            }
            className="w-64"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Tipo</Label>
          <Select
            value={filters.movement_type ?? ALL}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                movement_type: value === ALL ? undefined : (value as MovementType),
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
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Categoria</Label>
          <Select
            value={filters.category ?? ALL}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                category: value === ALL ? undefined : value,
              })
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Módulo</Label>
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
        </div>

        <ClearFiltersButton
          active={Boolean(
            filters.search ||
              filters.start_date ||
              filters.end_date ||
              filters.movement_type ||
              filters.category ||
              filters.source_module
          )}
          onClear={() => onFiltersChange({})}
        />
      </div>

      <DataTable<FinancialMovement>
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
