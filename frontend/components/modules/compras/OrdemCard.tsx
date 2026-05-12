"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Lock, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import { enviarParaAprovacao, deleteOrdem } from "@/services/compras"
import { PurchaseOrder, PurchaseOrderStatus } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

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

interface OrdemCardProps {
  order: PurchaseOrder
  onChanged: () => void
}

export function OrdemCard({ order, onChanged }: OrdemCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [sendingApproval, setSendingApproval] = useState(false)
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function confirmSendApproval() {
    setSendingApproval(true)
    try {
      await enviarParaAprovacao(order.id)
      toast.success("Ordem enviada para aprovação financeira")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar para aprovação")
    } finally {
      setSendingApproval(false)
      setApprovalDialogOpen(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteOrdem(order.id)
      toast.success("Ordem excluída com sucesso")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir ordem")
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  const showReceiptTotal =
    order.status === "aguardando_pagamento" ||
    order.status === "concluida"

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{order.supplier_name}</span>
                <Badge className={STATUS_COLORS[order.status]}>
                  {STATUS_LABELS[order.status]}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {formatDate(order.ordered_at)} · {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                {" · "}
                <span className="font-medium text-slate-700">
                  {formatCurrency(order.total_amount)}
                </span>
                {showReceiptTotal && order.receipt_total_amount > 0 && (
                  <span className="ml-1 text-purple-700 font-medium">
                    · aceito: {formatCurrency(order.receipt_total_amount)}
                  </span>
                )}
              </p>
              {order.notes && (
                <p className="text-sm text-slate-500 mt-1 italic">{order.notes}</p>
              )}
              {order.financial_approval_note && order.status === "cancelada" && (
                <p className="text-sm text-red-600 mt-1">
                  Recusado: {order.financial_approval_note}
                </p>
              )}

              {/* Bloqueio aguardando aprovação */}
              {order.status === "aguardando_aprovacao_financeiro" && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Bloqueada para edição — para alterar, cancele e crie uma nova
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* em_andamento: Enviar + Excluir */}
              {order.status === "em_andamento" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setApprovalDialogOpen(true)}
                    disabled={sendingApproval}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Enviar para Aprovação
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deleting}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </>
              )}

              {/* aguardando_aprovacao_financeiro: cadeado */}
              {order.status === "aguardando_aprovacao_financeiro" && (
                <div
                  className="p-2 text-yellow-600"
                  title="Aguardando aprovação do financeiro"
                >
                  <Lock className="h-4 w-4" />
                </div>
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
                {order.items.map((item) => (
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
                    Total pedido
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    {formatCurrency(order.total_amount)}
                  </TableCell>
                </TableRow>
                {showReceiptTotal && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold text-purple-700">
                      Total aceito
                    </TableCell>
                    <TableCell className="text-right font-bold text-purple-700">
                      {formatCurrency(order.receipt_total_amount)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* AlertDialog: enviar para aprovação */}
      <AlertDialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar para aprovação financeira?</AlertDialogTitle>
            <AlertDialogDescription>
              Após enviada, a ordem ficará bloqueada para edição. Para alterações, cancele e crie
              uma nova ordem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSendApproval} disabled={sendingApproval}>
              {sendingApproval ? "Enviando..." : "Enviar para aprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: excluir */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ordem de compra?</AlertDialogTitle>
            <AlertDialogDescription>
              A ordem de <strong>{order.supplier_name}</strong> será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
