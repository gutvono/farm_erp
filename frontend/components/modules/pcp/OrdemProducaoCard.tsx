"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Trash2, Wheat } from "lucide-react"
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
import { deleteOrdem, iniciarProducao } from "@/services/pcp"
import { ProductionOrder, ProductionResult } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ColheitaModal } from "./ColheitaModal"

const STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  em_producao: "Em Produção",
  em_execucao: "Em Execução",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
}

const STATUS_CLASS: Record<string, string> = {
  planejada: "bg-yellow-100 text-yellow-800 border-yellow-300",
  em_producao: "bg-blue-100 text-blue-800 border-blue-300",
  em_execucao: "bg-indigo-100 text-indigo-800 border-indigo-300",
  pausada: "bg-orange-100 text-orange-800 border-orange-300",
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
  const [iniciarOpen, setIniciarOpen] = useState(false)
  const [colheitaOpen, setColheitaOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [currentOrder, setCurrentOrder] = useState<ProductionOrder>(order)

  const isPlanejada = currentOrder.status === "planejada"
  const canHarvest =
    currentOrder.status === "em_execucao" || currentOrder.status === "pausada"

  const especial = currentOrder.especial_sacas
  const superior = currentOrder.superior_sacas
  const tradicional = currentOrder.tradicional_sacas
  const total = currentOrder.total_sacas
  const especialPct = total > 0 ? (especial / total) * 100 : 0
  const superiorPct = total > 0 ? (superior / total) * 100 : 0

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteOrdem(currentOrder.id)
      toast.success("Ordem excluída com sucesso")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir ordem")
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  async function handleIniciar() {
    setIniciando(true)
    try {
      const updated = await iniciarProducao(currentOrder.id)
      setCurrentOrder(updated)
      toast.success("Produção iniciada!")
      onProduced()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar produção")
    } finally {
      setIniciando(false)
      setIniciarOpen(false)
    }
  }

  function handleColheitaSuccess(result: ProductionResult) {
    setCurrentOrder(result.order)
    onProduced()
  }

  return (
    <>
      <Card className={`border-slate-200 ${currentOrder.is_overdue ? "border-l-4 border-l-red-400" : ""}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                  {currentOrder.order_number}
                </span>
                <span className="font-semibold text-slate-800">{currentOrder.plot_name}</span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[currentOrder.status] ?? ""}`}
                >
                  {STATUS_LABEL[currentOrder.status] ?? currentOrder.status}
                </span>
                {currentOrder.is_overdue && (
                  <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    Atrasada
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                {currentOrder.planned_date && (
                  <span>Planejada: {formatDate(currentOrder.planned_date)}</span>
                )}
                {currentOrder.start_date && (
                  <span>Início: {formatDate(currentOrder.start_date)}</span>
                )}
                {currentOrder.expected_end_date && (
                  <span>Término previsto: {formatDate(currentOrder.expected_end_date)}</span>
                )}
                {(() => {
                  const responsavel = currentOrder.workers.find((w) => w.is_responsible)
                  return responsavel ? (
                    <span>Resp.: {responsavel.employee_name}</span>
                  ) : null
                })()}
              </div>

              {/* Progress bar */}
              {currentOrder.harvest_progress > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Progresso colheita</span>
                    <span className="font-medium">{currentOrder.harvest_progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${currentOrder.harvest_progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {isPlanejada && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={iniciando}
                  onClick={() => setIniciarOpen(true)}
                  className="text-green-700 border-green-300 hover:bg-green-50"
                >
                  ▶ Iniciar Produção
                </Button>
              )}
              {canHarvest && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColheitaOpen(true)}
                  className="text-green-700 border-green-300 hover:bg-green-50"
                >
                  <Wheat className="h-4 w-4 mr-1" />
                  Registrar Colheita
                </Button>
              )}
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
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-4">
            {/* Custos */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border bg-slate-50 p-2 text-center">
                <p className="text-xs text-slate-500">Custo Insumos</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatCurrency(currentOrder.total_cost)}
                </p>
              </div>
              <div className="rounded-md border bg-slate-50 p-2 text-center">
                <p className="text-xs text-slate-500">Estimado</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatCurrency(currentOrder.estimated_cost)}
                </p>
              </div>
              <div className="rounded-md border bg-slate-50 p-2 text-center">
                <p className="text-xs text-slate-500">Realizado</p>
                <p className="text-sm font-semibold text-slate-800">
                  {currentOrder.realized_cost > 0
                    ? formatCurrency(currentOrder.realized_cost)
                    : "—"}
                </p>
              </div>
            </div>

            {/* Insumos */}
            {currentOrder.inputs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Insumos Planejados</p>
                <div className="space-y-1">
                  {currentOrder.inputs.map((inp) => (
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

            {/* Equipe */}
            {currentOrder.workers.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Equipe</p>
                <div className="space-y-1">
                  {currentOrder.workers.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between text-sm text-slate-600 py-1 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span>{w.employee_name}</span>
                        {w.is_responsible && (
                          <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                            Responsável
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        Salário snapshot: {formatCurrency(w.salary_snapshot)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Serviços Externos */}
            {currentOrder.services.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Serviços Externos</p>
                <div className="space-y-1">
                  {currentOrder.services.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-sm text-slate-600 py-1 border-b last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.description}</p>
                        <p className="text-xs text-slate-400">{s.supplier_name}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-medium">{formatCurrency(s.amount)}</p>
                        <p className="text-xs text-slate-400">
                          {s.accounts_payable_id ? (
                            <span className="text-green-600">AP gerada</span>
                          ) : (
                            <span className="text-yellow-600">Aguardando início</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histórico de colheitas */}
            {currentOrder.harvests.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">
                  Histórico de Colheitas ({currentOrder.harvests.length})
                </p>
                <div className="space-y-2">
                  {currentOrder.harvests.map((h) => (
                    <div
                      key={h.id}
                      className="rounded-md border border-green-100 bg-green-50 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-green-800">
                          Colheita #{h.harvest_number} — {h.percentage_harvested.toFixed(1)}%
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDate(h.harvested_at)}
                          {h.is_final && (
                            <span className="ml-2 text-green-700 font-medium">(Final)</span>
                          )}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-center text-xs">
                        <div>
                          <p className="text-slate-500">Total</p>
                          <p className="font-semibold text-slate-800">{h.sacks_total.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-amber-600">Especial</p>
                          <p className="font-semibold text-amber-800">{h.sacks_especial.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-green-600">Superior</p>
                          <p className="font-semibold text-green-800">{h.sacks_superior.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Tradicional</p>
                          <p className="font-semibold text-slate-700">{h.sacks_tradicional.toFixed(3)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resultado final (quando concluída) */}
            {currentOrder.status === "concluida" && total > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">Resultado Total da Produção</p>
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

            {currentOrder.notes && (
              <p className="text-sm text-slate-500 italic">{currentOrder.notes}</p>
            )}
          </CardContent>
        )}
      </Card>

      <ColheitaModal
        open={colheitaOpen}
        onOpenChange={setColheitaOpen}
        order={currentOrder}
        onSuccess={handleColheitaSuccess}
      />

      <AlertDialog open={iniciarOpen} onOpenChange={setIniciarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar produção?</AlertDialogTitle>
            <AlertDialogDescription>
              Iniciar produção neste talhão? O status mudará para{" "}
              <strong>Em execução</strong> e a colheita poderá ser registrada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleIniciar}
              disabled={iniciando}
              className="bg-green-600 hover:bg-green-700"
            >
              {iniciando ? "Iniciando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ordem?</AlertDialogTitle>
            <AlertDialogDescription>
              A ordem <strong>{currentOrder.order_number}</strong> do talhão{" "}
              <strong>{currentOrder.plot_name}</strong> será excluída. Esta ação não pode ser
              desfeita.
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
    </>
  )
}
