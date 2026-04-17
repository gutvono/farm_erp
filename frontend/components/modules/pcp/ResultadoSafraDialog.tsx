"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProductionResult } from "@/types/index"

interface ResultadoSafraDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: ProductionResult | null
}

export function ResultadoSafraDialog({
  open,
  onOpenChange,
  result,
}: ResultadoSafraDialogProps) {
  if (!result) return null

  const total = result.total_sacas
  const especial = result.especial_sacas
  const superior = result.superior_sacas
  const tradicional = result.tradicional_sacas

  const especialPct = total > 0 ? (especial / total) * 100 : 0
  const superiorPct = total > 0 ? (superior / total) * 100 : 0
  const tradicionalPct = total > 0 ? (tradicional / total) * 100 : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>🌱 Resultado da Safra</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Total destaque */}
          <div className="text-center py-4">
            <p className="text-slate-500 text-sm">Total produzido</p>
            <p className="text-5xl font-bold text-slate-900 mt-1">
              {total.toFixed(3)}
            </p>
            <p className="text-slate-500 text-sm mt-1">sacas de 60kg</p>
          </div>

          {/* Cards por qualidade */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-xs font-medium text-amber-700">Especial</p>
              <p className="text-2xl font-bold text-amber-900">{especial.toFixed(3)}</p>
              <p className="text-xs text-amber-600">{especialPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
              <p className="text-xs font-medium text-green-700">Superior</p>
              <p className="text-2xl font-bold text-green-900">{superior.toFixed(3)}</p>
              <p className="text-xs text-green-600">{superiorPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-xs font-medium text-slate-600">Tradicional</p>
              <p className="text-2xl font-bold text-slate-800">{tradicional.toFixed(3)}</p>
              <p className="text-xs text-slate-500">{tradicionalPct.toFixed(1)}%</p>
            </div>
          </div>

          {/* Barra de proporção */}
          <div className="h-4 rounded-full overflow-hidden flex">
            <div
              className="bg-amber-400"
              style={{ width: `${especialPct}%` }}
              title={`Especial: ${especialPct.toFixed(1)}%`}
            />
            <div
              className="bg-green-400"
              style={{ width: `${superiorPct}%` }}
              title={`Superior: ${superiorPct.toFixed(1)}%`}
            />
            <div
              className="bg-slate-300 flex-1"
              title={`Tradicional: ${tradicionalPct.toFixed(1)}%`}
            />
          </div>

          {/* Insumos consumidos */}
          {result.inputs_consumed.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Insumos consumidos</p>
              <div className="space-y-1">
                {result.inputs_consumed.map((inp) => (
                  <div
                    key={inp.id}
                    className="flex items-center justify-between text-sm text-slate-600 py-1 border-b last:border-0"
                  >
                    <span>{inp.stock_item_name}</span>
                    <span className="font-medium">
                      {inp.quantity} {inp.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alertas de estoque baixo */}
          {result.items_below_minimum.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-700 mb-1">
                ⚠️ Insumos abaixo do estoque mínimo:
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.items_below_minimum.map((name) => (
                  <li key={name} className="text-sm text-red-600">
                    {name}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-500 mt-1">
                Reponha estes insumos antes da próxima safra.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
