"use client"

import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Balance } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

interface SaldoCardProps {
  balance: Balance | null
  loading?: boolean
  onRefresh: () => void
}

export function SaldoCard({ balance, loading, onRefresh }: SaldoCardProps) {
  const saldo = balance?.saldo ?? 0
  const isPositive = saldo >= 0

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">Saldo atual</p>
            <p
              className={`text-4xl font-bold ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {balance ? formatCurrency(saldo) : "—"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Total de entradas
            </div>
            <p className="mt-1 text-xl font-semibold text-slate-800">
              {balance ? formatCurrency(balance.total_entradas) : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Total de saídas
            </div>
            <p className="mt-1 text-xl font-semibold text-slate-800">
              {balance ? formatCurrency(balance.total_saidas) : "—"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
