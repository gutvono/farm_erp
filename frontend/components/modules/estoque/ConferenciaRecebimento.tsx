"use client"

import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { finalizarConferencia } from "@/services/compras"
import { PurchaseOrderWithReceipts } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const itemSchema = z
  .object({
    purchase_order_item_id: z.string(),
    quantity_accepted: z.number().min(0, "Mínimo 0"),
    quantity_rejected: z.number().min(0, "Mínimo 0"),
    rejection_reason: z.string().optional(),
    quantity_ordered: z.number(),
    stock_item_name: z.string(),
    unit_price: z.number(),
  })
  .refine((v) => v.quantity_accepted + v.quantity_rejected <= v.quantity_ordered, {
    message: "Aceito + recusado não pode exceder o pedido",
    path: ["quantity_accepted"],
  })
  .refine(
    (v) => v.quantity_rejected === 0 || (v.rejection_reason && v.rejection_reason.trim().length > 0),
    {
      message: "Motivo obrigatório quando há recusa",
      path: ["rejection_reason"],
    }
  )

const schema = z.object({
  items: z.array(itemSchema),
})

type FormData = z.infer<typeof schema>

interface ConferenciaRecebimentoProps {
  order: PurchaseOrderWithReceipts
  onFinalized: () => void
}

export function ConferenciaRecebimento({ order, onFinalized }: ConferenciaRecebimentoProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingData, setPendingData] = useState<FormData | null>(null)

  const defaultItems = order.receipts.map((r) => ({
    purchase_order_item_id: r.purchase_order_item_id,
    quantity_accepted: r.quantity_accepted,
    quantity_rejected: r.quantity_rejected,
    rejection_reason: r.rejection_reason ?? "",
    quantity_ordered: r.quantity_ordered,
    stock_item_name: r.stock_item_name,
    unit_price: r.unit_price,
  }))

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { items: defaultItems },
  })

  const { fields } = useFieldArray({ control: undefined as never, name: "items" })
  void fields

  const watchedItems = watch("items")

  const receiptTotal = (watchedItems ?? []).reduce((sum, item) => {
    const accepted = Number(item?.quantity_accepted) || 0
    return sum + accepted * (item?.unit_price ?? 0)
  }, 0)

  const rejectedCount = (watchedItems ?? []).filter(
    (item) => (Number(item?.quantity_rejected) || 0) > 0
  ).length

  function onSubmit(data: FormData) {
    setPendingData(data)
    setConfirmOpen(true)
  }

  async function confirmFinalize() {
    if (!pendingData) return
    setSubmitting(true)
    try {
      await finalizarConferencia(
        order.id,
        pendingData.items.map((item) => ({
          purchase_order_item_id: item.purchase_order_item_id,
          quantity_accepted: item.quantity_accepted,
          quantity_rejected: item.quantity_rejected,
          rejection_reason: item.rejection_reason || undefined,
        }))
      )
      toast.success(
        `Conferência finalizada. Conta a pagar de ${formatCurrency(receiptTotal)} gerada no financeiro.`
      )
      if (rejectedCount > 0) {
        toast.warning(
          `${rejectedCount} item${rejectedCount !== 1 ? "s" : ""} serão devolvidos ao fornecedor. A nota de devolução será gerada após o pagamento.`
        )
      }
      onFinalized()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar conferência")
    } finally {
      setSubmitting(false)
      setConfirmOpen(false)
      setPendingData(null)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Pedido</TableHead>
                <TableHead className="text-right w-28">Aceito</TableHead>
                <TableHead className="text-right w-28">Recusado</TableHead>
                <TableHead className="w-56">Motivo recusa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.receipts.map((receipt, idx) => {
                const itemErrors = errors.items?.[idx]
                return (
                  <TableRow key={receipt.id}>
                    <TableCell className="font-medium">{receipt.stock_item_name}</TableCell>
                    <TableCell className="text-right text-slate-500">
                      {receipt.quantity_ordered}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-1">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          className="w-24 text-right"
                          {...register(`items.${idx}.quantity_accepted`, { valueAsNumber: true })}
                        />
                        {itemErrors?.quantity_accepted && (
                          <p className="text-xs text-red-600">
                            {itemErrors.quantity_accepted.message}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-1">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          className="w-24 text-right"
                          {...register(`items.${idx}.quantity_rejected`, { valueAsNumber: true })}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Input
                          type="text"
                          placeholder="Motivo (obrigatório se > 0)"
                          {...register(`items.${idx}.rejection_reason`)}
                        />
                        {itemErrors?.rejection_reason && (
                          <p className="text-xs text-red-600">
                            {itemErrors.rejection_reason.message}
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-slate-600">
            <Label>Total a pagar (itens aceitos):</Label>{" "}
            <span className="font-semibold text-slate-900">{formatCurrency(receiptTotal)}</span>
          </div>
          <Button type="submit">Finalizar Conferência</Button>
        </div>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar conferência?</AlertDialogTitle>
            <AlertDialogDescription>
              Uma conta a pagar de{" "}
              <strong>{formatCurrency(receiptTotal)}</strong> será gerada no financeiro com o valor
              dos itens aceitos.
              {rejectedCount > 0 && (
                <>
                  {" "}
                  {rejectedCount} item{rejectedCount !== 1 ? "s" : ""} será
                  {rejectedCount !== 1 ? "ão" : ""} devolvido{rejectedCount !== 1 ? "s" : ""} ao
                  fornecedor após o pagamento.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFinalize} disabled={submitting}>
              {submitting ? "Finalizando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
