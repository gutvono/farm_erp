"use client"

import { useEffect, useState } from "react"
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
import { registrarColheita } from "@/services/pcp"
import { ProductionOrder, ProductionResult } from "@/types/index"

interface ColheitaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: ProductionOrder
  onSuccess: (result: ProductionResult) => void
}

export function ColheitaModal({ open, onOpenChange, order, onSuccess }: ColheitaModalProps) {
  const remaining = 100 - order.harvest_progress

  const [percentage, setPercentage] = useState<number>(Math.min(50, remaining))
  const [industria, setIndustria] = useState<number>(0)
  const [embalagem, setEmbalagem] = useState<number>(0)
  const [descarte, setDescarte] = useState<number>(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setPercentage(Math.min(50, 100 - order.harvest_progress))
      setIndustria(0)
      setEmbalagem(0)
      setDescarte(0)
    }
  }, [open, order.harvest_progress])

  const isFinal = percentage >= remaining
  const totalSacks = industria + embalagem + descarte
  // Hectares colhidos nesta etapa = (percentual / 100) × hectares da OP.
  const hectares = (percentage / 100) * order.hectares_used
  const canSubmit = percentage > 0 && percentage <= remaining && totalSacks > 0

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await registrarColheita(order.id, {
        percentage_harvested: percentage,
        sacks_industria: industria,
        sacks_embalagem: embalagem,
        sacks_descarte: descarte,
      })
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Colheita — {order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1 text-sm text-slate-600">
            <p>
              Progresso atual:{" "}
              <span className="font-semibold text-slate-800">
                {order.harvest_progress.toFixed(1)}%
              </span>{" "}
              · Restante:{" "}
              <span className="font-semibold text-slate-800">{remaining.toFixed(1)}%</span>
            </p>
            <p>
              Área da ordem:{" "}
              <span className="font-semibold text-slate-800">
                {order.hectares_used} ha
              </span>
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="colheita-pct">Percentual a colher *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="colheita-pct"
                type="number"
                min={1}
                max={remaining}
                step={0.1}
                value={percentage}
                onChange={(e) =>
                  setPercentage(
                    Math.min(Math.max(0, Number(e.target.value)), remaining)
                  )
                }
                className="w-28"
              />
              <span className="text-slate-500 text-sm">%</span>
              <span className="text-sm text-slate-600">
                = <strong>{hectares.toFixed(2)} hectares</strong>
              </span>
            </div>
          </div>

          {/* Sacas por destino (colheita determinística) */}
          <div className="space-y-2">
            <Label>Sacas por destino *</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="dest-industria" className="text-xs text-slate-500">
                  Indústria
                </Label>
                <Input
                  id="dest-industria"
                  type="number"
                  min={0}
                  step={0.001}
                  value={industria}
                  onChange={(e) => setIndustria(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dest-embalagem" className="text-xs text-slate-500">
                  Embalagem
                </Label>
                <Input
                  id="dest-embalagem"
                  type="number"
                  min={0}
                  step={0.001}
                  value={embalagem}
                  onChange={(e) => setEmbalagem(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dest-descarte" className="text-xs text-slate-500">
                  Descarte
                </Label>
                <Input
                  id="dest-descarte"
                  type="number"
                  min={0}
                  step={0.001}
                  value={descarte}
                  onChange={(e) => setDescarte(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Total: <strong>{totalSacks.toFixed(3)} sacas</strong>
            </p>
          </div>

          <div
            className={
              isFinal
                ? "rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800"
                : "rounded-md bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600"
            }
          >
            {isFinal
              ? "Esta colheita finalizará a ordem (100%)."
              : `Após esta colheita: ${(order.harvest_progress + percentage).toFixed(1)}% concluído`}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !canSubmit}>
            {loading ? "Registrando..." : "Confirmar colheita"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
