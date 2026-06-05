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
import { solicitarPagamentoTodos } from "@/services/folha"
import { PayrollEntry } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

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
  const [loading, setLoading] = useState(false)

  const totalPending = pendingEntries.reduce((sum, e) => sum + e.total_amount, 0)

  async function handleConfirm() {
    setLoading(true)
    setConfirmOpen(false)
    try {
      await solicitarPagamentoTodos(periodId)
      toast.success("Enviado para aprovação do financeiro")
      onSuccess()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao solicitar pagamento"
      )
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
          : `Solicitar pagamento de todos (${formatCurrency(totalPending)})`}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Solicitar pagamento de todos os pendentes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Será criada uma única solicitação de{" "}
              <strong>{formatCurrency(totalPending)}</strong> em{" "}
              {pendingEntries.length} holerite
              {pendingEntries.length !== 1 ? "s" : ""}. Os holerites ficam{" "}
              <strong>aguardando aprovação do financeiro</strong> e o pagamento só
              é efetivado após a aprovação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-green-600 hover:bg-green-700"
            >
              Solicitar pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
