"use client"

import { useEffect, useState, useCallback } from "react"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Clock,
  Package,
  Factory,
  UserX,
} from "lucide-react"
import { RootLayout } from "@/components/layout/RootLayout"
import { KPICard } from "@/components/modules/dashboard/KPICard"
import { CashFlowChart } from "@/components/modules/dashboard/CashFlowChart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getDashboard } from "@/services/dashboard"
import { DashboardData } from "@/types/index"
import { formatDateTime } from "@/lib/utils"

function KPISkeletons() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg border-2 border-slate-200 p-6 space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-5 rounded" />
          </div>
          <Skeleton className="h-8 w-36" />
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getDashboard()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados do dashboard")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-6">
          <KPISkeletons />
          <div className="rounded-lg border-2 border-slate-200 p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <p className="text-red-500 text-sm">{error}</p>
          <Button variant="outline" onClick={fetchData}>
            Tentar novamente
          </Button>
        </div>
      )
    }

    if (!data) return null

    const { kpis, cash_flow } = data

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Saldo Atual"
            value={kpis.balance}
            icon={DollarSign}
            variant="default"
          />
          <KPICard
            title="Receita do Mês"
            value={kpis.monthly_revenue}
            icon={TrendingUp}
            variant="default"
          />
          <KPICard
            title="Despesas do Mês"
            value={kpis.monthly_expenses}
            icon={TrendingDown}
            variant="default"
          />
          <KPICard
            title="Contas a Pagar"
            value={`${kpis.pending_payables} pendentes`}
            icon={AlertCircle}
            variant={kpis.pending_payables > 0 ? "warning" : "default"}
          />
          <KPICard
            title="Contas a Receber"
            value={`${kpis.pending_receivables} pendentes`}
            icon={Clock}
            variant="default"
          />
          <KPICard
            title="Estoque Crítico"
            value={`${kpis.low_stock_items} itens`}
            icon={Package}
            variant={kpis.low_stock_items > 0 ? "danger" : "default"}
          />
          <KPICard
            title="Ordens em Aberto"
            value={`${kpis.open_production_orders} ordens`}
            icon={Factory}
            variant="default"
          />
          <KPICard
            title="Clientes Inadimplentes"
            value={`${kpis.defaulter_clients} clientes`}
            icon={UserX}
            variant={kpis.defaulter_clients > 0 ? "danger" : "default"}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-700">
              Fluxo de Caixa — Últimos 6 Meses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart data={cash_flow} />
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Dados atualizados em {formatDateTime(new Date().toISOString())}</span>
          <Button variant="outline" size="sm" onClick={fetchData}>
            Atualizar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <RootLayout title="Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-slate-500 text-sm">Visão geral das operações da fazenda</p>
        </div>
        {renderContent()}
      </div>
    </RootLayout>
  )
}
