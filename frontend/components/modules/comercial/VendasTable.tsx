"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { ClearFiltersButton } from "@/components/ui/clear-filters-button"
import { VendaCard } from "@/components/modules/comercial/VendaCard"
import { Paginated, Sale, SaleStatus } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

const ALL = "all"

const STATUS_LABELS: Record<SaleStatus, string> = {
  realizada: "Realizada",
  entregue: "Entregue",
  cancelada: "Cancelada",
}

const STATUS_COLORS: Record<SaleStatus, string> = {
  realizada: "bg-blue-100 text-blue-800",
  entregue: "bg-green-100 text-green-800",
  cancelada: "bg-slate-100 text-slate-600",
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os status" },
  { value: "realizada", label: "Realizada" },
  { value: "entregue", label: "Entregue" },
  { value: "cancelada", label: "Cancelada" },
]

interface VendasTableProps {
  data: Paginated<Sale>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  status: SaleStatus | undefined
  onStatusChange: (status: SaleStatus | undefined) => void
  onChanged: () => void
}

export function VendasTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  status,
  onStatusChange,
  onChanged,
}: VendasTableProps) {
  // Venda selecionada para o painel de detalhe (ações ricas vivem no VendaCard).
  const [selected, setSelected] = useState<Sale | null>(null)

  const columns: DataTableColumn<Sale>[] = [
    {
      key: "client_name",
      label: "Cliente",
      render: (s) => <span className="font-medium text-slate-800">{s.client_name}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (s) => <Badge className={STATUS_COLORS[s.status]}>{STATUS_LABELS[s.status]}</Badge>,
    },
    {
      key: "sold_at",
      label: "Data",
      sortable: true,
      render: (s) => <span className="text-sm text-slate-600">{formatDate(s.sold_at)}</span>,
    },
    {
      key: "items",
      label: "Itens",
      align: "right",
      render: (s) => (
        <span className="text-sm text-slate-600">
          {s.items.length} item{s.items.length !== 1 ? "s" : ""}
        </span>
      ),
    },
    {
      key: "total_amount",
      label: "Total",
      align: "right",
      render: (s) => (
        <span className="font-semibold text-slate-800">{formatCurrency(s.total_amount)}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (s) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(s)}>
          Detalhes
        </Button>
      ),
    },
  ]

  // A venda mostrada no painel é sempre a versão mais recente da lista (após reload).
  const selectedSale = selected
    ? data.items.find((s) => s.id === selected.id) ?? selected
    : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Status</Label>
          <Select
            value={status ?? ALL}
            onValueChange={(v) => onStatusChange(v === ALL ? undefined : (v as SaleStatus))}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ClearFiltersButton
          active={status !== undefined}
          onClear={() => onStatusChange(undefined)}
        />
      </div>

      <DataTable<Sale>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhuma venda encontrada"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={onPageChange}
        sort={sort}
        onSortChange={onSortChange}
        rowKey={(s) => s.id}
      />

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent size="table" className="w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes da venda</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {selectedSale && (
              <VendaCard
                key={selectedSale.id}
                sale={selectedSale}
                onChanged={onChanged}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
