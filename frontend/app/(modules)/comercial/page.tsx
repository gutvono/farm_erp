"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Plus } from "lucide-react"
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
import { ClienteForm } from "@/components/modules/comercial/ClienteForm"
import { ClienteRow } from "@/components/modules/comercial/ClienteRow"
import { VendaCard } from "@/components/modules/comercial/VendaCard"
import { VendaForm } from "@/components/modules/comercial/VendaForm"
import { getClientes, getVendas } from "@/services/comercial"
import { getItens } from "@/services/estoque"
import { Client, Sale, SaleStatus, StockItem } from "@/types/index"

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "realizada", label: "Realizada" },
  { value: "entregue", label: "Entregue" },
  { value: "cancelada", label: "Cancelada" },
]

export default function ComercialPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")

  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [delinquentOnly, setDelinquentOnly] = useState(false)

  const [stockItems, setStockItems] = useState<StockItem[]>([])

  const [vendaFormOpen, setVendaFormOpen] = useState(false)
  const [clienteFormOpen, setClienteFormOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)

  const loadSales = useCallback(async () => {
    setSalesLoading(true)
    try {
      const data = await getVendas(statusFilter !== "all" ? (statusFilter as SaleStatus) : undefined)
      setSales(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar vendas")
    } finally {
      setSalesLoading(false)
    }
  }, [statusFilter])

  const loadClients = useCallback(async () => {
    setClientsLoading(true)
    try {
      const data = await getClientes(delinquentOnly || undefined)
      setClients(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar clientes")
    } finally {
      setClientsLoading(false)
    }
  }, [delinquentOnly])

  useEffect(() => { loadSales() }, [loadSales])
  useEffect(() => { loadClients() }, [loadClients])

  useEffect(() => {
    getItens({ category: "cafe" }).then(setStockItems).catch(() => {})
  }, [])

  const delinquentCount = clients.filter((c) => c.is_delinquent).length

  function handleEditClient(client: Client) {
    setEditingClient(client)
    setClienteFormOpen(true)
  }

  function handleNewClient() {
    setEditingClient(null)
    setClienteFormOpen(true)
  }

  return (
    <RootLayout title="Comercial">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Comercial</h2>
          <p className="text-slate-500 text-sm">Vendas e clientes</p>
        </div>

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Vendas</TabsTrigger>
            <TabsTrigger value="clients">Clientes</TabsTrigger>
          </TabsList>

          {/* ── Aba Vendas ── */}
          <TabsContent value="sales" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
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

              <Button size="sm" onClick={() => setVendaFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Venda
              </Button>
            </div>

            {salesLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando vendas...</div>
            ) : sales.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhuma venda encontrada</div>
            ) : (
              <div className="space-y-3">
                {sales.map((sale) => (
                  <VendaCard key={sale.id} sale={sale} onChanged={loadSales} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Aba Clientes ── */}
          <TabsContent value="clients" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">
                  {clients.length} cliente{clients.length !== 1 ? "s" : ""}
                  {delinquentCount > 0 && (
                    <span className="ml-1 text-red-600 font-medium">
                      , {delinquentCount} inadimplente{delinquentCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={delinquentOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDelinquentOnly((v) => !v)}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Apenas inadimplentes
                </Button>
                <Button size="sm" onClick={handleNewClient}>
                  <Plus className="h-4 w-4 mr-1" />
                  Novo Cliente
                </Button>
              </div>
            </div>

            {clientsLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando clientes...</div>
            ) : clients.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhum cliente cadastrado</div>
            ) : (
              <div className="space-y-2">
                {clients.map((c) => (
                  <ClienteRow
                    key={c.id}
                    client={c}
                    onEdit={() => handleEditClient(c)}
                    onDeleted={loadClients}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <VendaForm
        open={vendaFormOpen}
        onOpenChange={setVendaFormOpen}
        clients={clients}
        stockItems={stockItems}
        onSuccess={() => { loadSales() }}
      />

      <ClienteForm
        open={clienteFormOpen}
        onOpenChange={setClienteFormOpen}
        client={editingClient}
        onSuccess={loadClients}
      />
    </RootLayout>
  )
}
