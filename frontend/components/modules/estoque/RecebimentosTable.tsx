"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { ConferenciaRecebimento } from "@/components/modules/estoque/ConferenciaRecebimento"
import { iniciarConferencia } from "@/services/compras"
import { Paginated, PurchaseOrderWithReceipts } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

const STATUS_BADGE: Record<string, string> = {
  aprovada: "bg-emerald-100 text-emerald-700",
  em_conferencia: "bg-orange-100 text-orange-800",
}

const STATUS_LABEL: Record<string, string> = {
  aprovada: "Aprovada",
  em_conferencia: "Em conferência",
}

interface RecebimentosTableProps {
  data: Paginated<PurchaseOrderWithReceipts>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  /** Recarrega a lista de recebimentos. */
  onReload: () => void
  /** Disparado quando uma conferência é finalizada (recarrega itens/movimentos). */
  onFinalized: () => void
}

export function RecebimentosTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  onReload,
  onFinalized,
}: RecebimentosTableProps) {
  const [selected, setSelected] = useState<PurchaseOrderWithReceipts | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

  async function handleIniciar(order: PurchaseOrderWithReceipts) {
    setStarting(order.id)
    try {
      const updated = await iniciarConferencia(order.id)
      toast.success("Conferência iniciada")
      onReload()
      setSelected(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar conferência")
    } finally {
      setStarting(null)
    }
  }

  function handleFinalized() {
    setSelected(null)
    onFinalized()
  }

  const columns: DataTableColumn<PurchaseOrderWithReceipts>[] = [
    {
      key: "supplier_name",
      label: "Fornecedor",
      render: (o) => <span className="font-medium text-slate-800">{o.supplier_name}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (o) => (
        <Badge className={STATUS_BADGE[o.status] ?? ""}>
          {STATUS_LABEL[o.status] ?? o.status}
        </Badge>
      ),
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
      render: (o) => (
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
        <div className="flex justify-end">
          {o.status === "aprovada" ? (
            <Button
              size="sm"
              onClick={() => handleIniciar(o)}
              disabled={starting === o.id}
            >
              {starting === o.id ? "Iniciando..." : "Iniciar Conferência"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSelected(o)}>
              <ChevronDown className="h-4 w-4 mr-1" />
              Conferir itens
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <DataTable<PurchaseOrderWithReceipts>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhuma ordem aguardando conferência"
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
            <SheetTitle>
              Conferência de recebimento{selected ? ` — ${selected.supplier_name}` : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {selected && selected.status === "em_conferencia" && (
              <ConferenciaRecebimento order={selected} onFinalized={handleFinalized} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
