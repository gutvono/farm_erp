"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, FileText, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import { cancelarVenda, updateVendaStatus } from "@/services/comercial"
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
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<SaleStatus | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  const isCancelled = sale.status === "cancelada"

  function verNotasFiscais() {
    router.push(`/faturamento?sale_id=${sale.id}`)
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return
    setUpdatingStatus(true)
    try {
      await updateVendaStatus(sale.id, pendingStatus)
      toast.success("Venda marcada como entregue")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status")
    } finally {
      setUpdatingStatus(false)
      setPendingStatus(null)
    }
  }

  async function confirmCancel() {
    setCancelling(true)
    try {
      await cancelarVenda(sale.id, cancelReason)
      toast.success("Venda cancelada — estoque e financeiro estornados")
      onChanged()
      setCancelOpen(false)
      setCancelReason("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar venda")
    } finally {
      setCancelling(false)
    }
  }

  // O cancelamento deixou de ser uma troca de status (Demanda 7): a única
  // transição de status pela UI é Realizada → Entregue. Cancelar é a ação
  // dedicada "Cancelar venda", que estorna estoque e financeiro.
  function getAvailableStatuses(): SaleStatus[] {
    if (sale.status === "realizada") return ["realizada", "entregue"]
    if (sale.status === "entregue") return ["entregue"]
    return ["cancelada"]
  }

  const availableStatuses = getAvailableStatuses()

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-[200px]">
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
                disabled={isCancelled || availableStatuses.length <= 1 || updatingStatus}
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

              <Button size="sm" variant="outline" onClick={verNotasFiscais}>
                <FileText className="h-3.5 w-3.5 mr-1" />
                Ver notas fiscais
              </Button>

              {!isCancelled && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => setCancelOpen(true)}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Cancelar venda
                </Button>
              )}

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

      {/* AlertDialog: cancelar venda (estorno ponta a ponta) */}
      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (cancelling) return
          setCancelOpen(open)
          if (!open) setCancelReason("")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar venda de {sale.client_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cancelamento <strong>estorna o estoque e o financeiro</strong>: devolve os itens
              ao estoque, cancela <strong>todas</strong> as notas fiscais da venda e baixa{" "}
              <strong>todas</strong> as contas a receber. Esta ação é{" "}
              <strong>irreversível</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`cancel-reason-${sale.id}`}>Motivo (opcional)</Label>
            <Input
              id={`cancel-reason-${sale.id}`}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex.: desistência do cliente, erro no pedido…"
              disabled={cancelling}
            />
          </div>

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={verNotasFiscais}
              disabled={cancelling}
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              Ver notas fiscais antes
            </Button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmCancel()
              }}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelling ? "Cancelando..." : "Cancelar venda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
