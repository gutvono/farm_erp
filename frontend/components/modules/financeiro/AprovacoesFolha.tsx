"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { aprovarFolha, recusarFolha } from "@/services/financeiro"
import { PayrollPaymentRequest } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

interface AprovacoesFolhaProps {
  requests: PayrollPaymentRequest[]
  loading: boolean
  onChanged: () => void
}

export function AprovacoesFolha({
  requests,
  loading,
  onChanged,
}: AprovacoesFolhaProps) {
  const [approveTarget, setApproveTarget] =
    useState<PayrollPaymentRequest | null>(null)
  const [approving, setApproving] = useState(false)
  const [refuseTarget, setRefuseTarget] =
    useState<PayrollPaymentRequest | null>(null)
  const [refuseNote, setRefuseNote] = useState("")
  const [refusing, setRefusing] = useState(false)

  async function handleConfirmApprove() {
    if (!approveTarget) return
    setApproving(true)
    try {
      await aprovarFolha(approveTarget.id)
      toast.success(
        `Pagamento de folha ${approveTarget.competency} aprovado — NFs emitidas`
      )
      setApproveTarget(null)
      onChanged()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao aprovar pagamento de folha"
      )
    } finally {
      setApproving(false)
    }
  }

  async function handleConfirmRefuse() {
    if (!refuseTarget || !refuseNote.trim()) return
    setRefusing(true)
    try {
      await recusarFolha(refuseTarget.id, refuseNote.trim())
      toast.success("Pagamento de folha recusado — holerites voltaram a pendente")
      setRefuseTarget(null)
      setRefuseNote("")
      onChanged()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao recusar pagamento de folha"
      )
    } finally {
      setRefusing(false)
    }
  }

  return (
    <>
      <CollapsibleSection
        title="Pagamentos de Folha Aguardando Aprovação"
        count={requests.length}
      >
        {loading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum pagamento de folha aguardando aprovação
          </p>
        ) : (
          requests.map((req) => (
            <Card key={req.id} className="border-yellow-200">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">
                        Folha {req.competency}
                      </span>
                      <Badge
                        className={
                          req.request_type === "lote"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }
                      >
                        {req.request_type === "lote" ? "Lote" : "Individual"}
                      </Badge>
                      <Badge className="bg-yellow-100 text-yellow-800">
                        Aguardando aprovação
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {req.entries.length} holerite
                      {req.entries.length !== 1 ? "s" : ""} ·{" "}
                      <span className="font-medium text-slate-700">
                        {formatCurrency(req.total_amount)}
                      </span>
                    </p>
                    <div className="mt-2 space-y-0.5">
                      {req.entries.map((e) => (
                        <p key={e.entry_id} className="text-xs text-slate-500">
                          {e.employee_name} — {formatCurrency(e.net_amount)}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => setApproveTarget(req)}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setRefuseNote("")
                        setRefuseTarget(req)
                      }}
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </CollapsibleSection>

      {/* AlertDialog: aprovar pagamento de folha */}
      <AlertDialog
        open={approveTarget !== null}
        onOpenChange={(open) => !open && setApproveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar pagamento de folha?</AlertDialogTitle>
            <AlertDialogDescription>
              Total a pagar:{" "}
              <strong>{formatCurrency(approveTarget?.total_amount ?? 0)}</strong>{" "}
              em {approveTarget?.entries.length ?? 0} holerite
              {(approveTarget?.entries.length ?? 0) !== 1 ? "s" : ""}. O valor
              sairá da Conta Corrente e será emitida{" "}
              <strong>uma nota fiscal de folha por funcionário</strong>. Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmApprove()
              }}
              disabled={approving}
              className="bg-green-600 hover:bg-green-700"
            >
              {approving ? "Aprovando..." : "Confirmar aprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: recusar pagamento de folha (motivo obrigatório) */}
      <Dialog
        open={refuseTarget !== null}
        onOpenChange={(open) => {
          if (refusing) return
          if (!open) {
            setRefuseTarget(null)
            setRefuseNote("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar pagamento de folha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-600">
              Folha <strong>{refuseTarget?.competency}</strong> ·{" "}
              {formatCurrency(refuseTarget?.total_amount ?? 0)}. Os holerites
              voltarão a <strong>pendente</strong> e nenhum valor sairá da conta.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="refuse-folha-note">Motivo da recusa *</Label>
              <Input
                id="refuse-folha-note"
                value={refuseNote}
                onChange={(e) => setRefuseNote(e.target.value)}
                placeholder="Descreva o motivo..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRefuseTarget(null)}
                disabled={refusing}
              >
                Cancelar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                disabled={!refuseNote.trim() || refusing}
                onClick={handleConfirmRefuse}
              >
                {refusing ? "Recusando..." : "Confirmar recusa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
