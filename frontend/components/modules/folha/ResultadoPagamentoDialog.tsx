"use client"

import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PayrollBatchResult } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

interface ResultadoPagamentoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: PayrollBatchResult | null
}

export function ResultadoPagamentoDialog({
  open,
  onOpenChange,
  result,
}: ResultadoPagamentoDialogProps) {
  if (!result) return null

  const isSuccess = !result.insufficient_balance

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resultado do Pagamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {isSuccess ? (
              <CheckCircle2 className="h-10 w-10 text-green-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-10 w-10 text-yellow-600 flex-shrink-0" />
            )}
            <div>
              <p className="font-semibold text-slate-800">
                {isSuccess
                  ? "Pagamentos realizados com sucesso"
                  : "Pagamentos parciais — saldo insuficiente"}
              </p>
              <p className="text-sm text-slate-600">
                {result.paid_count} funcionário{result.paid_count !== 1 ? "s" : ""} pago
                {result.paid_count !== 1 ? "s" : ""} — Total:{" "}
                <strong>{formatCurrency(result.total_paid)}</strong>
              </p>
            </div>
          </div>

          {result.failed_employees.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-700 mb-1">
                Não foi possível pagar por saldo insuficiente:
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.failed_employees.map((name) => (
                  <li key={name} className="text-sm text-red-600">
                    {name}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-500 mt-2">
                Reforce o saldo da Conta Corrente e execute o pagamento novamente.
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
