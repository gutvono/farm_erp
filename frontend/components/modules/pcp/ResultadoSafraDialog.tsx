"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getRelatorios } from "@/services/pcp"
import { CustoDiscriminado, ProductionResult } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

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
  const [discriminado, setDiscriminado] = useState<CustoDiscriminado | null>(null)
  const orderId = result?.order_id

  useEffect(() => {
    if (!open || !orderId) {
      setDiscriminado(null)
      return
    }
    let active = true
    getRelatorios()
      .then((report) => {
        if (!active) return
        const item = report.custo_previsto_vs_realizado.find(
          (r) => r.order_id === orderId
        )
        setDiscriminado(item ? item.custo_realizado_discriminado : null)
      })
      .catch(() => setDiscriminado(null))
    return () => {
      active = false
    }
  }, [open, orderId])

  if (!result) return null

  const h = result.harvest
  const total = h.sacks_total

  const destinos = [
    {
      key: "industria",
      label: "Indústria",
      value: h.sacks_industria,
      box: "border-amber-200 bg-amber-50",
      text: "text-amber-900",
      cap: "text-amber-700",
    },
    {
      key: "embalagem",
      label: "Embalagem",
      value: h.sacks_embalagem,
      box: "border-green-200 bg-green-50",
      text: "text-green-900",
      cap: "text-green-700",
    },
    {
      key: "descarte",
      label: "Descarte",
      value: h.sacks_descarte,
      box: "border-slate-200 bg-slate-50",
      text: "text-slate-800",
      cap: "text-slate-600",
    },
  ]

  const custoLinhas: { label: string; value: number }[] = discriminado
    ? [
        { label: "Insumos", value: discriminado.insumos },
        { label: "Pessoal", value: discriminado.pessoal },
        { label: "Máquinas", value: discriminado.maquinas },
        { label: "Embalagens", value: discriminado.embalagens },
        { label: "Serviços", value: discriminado.servicos },
      ]
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resultado da Colheita #{h.harvest_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="text-center py-2">
            <p className="text-slate-500 text-sm">Total produzido nesta colheita</p>
            <p className="text-4xl font-bold text-slate-900 mt-1">{total.toFixed(3)}</p>
            <p className="text-slate-500 text-sm mt-1">
              sacas de 60kg
              {h.hectares_harvested != null && (
                <> · {h.hectares_harvested.toFixed(2)} hectares colhidos</>
              )}
            </p>
          </div>

          {/* Produção por destino */}
          <div className="grid grid-cols-3 gap-3">
            {destinos.map((d) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0
              return (
                <div key={d.key} className={`rounded-lg border p-3 text-center ${d.box}`}>
                  <p className={`text-xs font-medium ${d.cap}`}>{d.label}</p>
                  <p className={`text-2xl font-bold ${d.text}`}>{d.value.toFixed(3)}</p>
                  <p className={`text-xs ${d.cap}`}>{pct.toFixed(1)}%</p>
                </div>
              )
            })}
          </div>

          {/* Custo discriminado (autoritativo, vindo dos relatórios) */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Custo discriminado</p>
            {discriminado ? (
              <div className="rounded-md border divide-y">
                {custoLinhas.map((l) => (
                  <div
                    key={l.label}
                    className="flex items-center justify-between px-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-600">{l.label}</span>
                    <span className="font-medium text-slate-800">
                      {formatCurrency(l.value)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 text-sm bg-slate-50">
                  <span className="font-semibold text-slate-700">Total</span>
                  <span className="font-bold text-slate-900">
                    {formatCurrency(discriminado.total)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Carregando custo...</p>
            )}
          </div>

          {result.items_below_minimum.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-700 mb-1">
                Insumos abaixo do estoque mínimo:
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.items_below_minimum.map((name) => (
                  <li key={name} className="text-sm text-red-600">
                    {name}
                  </li>
                ))}
              </ul>
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
