"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { realizarPedido } from "@/services/compras"
import { Quotation } from "@/types/index"
import { formatCurrency } from "@/lib/utils"
import { toISODate } from "@/lib/date"

function todayISO(): string {
  return toISODate(new Date())
}

interface RealizeOrderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quotation: Quotation
  onSuccess: () => void
}

export function RealizeOrderModal({
  open,
  onOpenChange,
  quotation,
  onSuccess,
}: RealizeOrderModalProps) {
  const [loading, setLoading] = useState(false)
  const [orderedAt, setOrderedAt] = useState(todayISO())
  const [notes, setNotes] = useState("")
  const [shippingCost, setShippingCost] = useState("")

  const isService = quotation.order_type === "servico"
  const winningProposal = quotation.proposals.find(
    (p) => p.id === quotation.winning_proposal_id
  )

  useEffect(() => {
    if (open) {
      setOrderedAt(todayISO())
      setNotes("")
      setShippingCost("")
    }
  }, [open])

  const itemRows = useMemo(() => {
    if (isService || !winningProposal) return []
    return quotation.items.map((item) => {
      const pi = winningProposal.proposal_items.find(
        (x) => x.quotation_item_id === item.id
      )
      const unitPrice = pi ? pi.unit_price : 0
      return {
        id: item.id,
        name: item.stock_item_name,
        quantity: item.quantity,
        unitPrice,
        subtotal: item.quantity * unitPrice,
      }
    })
  }, [isService, winningProposal, quotation.items])

  const itemsTotal = useMemo(
    () => itemRows.reduce((acc, r) => acc + r.subtotal, 0),
    [itemRows]
  )

  const shipping = Number(shippingCost) || 0
  const estimatedTotal = itemsTotal + shipping

  async function handleSubmit() {
    setLoading(true)
    try {
      await realizarPedido(quotation.id, {
        ordered_at: orderedAt || undefined,
        notes: notes.trim() || undefined,
        shipping_cost: !isService && shipping > 0 ? shipping : undefined,
      })
      toast.success(
        isService
          ? "Pedido realizado — NF de serviço emitida; ordem aguardando pagamento."
          : "Pedido realizado! Ordem de compra criada e aprovada, pronta para conferência."
      )
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao realizar pedido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Realizar Pedido</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Resumo da proposta vencedora */}
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Fornecedor vencedor:{" "}
              <strong>{winningProposal?.supplier_name ?? "—"}</strong>
            </p>

            {isService ? (
              <div className="space-y-2 rounded-md border p-3">
                {quotation.service_description && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Descrição do serviço</p>
                    <p className="text-sm text-slate-700">{quotation.service_description}</p>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-sm font-semibold text-slate-700">Valor total</span>
                  <span className="text-base font-bold text-slate-900">
                    {formatCurrency(winningProposal?.total_price ?? 0)}
                  </span>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Preço Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(r.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(r.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Campos editáveis */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="ordered_at">Data do pedido</Label>
              <DatePicker
                id="ordered_at"
                value={orderedAt}
                onChange={setOrderedAt}
              />
            </div>
            {!isService && (
              <div className="space-y-1">
                <Label htmlFor="shipping_cost">Valor do Transporte (R$)</Label>
                <Input
                  id="shipping_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="realize-notes">Observações</Label>
            <Input
              id="realize-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais..."
            />
          </div>

          {!isService && (
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-semibold text-slate-700">
                Total estimado
              </span>
              <span className="text-lg font-bold text-slate-900">
                {formatCurrency(estimatedTotal)}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Realizando..." : "Realizar pedido"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
