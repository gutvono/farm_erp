"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { updateVendaStatus } from "@/services/comercial"
import { Sale, SaleStatus } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

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

interface VendaCardProps {
  sale: Sale
  onChanged: () => void
}

export function VendaCard({ sale, onChanged }: VendaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<SaleStatus | null>(null)

  const isFinal = sale.status === "cancelada"

  async function confirmStatusChange() {
    if (!pendingStatus) return
    setUpdatingStatus(true)
    try {
      await updateVendaStatus(sale.id, pendingStatus)
      toast.success(
        pendingStatus === "entregue"
          ? "Venda marcada como entregue"
          : "Venda cancelada"
      )
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status")
    } finally {
      setUpdatingStatus(false)
      setPendingStatus(null)
    }
  }

  function getAvailableStatuses(): SaleStatus[] {
    if (sale.status === "realizada") return ["realizada", "entregue", "cancelada"]
    if (sale.status === "entregue") return ["entregue", "cancelada"]
    return ["cancelada"]
  }

  const availableStatuses = getAvailableStatuses()

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{sale.client_name}</span>
                <Badge className={STATUS_COLORS[sale.status]}>
                  {STATUS_LABELS[sale.status]}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {formatDate(sale.sold_at)} · {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}
                {" · "}
                <span className="font-medium text-slate-700">
                  {formatCurrency(sale.total_amount)}
                </span>
              </p>
              {sale.notes && (
                <p className="text-sm text-slate-500 mt-1 italic">{sale.notes}</p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Select
                value={sale.status}
                disabled={isFinal || updatingStatus}
                onValueChange={(v) => setPendingStatus(v as SaleStatus)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableStatuses.map((s) => (
                    <SelectItem key={s} value={s} disabled={s === sale.status}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="ghost" size="icon" onClick={() => setExpanded((v) => !v)}>
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preço Unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.stock_item_name}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    {formatCurrency(sale.total_amount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* AlertDialog: entregar */}
      <AlertDialog
        open={pendingStatus === "entregue"}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar entrega?</AlertDialogTitle>
            <AlertDialogDescription>
              A venda será marcada como entregue. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange} disabled={updatingStatus}>
              {updatingStatus ? "Processando..." : "Confirmar entrega"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: cancelar */}
      <AlertDialog
        open={pendingStatus === "cancelada"}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar venda?</AlertDialogTitle>
            <AlertDialogDescription>
              A venda será cancelada. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              disabled={updatingStatus}
              className="bg-red-600 hover:bg-red-700"
            >
              {updatingStatus ? "Cancelando..." : "Cancelar venda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
