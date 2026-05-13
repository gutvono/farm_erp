"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { registrarColheita } from "@/services/pcp"
import { ProductionOrder, ProductionResult } from "@/types/index"

interface ColheitaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: ProductionOrder
  onSuccess: (result: ProductionResult) => void
}

export function ColheitaModal({ open, onOpenChange, order, onSuccess }: ColheitaModalProps) {
  const [percentage, setPercentage] = useState<number>(
    Math.min(50, 100 - order.harvest_progress)
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const remaining = 100 - order.harvest_progress
  const isFinal = percentage >= remaining

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPercentage(Math.min(Number(e.target.value), remaining))
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value)
    if (!isNaN(val)) setPercentage(Math.min(Math.max(0, val), remaining))
  }

  async function handleConfirm() {
    setLoading(true)
    setConfirmOpen(false)
    try {
      const result = await registrarColheita(order.id, percentage)
      const h = result.harvest
      toast.success(
        `Colheita #${h.harvest_number} registrada — ${h.sacks_total.toFixed(3)} sacas` +
          (result.items_below_minimum.length > 0
            ? ` · Estoque baixo: ${result.items_below_minimum.join(", ")}`
            : "")
      )
      onSuccess(result)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar colheita")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Colheita — {order.order_number}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1 text-sm text-slate-600">
              <p>
                Progresso atual:{" "}
                <span className="font-semibold text-slate-800">
                  {order.harvest_progress.toFixed(1)}%
                </span>
              </p>
              <p>
                Restante disponível:{" "}
                <span className="font-semibold text-slate-800">{remaining.toFixed(1)}%</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Percentual a colher</Label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={remaining}
                  step={1}
                  value={percentage}
                  onChange={handleSliderChange}
                  className="flex-1 accent-green-600"
                />
                <Input
                  type="number"
                  min={1}
                  max={remaining}
                  step={0.1}
                  value={percentage}
                  onChange={handleInputChange}
                  className="w-20 text-center"
                />
                <span className="text-slate-500 text-sm">%</span>
              </div>
            </div>

            {isFinal && (
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                Esta colheita <strong>finalizará</strong> a ordem (100%).
              </div>
            )}

            {!isFinal && (
              <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
                Após esta colheita: {(order.harvest_progress + percentage).toFixed(1)}% concluído
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={loading || percentage <= 0}
            >
              {loading ? "Registrando..." : "Confirmar colheita"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar colheita de {percentage.toFixed(1)}%?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso consumirá insumos proporcionais do estoque e registrará a entrada de café
              produzido. {isFinal ? "A ordem será marcada como concluída." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
