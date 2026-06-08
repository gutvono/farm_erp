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
import { CotacaoCard } from "@/components/modules/compras/CotacaoCard"
import { Paginated, Quotation, QuotationStatus, Supplier } from "@/types/index"
import { formatDate } from "@/lib/utils"

const ALL = "all"

const STATUS_LABELS: Record<QuotationStatus, string> = {
  em_andamento: "Em andamento",
  aguardando_aprovacao_financeiro: "Aguardando aprovação",
  aprovado_financeiro: "Aprovado financeiro",
  concluida: "Concluída",
  cancelada: "Cancelada",
}

const STATUS_COLORS: Record<QuotationStatus, string> = {
  em_andamento: "bg-blue-100 text-blue-800",
  aguardando_aprovacao_financeiro: "bg-yellow-100 text-yellow-800",
  aprovado_financeiro: "bg-emerald-100 text-emerald-700",
  concluida: "bg-green-700 text-white",
  cancelada: "bg-slate-100 text-slate-600",
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os status" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "aguardando_aprovacao_financeiro", label: "Aguardando aprovação" },
  { value: "aprovado_financeiro", label: "Aprovado financeiro" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
]

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os tipos" },
  { value: "produto", label: "Produto" },
  { value: "servico", label: "Serviço" },
]

interface CotacoesTableProps {
  data: Paginated<Quotation>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  status: QuotationStatus | undefined
  onStatusChange: (status: QuotationStatus | undefined) => void
  orderType: string | undefined
  onOrderTypeChange: (orderType: string | undefined) => void
  suppliers: Supplier[]
  onChanged: () => void
}

export function CotacoesTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  status,
  onStatusChange,
  orderType,
  onOrderTypeChange,
  suppliers,
  onChanged,
}: CotacoesTableProps) {
  const [selected, setSelected] = useState<Quotation | null>(null)

  const columns: DataTableColumn<Quotation>[] = [
    {
      key: "order_type",
      label: "Tipo",
      render: (q) => (
        <Badge
          className={
            q.order_type === "servico"
              ? "bg-indigo-100 text-indigo-700"
              : "bg-blue-100 text-blue-800"
          }
        >
          {q.order_type === "servico" ? "Serviço" : "Produto"}
        </Badge>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (q) => <Badge className={STATUS_COLORS[q.status]}>{STATUS_LABELS[q.status]}</Badge>,
    },
    {
      key: "created_at",
      label: "Data",
      sortable: true,
      render: (q) => <span className="text-sm text-slate-600">{formatDate(q.created_at)}</span>,
    },
    {
      key: "items",
      label: "Itens",
      align: "right",
      render: (q) =>
        q.order_type === "servico" ? (
          <span className="text-sm text-slate-400">—</span>
        ) : (
          <span className="text-sm text-slate-600">
            {q.items.length} item{q.items.length !== 1 ? "s" : ""}
          </span>
        ),
    },
    {
      key: "proposals",
      label: "Propostas",
      align: "right",
      render: (q) => <span className="text-sm text-slate-600">{q.proposals.length}</span>,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (q) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(q)}>
          Detalhes
        </Button>
      ),
    },
  ]

  const selectedQuotation = selected
    ? data.items.find((q) => q.id === selected.id) ?? selected
    : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Status</Label>
          <Select
            value={status ?? ALL}
            onValueChange={(v) =>
              onStatusChange(v === ALL ? undefined : (v as QuotationStatus))
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
          <Label className="text-xs text-slate-500">Tipo</Label>
          <Select
            value={orderType ?? ALL}
            onValueChange={(v) => onOrderTypeChange(v === ALL ? undefined : v)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable<Quotation>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhuma cotação encontrada"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={onPageChange}
        sort={sort}
        onSortChange={onSortChange}
        rowKey={(q) => q.id}
      />

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes da cotação</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {selectedQuotation && (
              <CotacaoCard
                key={selectedQuotation.id}
                quotation={selectedQuotation}
                suppliers={suppliers}
                onChanged={onChanged}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
