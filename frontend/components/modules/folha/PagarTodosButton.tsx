"use client"

import { useState } from "react"
import { Wallet } from "lucide-react"
import { toast } from "sonner"
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
} from "@/components/ui/alert-dialog"
import { pagarTodos } from "@/services/folha"
import { PayrollBatchResult, PayrollEntry } from "@/types/index"
import { formatCurrency } from "@/lib/utils"
import { ResultadoPagamentoDialog } from "./ResultadoPagamentoDialog"

interface PagarTodosButtonProps {
  periodId: string
  pendingEntries: PayrollEntry[]
  onSuccess: () => void
}

export function PagarTodosButton({
  periodId,
  pendingEntries,
  onSuccess,
}: PagarTodosButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [result, setResult] = useState<PayrollBatchResult | null>(null)
  const [loading, setLoading] = useState(false)

  const totalPending = pendingEntries.reduce((sum, e) => sum + e.total_amount, 0)

  async function handleConfirm() {
    setLoading(true)
    setConfirmOpen(false)
    try {
      const res = await pagarTodos(periodId)
      setResult(res)
      setResultOpen(true)
      if (res.insufficient_balance) {
        toast.warning(
          `${res.paid_count} pago(s) — ${res.failed_employees.length} sem saldo`
        )
      } else {
        toast.success(`${res.paid_count} funcionário(s) pago(s) com sucesso`)
      }
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao pagar holerites")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={loading || pendingEntries.length === 0}
        className="bg-green-600 hover:bg-green-700"
      >
        <Wallet className="h-4 w-4 mr-1" />
        {loading
          ? "Processando..."
          : `Pagar Todos (${formatCurrency(totalPending)})`}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pagar todos os funcionários pendentes?</AlertDialogTitle>
            <AlertDialogDescription>
              Total a pagar: <strong>{formatCurrency(totalPending)}</strong> em{" "}
              {pendingEntries.length} holerite{pendingEntries.length !== 1 ? "s" : ""}.
              O saldo da Conta Corrente será verificado para cada pagamento e os que não
              tiverem saldo serão listados ao final.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-green-600 hover:bg-green-700">
              Confirmar pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResultadoPagamentoDialog
        open={resultOpen}
        onOpenChange={setResultOpen}
        result={result}
      />
    </>
  )
}
