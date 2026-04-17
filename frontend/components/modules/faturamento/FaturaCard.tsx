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
import { updateFaturaStatus } from "@/services/faturamento"
import { Invoice, InvoiceStatus } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  emitida: "Emitida",
  paga: "Paga",
  cancelada: "Cancelada",
}

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  emitida: "bg-blue-100 text-blue-800",
  paga: "bg-green-100 text-green-800",
  cancelada: "bg-slate-100 text-slate-600",
}

interface FaturaCardProps {
  invoice: Invoice
  onChanged: () => void
}

export function FaturaCard({ invoice, onChanged }: FaturaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<InvoiceStatus | null>(null)

  const isFinal = invoice.status === "paga" || invoice.status === "cancelada"

  async function confirmStatusChange() {
    if (!pendingStatus) return
    setUpdating(true)
    try {
      await updateFaturaStatus(invoice.id, pendingStatus)
      toast.success(
        pendingStatus === "paga"
          ? "Fatura marcada como paga — movimentação registrada no financeiro"
          : "Fatura cancelada"
      )
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status")
    } finally {
      setUpdating(false)
      setPendingStatus(null)
    }
  }

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{invoice.number}</span>
                <Badge className={STATUS_COLORS[invoice.status]}>
                  {STATUS_LABELS[invoice.status]}
                </Badge>
                {invoice.sale_id && (
                  <Badge variant="outline" className="text-xs">
                    Gerada automaticamente
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-600 mt-0.5">{invoice.client_name}</p>
              <p className="text-sm text-slate-500">
                Emissão: {formatDate(invoice.issue_date)}
                {invoice.due_date && ` · Vencimento: ${formatDate(invoice.due_date)}`}
                {" · "}
                <span className="font-medium text-slate-700">
                  {formatCurrency(invoice.total_amount)}
                </span>
              </p>
              {invoice.notes && (
                <p className="text-sm text-slate-500 mt-1 italic">{invoice.notes}</p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Select
                value={invoice.status}
                disabled={isFinal || updating}
                onValueChange={(v) => setPendingStatus(v as InvoiceStatus)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emitida" disabled>
                    Emitida
                  </SelectItem>
                  <SelectItem value="paga">Paga</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
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
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preço Unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unit_price)}
                    </TableCell>
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
                    {formatCurrency(invoice.total_amount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* AlertDialog: marcar como paga */}
      <AlertDialog
        open={pendingStatus === "paga"}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A fatura <strong>{invoice.number}</strong> será marcada como paga e uma entrada
              será registrada no financeiro. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange} disabled={updating}>
              {updating ? "Processando..." : "Confirmar pagamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: cancelar fatura */}
      <AlertDialog
        open={pendingStatus === "cancelada"}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A fatura <strong>{invoice.number}</strong> será cancelada. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              disabled={updating}
              className="bg-red-600 hover:bg-red-700"
            >
              {updating ? "Cancelando..." : "Cancelar fatura"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
