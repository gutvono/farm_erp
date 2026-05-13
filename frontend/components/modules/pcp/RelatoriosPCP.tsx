"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getRelatorios } from "@/services/pcp"
import { PCPReport } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  em_producao: "Em Produção",
  em_execucao: "Em Execução",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
  atrasadas: "Atrasadas",
}

export function RelatoriosPCP() {
  const [report, setReport] = useState<PCPReport | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getRelatorios()
      setReport(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar relatórios")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !report) {
    return <div className="py-16 text-center text-slate-400">Carregando relatórios...</div>
  }

  if (!report) return null

  const { producao_por_talhao, consumo_insumos, ordens_resumo, custo_previsto_vs_realizado } =
    report

  const resumoEntries = Object.entries(ordens_resumo) as [string, number][]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Dados consolidados de todas as ordens de produção</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Resumo de status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo de Ordens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
            {resumoEntries.map(([key, count]) => (
              <div
                key={key}
                className="rounded-md border bg-slate-50 p-3 text-center"
              >
                <p className="text-xs text-slate-500">{STATUS_LABEL[key] ?? key}</p>
                <p className="text-2xl font-bold text-slate-800">{count}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Produção por talhão */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Produção por Talhão</CardTitle>
        </CardHeader>
        <CardContent>
          {producao_por_talhao.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              Nenhuma ordem concluída ainda
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Talhão</TableHead>
                  <TableHead className="text-right">Ordens</TableHead>
                  <TableHead className="text-right">Especial (sacas)</TableHead>
                  <TableHead className="text-right">Superior (sacas)</TableHead>
                  <TableHead className="text-right">Tradicional (sacas)</TableHead>
                  <TableHead className="text-right">Total (sacas)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {producao_por_talhao.map((row) => (
                  <TableRow key={row.plot_id}>
                    <TableCell className="font-medium">{row.plot_name}</TableCell>
                    <TableCell className="text-right">{row.total_orders}</TableCell>
                    <TableCell className="text-right text-amber-700">
                      {row.especial_sacas.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right text-green-700">
                      {row.superior_sacas.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right text-slate-600">
                      {row.tradicional_sacas.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {row.total_sacas.toFixed(3)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Consumo de insumos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consumo de Insumos</CardTitle>
        </CardHeader>
        <CardContent>
          {consumo_insumos.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum insumo consumido</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Quantidade Total</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumo_insumos.map((row) => (
                  <TableRow key={row.stock_item_id}>
                    <TableCell className="font-medium">{row.stock_item_name}</TableCell>
                    <TableCell className="text-right">
                      {row.total_quantity.toFixed(3)} {row.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.total_subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Custo previsto vs realizado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Custo Previsto vs. Realizado</CardTitle>
        </CardHeader>
        <CardContent>
          {custo_previsto_vs_realizado.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nenhuma ordem disponível</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Talhão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Estimado</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {custo_previsto_vs_realizado.map((row) => (
                  <TableRow key={row.order_id}>
                    <TableCell className="font-mono text-xs">{row.order_number}</TableCell>
                    <TableCell>{row.plot_name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-600">
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.estimated_cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.realized_cost > 0 ? formatCurrency(row.realized_cost) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        row.diferenca > 0
                          ? "text-red-600"
                          : row.diferenca < 0
                          ? "text-green-600"
                          : "text-slate-500"
                      }`}
                    >
                      {row.realized_cost > 0
                        ? (row.diferenca >= 0 ? "+" : "") + formatCurrency(row.diferenca)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
