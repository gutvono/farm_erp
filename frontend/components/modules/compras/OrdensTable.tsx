"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { OrdemCard } from "@/components/modules/compras/OrdemCard"
import { Paginated, PurchaseOrder, PurchaseOrderStatus, Supplier } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

const ALL = "all"

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  em_andamento: "Em andamento",
  aguardando_aprovacao_financeiro: "Aguardando aprovação",
  aprovada: "Aprovada",
  em_conferencia: "Em conferência",
  aguardando_pagamento: "Aguardando pagamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
}

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  em_andamento: "bg-blue-100 text-blue-800",
  aguardando_aprovacao_financeiro: "bg-yellow-100 text-yellow-800",
  aprovada: "bg-emerald-100 text-emerald-700",
  em_conferencia: "bg-orange-100 text-orange-800",
  aguardando_pagamento: "bg-purple-100 text-purple-800",
  concluida: "bg-green-700 text-white",
  cancelada: "bg-slate-100 text-slate-600",
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os status" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "aguardando_aprovacao_financeiro", label: "Aguardando aprovação" },
  { value: "aprovada", label: "Aprovada" },
  { value: "em_conferencia", label: "Em conferência" },
  { value: "aguardando_pagamento", label: "Aguardando pagamento" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
]

interface OrdensTableProps {
  data: Paginated<PurchaseOrder>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  search: string
  onSearchChange: (value: string) => void
  status: PurchaseOrderStatus | undefined
  onStatusChange: (status: PurchaseOrderStatus | undefined) => void
  suppliers: Supplier[]
  supplierId: string | undefined
  onSupplierChange: (supplierId: string | undefined) => void
  onChanged: () => void
}

export function OrdensTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  search,
  onSearchChange,
  status,
  onStatusChange,
  suppliers,
  supplierId,
  onSupplierChange,
  onChanged,
}: OrdensTableProps) {
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)

  const columns: DataTableColumn<PurchaseOrder>[] = [
    {
      key: "supplier_name",
      label: "Fornecedor",
      render: (o) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{o.supplier_name}</span>
          {o.order_type === "servico" && (
            <Badge className="bg-indigo-100 text-indigo-700">Serviço</Badge>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (o) => <Badge className={STATUS_COLORS[o.status]}>{STATUS_LABELS[o.status]}</Badge>,
    },
    {
      key: "ordered_at",
      label: "Data",
      sortable: true,
      render: (o) => <span className="text-sm text-slate-600">{formatDate(o.ordered_at)}</span>,
    },
    {
      key: "items",
      label: "Itens",
      align: "right",
      render: (o) =>
        o.order_type === "servico" ? (
          <span className="text-sm text-slate-400">—</span>
        ) : (
          <span className="text-sm text-slate-600">
            {o.items.length} item{o.items.length !== 1 ? "s" : ""}
          </span>
        ),
    },
    {
      key: "total_amount",
      label: "Total",
      align: "right",
      render: (o) => (
        <span className="font-semibold text-slate-800">{formatCurrency(o.total_amount)}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (o) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(o)}>
          Detalhes
        </Button>
      ),
    },
  ]

  const selectedOrder = selected
    ? data.items.find((o) => o.id === selected.id) ?? selected
    : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Buscar fornecedor</Label>
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Nome ou documento..."
            className="w-56"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Status</Label>
          <Select
            value={status ?? ALL}
            onValueChange={(v) =>
              onStatusChange(v === ALL ? undefined : (v as PurchaseOrderStatus))
            }
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

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Fornecedor</Label>
          <Select
            value={supplierId ?? ALL}
            onValueChange={(v) => onSupplierChange(v === ALL ? undefined : v)}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os fornecedores</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable<PurchaseOrder>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhuma ordem encontrada"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={onPageChange}
        sort={sort}
        onSortChange={onSortChange}
        rowKey={(o) => o.id}
      />

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes da ordem</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {selectedOrder && (
              <OrdemCard key={selectedOrder.id} order={selectedOrder} onChanged={onChanged} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
