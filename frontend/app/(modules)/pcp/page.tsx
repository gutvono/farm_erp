"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { RootLayout } from "@/components/layout/RootLayout"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AtividadeForm } from "@/components/modules/pcp/AtividadeForm"
import { OrdemProducaoCard } from "@/components/modules/pcp/OrdemProducaoCard"
import { OrdemProducaoForm } from "@/components/modules/pcp/OrdemProducaoForm"
import { TalhaoCard } from "@/components/modules/pcp/TalhaoCard"
import { TalhaoForm } from "@/components/modules/pcp/TalhaoForm"
import { getAtividades, getOrdens, getTalhoes } from "@/services/pcp"
import { getItens } from "@/services/estoque"
import { Plot, PlotActivity, ProductionOrder, StockItem } from "@/types/index"
import { formatDate, formatCurrency } from "@/lib/utils"

const ACTIVITY_LABELS: Record<string, string> = {
  plantio: "Plantio",
  adubacao: "Adubação",
  poda: "Poda",
  colheita: "Colheita",
  irrigacao: "Irrigação",
  outra: "Outra",
}

const ORDEM_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "planejada", label: "Planejada" },
  { value: "em_producao", label: "Em Produção" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
]

export default function PCPPage() {
  // Ordens
  const [ordens, setOrdens] = useState<ProductionOrder[]>([])
  const [ordensLoading, setOrdensLoading] = useState(false)
  const [ordemStatusFilter, setOrdemStatusFilter] = useState("all")
  const [ordemFormOpen, setOrdemFormOpen] = useState(false)

  // Talhões
  const [plots, setPlots] = useState<Plot[]>([])
  const [plotsLoading, setPlotsLoading] = useState(false)
  const [talhaoFormOpen, setTalhaoFormOpen] = useState(false)
  const [editingPlot, setEditingPlot] = useState<Plot | null>(null)

  // Atividades
  const [atividades, setAtividades] = useState<PlotActivity[]>([])
  const [atividadesLoading, setAtividadesLoading] = useState(false)
  const [atividadePlotFilter, setAtividadePlotFilter] = useState("all")
  const [atividadeFormOpen, setAtividadeFormOpen] = useState(false)

  // Insumos (para OrdemProducaoForm)
  const [insumos, setInsumos] = useState<StockItem[]>([])

  const loadOrdens = useCallback(async () => {
    setOrdensLoading(true)
    try {
      const data = await getOrdens(ordemStatusFilter !== "all" ? ordemStatusFilter : undefined)
      setOrdens(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar ordens")
    } finally {
      setOrdensLoading(false)
    }
  }, [ordemStatusFilter])

  const loadPlots = useCallback(async () => {
    setPlotsLoading(true)
    try {
      const data = await getTalhoes()
      setPlots(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar talhões")
    } finally {
      setPlotsLoading(false)
    }
  }, [])

  const loadAtividades = useCallback(async () => {
    setAtividadesLoading(true)
    try {
      const data = await getAtividades(
        atividadePlotFilter !== "all" ? atividadePlotFilter : undefined
      )
      setAtividades(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar atividades")
    } finally {
      setAtividadesLoading(false)
    }
  }, [atividadePlotFilter])

  useEffect(() => { loadOrdens() }, [loadOrdens])
  useEffect(() => { loadPlots() }, [loadPlots])
  useEffect(() => { loadAtividades() }, [loadAtividades])

  useEffect(() => {
    getItens({ category: "insumo" }).then(setInsumos).catch(() => {})
  }, [])

  function handleEditPlot(plot: Plot) {
    setEditingPlot(plot)
    setTalhaoFormOpen(true)
  }

  function handleNewPlot() {
    setEditingPlot(null)
    setTalhaoFormOpen(true)
  }

  return (
    <RootLayout title="PCP – Produção">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">PCP – Planejamento e Controle de Produção</h2>
          <p className="text-slate-500 text-sm">Safras, talhões e atividades agrícolas</p>
        </div>

        <Tabs defaultValue="ordens">
          <TabsList>
            <TabsTrigger value="ordens">Ordens de Produção</TabsTrigger>
            <TabsTrigger value="talhoes">Talhões</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
          </TabsList>

          {/* ── Aba Ordens de Produção ── */}
          <TabsContent value="ordens" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Select value={ordemStatusFilter} onValueChange={setOrdemStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDEM_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button size="sm" onClick={() => setOrdemFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Ordem
              </Button>
            </div>

            {ordensLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando ordens...</div>
            ) : ordens.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhuma ordem encontrada</div>
            ) : (
              <div className="space-y-3">
                {ordens.map((ordem) => (
                  <OrdemProducaoCard
                    key={ordem.id}
                    order={ordem}
                    onDeleted={loadOrdens}
                    onProduced={loadOrdens}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Aba Talhões ── */}
          <TabsContent value="talhoes" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm text-slate-500">
                {plots.length} talhão{plots.length !== 1 ? "ões" : ""}
              </span>
              <Button size="sm" onClick={handleNewPlot}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Talhão
              </Button>
            </div>

            {plotsLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando talhões...</div>
            ) : plots.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhum talhão cadastrado</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {plots.map((plot) => (
                  <TalhaoCard
                    key={plot.id}
                    plot={plot}
                    onEdit={() => handleEditPlot(plot)}
                    onDeleted={loadPlots}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Aba Atividades ── */}
          <TabsContent value="atividades" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Select value={atividadePlotFilter} onValueChange={setAtividadePlotFilter}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Filtrar por talhão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os talhões</SelectItem>
                  {plots.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button size="sm" onClick={() => setAtividadeFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Registrar Atividade
              </Button>
            </div>

            {atividadesLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando atividades...</div>
            ) : atividades.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhuma atividade registrada</div>
            ) : (
              <div className="space-y-2">
                {atividades.map((act) => (
                  <div key={act.id} className="rounded-md border p-3 space-y-1 bg-white">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {ACTIVITY_LABELS[act.activity_type] ?? act.activity_type}
                        </span>
                        {act.plot_name && (
                          <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                            {act.plot_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{formatDate(act.activity_date)}</span>
                        <span className="capitalize">{act.labor_type}</span>
                        {act.cost > 0 && (
                          <span className="font-medium text-slate-700">
                            {formatCurrency(act.cost)}
                          </span>
                        )}
                      </div>
                    </div>
                    {act.details && (
                      <p className="text-sm text-slate-600">{act.details}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <OrdemProducaoForm
        open={ordemFormOpen}
        onOpenChange={setOrdemFormOpen}
        plots={plots}
        insumos={insumos}
        onSuccess={loadOrdens}
      />

      <TalhaoForm
        open={talhaoFormOpen}
        onOpenChange={setTalhaoFormOpen}
        plot={editingPlot}
        onSuccess={loadPlots}
      />

      <AtividadeForm
        open={atividadeFormOpen}
        onOpenChange={setAtividadeFormOpen}
        plots={plots}
        onSuccess={loadAtividades}
      />
    </RootLayout>
  )
}
