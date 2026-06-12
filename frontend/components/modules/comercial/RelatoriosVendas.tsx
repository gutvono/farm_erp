"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getRelatorioVendas } from "@/services/comercial"
import { SalesGranularity, SalesReport, SalesTimeseriesItem } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const STATUS_LABEL: Record<string, string> = {
  realizada: "Realizada",
  entregue: "Entregue",
  cancelada: "Cancelada",
}

const MIX_LABEL: Record<string, string> = {
  a_vista: "À vista",
  parcelado: "Parcelado",
}

const GRANULARITY_OPTIONS: { value: SalesGranularity; label: string }[] = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
]

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function yearStartISO(): string {
  return `${new Date().getFullYear()}-01-01`
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-4 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  )
}

function SalesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ payload: SalesTimeseriesItem }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0].payload
  return (
    <div className="rounded border border-slate-200 bg-white p-3 text-sm shadow">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      <p className="text-green-600">Faturamento: {formatCurrency(item.total)}</p>
      <p className="text-slate-600">
        Vendas: {item.count}
      </p>
    </div>
  )
}

function SalesChart({ data }: { data: SalesTimeseriesItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis
          tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 12 }}
        />
        <Tooltip content={<SalesTooltip />} />
        <Bar dataKey="total" name="Faturamento" fill="#22c55e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RelatoriosVendas() {
  const [start, setStart] = useState(yearStartISO())
  const [end, setEnd] = useState(todayISO())
  const [granularity, setGranularity] = useState<SalesGranularity>("month")
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (s: string, e: string, g: SalesGranularity) => {
      if (s > e) {
        toast.error("A data inicial não pode ser maior que a data final")
        return
      }
      setLoading(true)
      try {
        const data = await getRelatorioVendas({ start: s, end: e, granularity: g })
        setReport(data)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao gerar relatório de vendas")
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(start, end, granularity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="report-start" className="text-xs">
                Início
              </Label>
              <Input
                id="report-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-end" className="text-xs">
                Fim
              </Label>
              <Input
                id="report-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Granularidade</Label>
              <Select
                value={granularity}
                onValueChange={(v) => setGranularity(v as SalesGranularity)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRANULARITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => load(start, end, granularity)} disabled={loading}>
              {loading ? "Gerando..." : "Gerar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && !report ? (
        <div className="py-16 text-center text-slate-400">Carregando relatório...</div>
      ) : !report ? null : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile label="Faturamento" value={formatCurrency(report.kpis.faturamento)} />
            <Tile label="Nº de Vendas" value={String(report.kpis.num_vendas)} />
            <Tile label="Ticket Médio" value={formatCurrency(report.kpis.ticket_medio)} />
          </div>

          {/* Evolução temporal */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evolução do Faturamento</CardTitle>
            </CardHeader>
            <CardContent>
              {report.timeseries.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  Nenhuma venda no período selecionado
                </p>
              ) : (
                <SalesChart data={report.timeseries} />
              )}
            </CardContent>
          </Card>

          {/* Por status + Mix */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Vendas por Status</CardTitle>
              </CardHeader>
              <CardContent>
                {report.by_status.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">Sem vendas no período</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.by_status.map((s) => (
                        <TableRow key={s.status}>
                          <TableCell>{STATUS_LABEL[s.status] ?? s.status}</TableCell>
                          <TableCell className="text-right">{s.count}</TableCell>
                          <TableCell className="text-right">{formatCurrency(s.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mix de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                {report.mix.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">Sem vendas no período</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Forma</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.mix.map((m) => (
                        <TableRow key={m.category}>
                          <TableCell>{MIX_LABEL[m.category] ?? m.category}</TableCell>
                          <TableCell className="text-right">{m.count}</TableCell>
                          <TableCell className="text-right">{formatCurrency(m.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top produtos + Top clientes */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Produtos</CardTitle>
              </CardHeader>
              <CardContent>
                {report.top_products.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">Nenhum produto vendido</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.top_products.map((p) => (
                        <TableRow key={p.stock_item_id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right">{p.quantity.toFixed(3)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(p.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Clientes</CardTitle>
              </CardHeader>
              <CardContent>
                {report.top_clients.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">Nenhum cliente no período</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Vendas</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.top_clients.map((c) => (
                        <TableRow key={c.client_id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">{c.num_vendas}</TableCell>
                          <TableCell className="text-right">{formatCurrency(c.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recebíveis */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recebíveis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Tile
                  label="Recebido no período"
                  value={formatCurrency(report.receivables.received_in_period)}
                />
                <Tile
                  label="A receber no período"
                  value={formatCurrency(report.receivables.to_receive_in_period)}
                />
                <Tile
                  label="Inadimplência (hoje)"
                  value={formatCurrency(report.receivables.overdue_total)}
                />
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-slate-700">
                  Inadimplência por faixa de atraso (aging)
                </p>
                {report.receivables.aging.length === 0 ? (
                  <p className="py-2 text-sm text-slate-400">Nenhuma parcela vencida</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Faixa (dias)</TableHead>
                        <TableHead className="text-right">Saldo vencido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.receivables.aging.map((a) => (
                        <TableRow key={a.bucket}>
                          <TableCell>{a.bucket}</TableCell>
                          <TableCell className="text-right">{formatCurrency(a.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <p className="text-xs text-slate-400">
                Recebido e a receber referem-se ao período selecionado. A inadimplência e o
                aging são uma <strong>foto de hoje</strong> — refletem todas as parcelas
                vencidas em aberto, não apenas as do período.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
