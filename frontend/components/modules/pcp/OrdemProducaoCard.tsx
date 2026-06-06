"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Trash2, Wheat, Ban } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deleteOrdem, encerrarOrdem, iniciarProducao } from "@/services/pcp"
import { ProductionOrder, ProductionResult, SystemRole } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ColheitaModal } from "./ColheitaModal"
import { ResultadoSafraDialog } from "./ResultadoSafraDialog"

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

const CONTRACT_LABEL: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  temporario: "Temporário",
}

const RESOURCE_ROLE_LABEL: Record<SystemRole, string> = {
  maquina: "Máquina",
  veiculo: "Veículo",
  embalagem: "Embalagem",
  insumo: "Insumo",
  produto_final: "Produto final",
  produto_inacabado: "Produto inacabado",
  produto_descartado: "Produto descartado",
  produto_vendavel: "Produto vendável",
}

const RESERVABLE: SystemRole[] = ["maquina", "veiculo"]

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
  const [encerrarOpen, setEncerrarOpen] = useState(false)
  const [encerrarReason, setEncerrarReason] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [resultData, setResultData] = useState<ProductionResult | null>(null)
  const [currentOrder, setCurrentOrder] = useState<ProductionOrder>(order)

  const isPlanejada = currentOrder.status === "planejada"
  const canHarvest =
    currentOrder.status === "em_execucao" || currentOrder.status === "pausada"
  const canEncerrar =
    currentOrder.status === "em_execucao" ||
    currentOrder.status === "pausada" ||
    currentOrder.status === "em_producao"

  const total = currentOrder.total_sacas

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

  async function handleEncerrar() {
    if (!encerrarReason.trim()) return
    setEncerrando(true)
    try {
      const updated = await encerrarOrdem(currentOrder.id, encerrarReason.trim())
      setCurrentOrder(updated)
      toast.success("Ordem encerrada (praga). Status: concluída.")
      setEncerrarOpen(false)
      setEncerrarReason("")
      onProduced()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao encerrar ordem")
    } finally {
      setEncerrando(false)
    }
  }

  function handleColheitaSuccess(result: ProductionResult) {
    // Atualiza o card localmente e abre o diálogo de resultado. NÃO recarrega a
    // lista aqui: o reload mostraria o spinner e desmontaria este card (e o
    // diálogo junto). O refresh acontece quando o diálogo de resultado fecha.
    setCurrentOrder(result.order)
    setResultData(result)
    setResultOpen(true)
  }

  function handleResultOpenChange(o: boolean) {
    setResultOpen(o)
    if (!o) onProduced()
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
                <Badge variant="outline" className="text-xs">
                  {currentOrder.hectares_used} ha
                </Badge>
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
              </div>

              {currentOrder.early_closed_reason && (
                <p className="mt-1 text-xs text-red-600">
                  Encerrada por praga: {currentOrder.early_closed_reason}
                </p>
              )}

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
              {canEncerrar && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEncerrarReason("")
                    setEncerrarOpen(true)
                  }}
                  className="text-red-700 border-red-300 hover:bg-red-50"
                >
                  <Ban className="h-4 w-4 mr-1" />
                  Encerrar (praga)
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
                <p className="text-xs font-medium text-slate-500 mb-1">Insumos</p>
                <div className="space-y-1">
                  {currentOrder.inputs.map((inp) => (
                    <div
                      key={inp.id}
                      className="flex items-center justify-between text-sm text-slate-600 py-1 border-b last:border-0"
                    >
                      <span>
                        <span className="font-mono text-xs text-slate-400">{inp.sku}</span>{" "}
                        {inp.stock_item_name}
                      </span>
                      <span className="font-medium">
                        {inp.quantity} {inp.unit} · {formatCurrency(inp.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Requisitos por cargo */}
            {currentOrder.position_requirements.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Equipe (requisitos por cargo)</p>
                <div className="space-y-1">
                  {currentOrder.position_requirements.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between text-sm text-slate-600 py-1 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span>{r.position_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {CONTRACT_LABEL[r.contract_type] ?? r.contract_type}
                        </Badge>
                      </div>
                      <span className="text-xs text-slate-500">
                        {r.quantity}× · base {formatCurrency(r.base_salary)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recursos */}
            {currentOrder.resources.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Recursos</p>
                <div className="space-y-1">
                  {currentOrder.resources.map((res) => {
                    const reservable = RESERVABLE.includes(res.resource_role)
                    return (
                      <div
                        key={res.id}
                        className="flex items-center justify-between text-sm text-slate-600 py-1 border-b last:border-0"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">
                            <span className="font-mono text-xs text-slate-400">{res.sku}</span>{" "}
                            {res.stock_item_name}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {RESOURCE_ROLE_LABEL[res.resource_role]}
                          </Badge>
                          {reservable && (
                            <Badge className="bg-indigo-100 text-indigo-700 text-xs">
                              reservado
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 flex-shrink-0">
                          {reservable
                            ? `${res.accumulated_hours}h · ${formatCurrency(res.cost)}`
                            : `${res.quantity ?? 0} ${res.unit}`}
                        </span>
                      </div>
                    )
                  })}
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

            {/* Histórico de colheitas (por destino) */}
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
                          {h.hectares_harvested != null && (
                            <span className="text-green-600"> · {h.hectares_harvested.toFixed(2)} ha</span>
                          )}
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
                          <p className="text-amber-600">Indústria</p>
                          <p className="font-semibold text-amber-800">{h.sacks_industria.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-green-600">Embalagem</p>
                          <p className="font-semibold text-green-800">{h.sacks_embalagem.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Descarte</p>
                          <p className="font-semibold text-slate-700">{h.sacks_descarte.toFixed(3)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resultado total (concluída) por destino */}
            {currentOrder.status === "concluida" && total > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">Resultado Total da Produção</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
                    <p className="text-xs text-amber-700">Indústria</p>
                    <p className="text-lg font-bold text-amber-900">{currentOrder.industria_sacas.toFixed(3)}</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-center">
                    <p className="text-xs text-green-700">Embalagem</p>
                    <p className="text-lg font-bold text-green-900">{currentOrder.embalagem_sacas.toFixed(3)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                    <p className="text-xs text-slate-600">Descarte</p>
                    <p className="text-lg font-bold text-slate-800">{currentOrder.descarte_sacas.toFixed(3)}</p>
                  </div>
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

      <ResultadoSafraDialog
        open={resultOpen}
        onOpenChange={handleResultOpenChange}
        result={resultData}
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

      <Dialog
        open={encerrarOpen}
        onOpenChange={(o) => {
          if (encerrando) return
          setEncerrarOpen(o)
          if (!o) setEncerrarReason("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar ordem por praga</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-600">
              A ordem <strong>{currentOrder.order_number}</strong> será{" "}
              <strong>concluída</strong> antes de 100%, liberando os recursos e a área
              restante. Informe o motivo (ex.: praga, geada).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={`encerrar-reason-${currentOrder.id}`}>Motivo *</Label>
              <Input
                id={`encerrar-reason-${currentOrder.id}`}
                value={encerrarReason}
                onChange={(e) => setEncerrarReason(e.target.value)}
                placeholder="Descreva o motivo do encerramento..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEncerrarOpen(false)} disabled={encerrando}>
                Cancelar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                disabled={!encerrarReason.trim() || encerrando}
                onClick={handleEncerrar}
              >
                {encerrando ? "Encerrando..." : "Confirmar encerramento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
