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
import { FaturaCard } from "@/components/modules/faturamento/FaturaCard"
import { FaturaManualForm } from "@/components/modules/faturamento/FaturaManualForm"
import { getFaturas } from "@/services/faturamento"
import { getClientes } from "@/services/comercial"
import { Client, Invoice, InvoiceStatus } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "emitida", label: "Emitida" },
  { value: "paga", label: "Paga" },
  { value: "cancelada", label: "Cancelada" },
]

export default function FaturamentoPage() {
  const [faturas, setFaturas] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")
  const [clients, setClients] = useState<Client[]>([])
  const [formOpen, setFormOpen] = useState(false)

  const loadFaturas = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFaturas(
        statusFilter !== "all" ? { status: statusFilter as InvoiceStatus } : undefined
      )
      setFaturas(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar faturas")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadFaturas()
  }, [loadFaturas])

  useEffect(() => {
    getClientes().then(setClients).catch(() => {})
  }, [])

  const total = faturas.reduce((sum, f) => sum + f.total_amount, 0)

  return (
    <RootLayout title="Faturamento">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Faturamento</h2>
          <p className="text-slate-500 text-sm">Faturas emitidas para clientes</p>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!loading && (
              <span className="text-sm text-slate-500">
                {faturas.length} fatura{faturas.length !== 1 ? "s" : ""} · total{" "}
                <span className="font-medium text-slate-700">{formatCurrency(total)}</span>
              </span>
            )}
          </div>

          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Fatura Manual
          </Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">Carregando faturas...</div>
        ) : faturas.length === 0 ? (
          <div className="py-12 text-center text-slate-400">Nenhuma fatura encontrada</div>
        ) : (
          <div className="space-y-3">
            {faturas.map((fatura) => (
              <FaturaCard key={fatura.id} invoice={fatura} onChanged={loadFaturas} />
            ))}
          </div>
        )}
      </div>

      <FaturaManualForm
        open={formOpen}
        onOpenChange={setFormOpen}
        clients={clients}
        onSuccess={loadFaturas}
      />
    </RootLayout>
  )
}
