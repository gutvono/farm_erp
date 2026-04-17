"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import { deleteOrdem, produzirSafra } from "@/services/pcp"
import { ProductionOrder, ProductionResult } from "@/types/index"
import { formatDate } from "@/lib/utils"
import { ResultadoSafraDialog } from "./ResultadoSafraDialog"

const STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  em_producao: "Em Produção",
  concluida: "Concluída",
  cancelada: "Cancelada",
}

const STATUS_CLASS: Record<string, string> = {
  planejada: "bg-yellow-100 text-yellow-800 border-yellow-300",
  em_producao: "bg-blue-100 text-blue-800 border-blue-300",
  concluida: "bg-green-100 text-green-800 border-green-300",
  cancelada: "bg-slate-100 text-slate-600 border-slate-300",
}

interface OrdemProducaoCardProps {
  order: ProductionOrder
  onDeleted: () => void
  onProduced: () => void
}

export function OrdemProducaoCard({ order, onDeleted, onProduced }: OrdemProducaoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [produzirOpen, setProduzirOpen] = useState(false)
  const [producing, setProducing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState<ProductionResult | null>(null)
  const [resultOpen, setResultOpen] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteOrdem(order.id)
      toast.success("Ordem excluída com sucesso")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir ordem")
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  async function handleProduzir() {
    setProducing(true)
    setProduzirOpen(false)
    try {
      const res = await produzirSafra(order.id)
      setResult(res)
      setResultOpen(true)
      toast.success(
        `Safra produzida! ${res.total_sacas.toFixed(3)} sacas totais (Especial: ${res.especial_sacas.toFixed(3)}, Superior: ${res.superior_sacas.toFixed(3)}, Tradicional: ${res.tradicional_sacas.toFixed(3)})`
      )
      onProduced()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao produzir safra")
    } finally {
      setProducing(false)
    }
  }

  const isPlanejada = order.status === "planejada"

  const especial = order.especial_sacas
  const superior = order.superior_sacas
  const tradicional = order.tradicional_sacas
  const total = order.total_sacas
  const especialPct = total > 0 ? (especial / total) * 100 : 0
  const superiorPct = total > 0 ? (superior / total) * 100 : 0

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{order.plot_name}</span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[order.status] ?? ""}`}
                >
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              {order.planned_date && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Data planejada: {formatDate(order.planned_date)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isPlanejada && (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setExpanded((v) => !v)}>
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-4">
            {/* Insumos */}
            {order.inputs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Insumos</p>
                <div className="space-y-1">
                  {order.inputs.map((inp) => (
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

            {/* Resultado (quando concluída) */}
            {order.status === "concluida" && total > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-500">Resultado da Produção</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
                    <p className="text-xs text-amber-700">Especial</p>
                    <p className="text-lg font-bold text-amber-900">{especial.toFixed(3)}</p>
                    <p className="text-xs text-amber-600">{especialPct.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-center">
                    <p className="text-xs text-green-700">Superior</p>
                    <p className="text-lg font-bold text-green-900">{superior.toFixed(3)}</p>
                    <p className="text-xs text-green-600">{superiorPct.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                    <p className="text-xs text-slate-600">Tradicional</p>
                    <p className="text-lg font-bold text-slate-800">{tradicional.toFixed(3)}</p>
                    <p className="text-xs text-slate-500">
                      {total > 0 ? (100 - especialPct - superiorPct).toFixed(1) : "0.0"}%
                    </p>
                  </div>
                </div>
                <div className="h-3 rounded-full overflow-hidden flex">
                  <div className="bg-amber-400" style={{ width: `${especialPct}%` }} />
                  <div className="bg-green-400" style={{ width: `${superiorPct}%` }} />
                  <div className="bg-slate-300 flex-1" />
                </div>
                <p className="text-sm font-semibold text-slate-700 text-center">
                  Total: {total.toFixed(3)} sacas
                </p>
              </div>
            )}

            {order.notes && (
              <p className="text-sm text-slate-500 italic">{order.notes}</p>
            )}

            {/* Botão produzir */}
            {isPlanejada && (
              <Button
                className="w-full"
                disabled={producing}
                onClick={() => setProduzirOpen(true)}
              >
                {producing ? "Produzindo..." : "🌱 Produzir Safra"}
              </Button>
            )}
          </CardContent>
        )}
      </Card>

      {/* AlertDialog: confirmar produção */}
      <AlertDialog open={produzirOpen} onOpenChange={setProduzirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Produzir safra?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá consumir os insumos listados do estoque, gerar o resultado da colheita e
              inserir o café produzido no estoque. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleProduzir}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: confirmar exclusão */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ordem?</AlertDialogTitle>
            <AlertDialogDescription>
              A ordem de produção do talhão <strong>{order.plot_name}</strong> será excluída.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog resultado */}
      <ResultadoSafraDialog
        open={resultOpen}
        onOpenChange={setResultOpen}
        result={result}
      />
    </>
  )
}
