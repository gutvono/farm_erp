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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { AccountsReceivable } from "@/types/index"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import {
  marcarInadimplente,
  receberConta,
  reverterInadimplencia,
} from "@/services/financeiro"
import { StatusBadge } from "./StatusBadge"

interface ContaReceivableDetailProps {
  conta: AccountsReceivable | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

export function ContaReceivableDetail({
  conta,
  open,
  onOpenChange,
  onChanged,
}: ContaReceivableDetailProps) {
  const [receivedValue, setReceivedValue] = useState("")
  const [receiving, setReceiving] = useState(false)
  const [defaulting, setDefaulting] = useState(false)
  const [reverting, setReverting] = useState(false)

  if (!conta) return null

  const outstanding = conta.amount - conta.amount_received
  const canReceive =
    conta.status === "em_aberto" || conta.status === "parcialmente_pago"
  const canMarkDefaulter = canReceive
  const canRevert = conta.status === "cancelada"

  async function handleReceive() {
    if (!conta) return
    const value = Number(receivedValue)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor maior que zero")
      return
    }
    if (value > outstanding) {
      toast.error(
        `Valor não pode exceder o saldo devedor (${formatCurrency(outstanding)})`
      )
      return
    }
    setReceiving(true)
    try {
      await receberConta(conta.id, value)
      toast.success("Recebimento registrado")
      setReceivedValue("")
      onChanged()
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao registrar recebimento"
      toast.error(message)
    } finally {
      setReceiving(false)
    }
  }

  async function handleDefaulter() {
    if (!conta) return
    setDefaulting(true)
    try {
      await marcarInadimplente(conta.id)
      toast.success("Cliente marcado como inadimplente")
      onChanged()
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao marcar inadimplência"
      toast.error(message)
    } finally {
      setDefaulting(false)
    }
  }

  async function handleRevert() {
    if (!conta) return
    setReverting(true)
    try {
      await reverterInadimplencia(conta.id)
      toast.success("Inadimplência revertida")
      onChanged()
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao reverter inadimplência"
      toast.error(message)
    } finally {
      setReverting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{conta.number}</SheetTitle>
          <SheetDescription>Detalhes da conta a receber</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 text-sm">
          <DetailRow label="Status">
            <StatusBadge status={conta.status} />
          </DetailRow>
          <DetailRow label="Descrição">{conta.description}</DetailRow>
          <DetailRow label="Valor total">
            {formatCurrency(conta.amount)}
          </DetailRow>
          <DetailRow label="Recebido">
            {formatCurrency(conta.amount_received)}
          </DetailRow>
          <DetailRow label="Saldo devedor">
            {formatCurrency(outstanding)}
          </DetailRow>
          <DetailRow label="Vencimento">
            {formatDate(conta.due_date)}
          </DetailRow>
          {conta.received_at && (
            <DetailRow label="Último recebimento">
              {formatDateTime(conta.received_at)}
            </DetailRow>
          )}
          {conta.notes && (
            <DetailRow label="Observações">{conta.notes}</DetailRow>
          )}
          <DetailRow label="Criada em">
            {formatDateTime(conta.created_at)}
          </DetailRow>
        </div>

        {canReceive && (
          <div className="mt-6 space-y-2 rounded-lg border border-slate-200 p-4">
            <Label htmlFor="received-value">Valor recebido (R$)</Label>
            <Input
              id="received-value"
              type="number"
              step="0.01"
              min="0"
              value={receivedValue}
              onChange={(e) => setReceivedValue(e.target.value)}
              placeholder="0.00"
            />
            <Button
              onClick={handleReceive}
              disabled={receiving}
              className="w-full"
            >
              {receiving ? "Processando..." : "Confirmar recebimento"}
            </Button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {canMarkDefaulter && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={defaulting}
                  className="w-full"
                >
                  Cliente não vai pagar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Marcar como inadimplente?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso marcará o cliente como inadimplente. Deseja continuar?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDefaulter}
                    disabled={defaulting}
                  >
                    {defaulting ? "Processando..." : "Confirmar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {canRevert && (
            <Button
              variant="outline"
              onClick={handleRevert}
              disabled={reverting}
              className="w-full"
            >
              {reverting ? "Processando..." : "Reverter inadimplência"}
            </Button>
          )}
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
