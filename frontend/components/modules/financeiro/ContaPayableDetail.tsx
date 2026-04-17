"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { AccountsPayable } from "@/types/index"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { cancelarConta, pagarConta } from "@/services/financeiro"
import { StatusBadge } from "./StatusBadge"

interface ContaPayableDetailProps {
  conta: AccountsPayable | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

export function ContaPayableDetail({
  conta,
  open,
  onOpenChange,
  onChanged,
}: ContaPayableDetailProps) {
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  if (!conta) return null

  const isFinal = conta.status === "paga" || conta.status === "cancelada"

  async function handlePay() {
    if (!conta) return
    setPaying(true)
    try {
      await pagarConta(conta.id)
      toast.success("Conta paga com sucesso")
      onChanged()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao pagar conta"
      toast.error(message)
    } finally {
      setPaying(false)
    }
  }

  async function handleCancel() {
    if (!conta) return
    setCancelling(true)
    try {
      await cancelarConta(conta.id)
      toast.success("Conta cancelada")
      onChanged()
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao cancelar conta"
      toast.error(message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{conta.number}</SheetTitle>
          <SheetDescription>Detalhes da conta a pagar</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 text-sm">
          <DetailRow label="Status">
            <StatusBadge status={conta.status} />
          </DetailRow>
          <DetailRow label="Descrição">{conta.description}</DetailRow>
          <DetailRow label="Valor">{formatCurrency(conta.amount)}</DetailRow>
          <DetailRow label="Vencimento">{formatDate(conta.due_date)}</DetailRow>
          {conta.paid_at && (
            <DetailRow label="Pago em">{formatDateTime(conta.paid_at)}</DetailRow>
          )}
          {conta.notes && <DetailRow label="Observações">{conta.notes}</DetailRow>}
          <DetailRow label="Criada em">
            {formatDateTime(conta.created_at)}
          </DetailRow>
        </div>

        <div className="mt-8 flex flex-col gap-2">
          <Button
            onClick={handlePay}
            disabled={isFinal || paying}
            className="w-full"
          >
            {paying ? "Processando..." : "Pagar"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={isFinal || cancelling}
                className="w-full"
              >
                Cancelar conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar conta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é definitiva e a conta não poderá mais ser paga.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  )
}
