"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { RootLayout } from "@/components/layout/RootLayout"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClienteForm } from "@/components/modules/comercial/ClienteForm"
import { ClientesTable } from "@/components/modules/comercial/ClientesTable"
import { useClientes } from "@/components/modules/comercial/useClientes"
import { VendasTable } from "@/components/modules/comercial/VendasTable"
import { useVendas } from "@/components/modules/comercial/useVendas"
import { VendaForm } from "@/components/modules/comercial/VendaForm"
import { getClientes } from "@/services/comercial"
import { getItens } from "@/services/estoque"
import { Client, StockItem } from "@/types/index"

export default function ComercialPage() {
  const vendas = useVendas()
  const clientes = useClientes()

  // Lista completa de clientes (ARRAY) só para o SELETOR da venda (cliente +
  // aviso de inadimplência). Independente da tabela paginada de clientes.
  const [allClients, setAllClients] = useState<Client[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])

  const [vendaFormOpen, setVendaFormOpen] = useState(false)
  const [clienteFormOpen, setClienteFormOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)

  const loadAllClients = useCallback(() => {
    getClientes()
      .then(setAllClients)
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadAllClients()
  }, [loadAllClients])

  useEffect(() => {
    getItens({ role: "produto_vendavel" }).then(setStockItems).catch(() => {})
  }, [])

  function handleEditClient(client: Client) {
    setEditingClient(client)
    setClienteFormOpen(true)
  }

  function handleNewClient() {
    setEditingClient(null)
    setClienteFormOpen(true)
  }

  function handleClienteSaved() {
    clientes.reload()
    loadAllClients()
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
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={() => setVendaFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Venda
              </Button>
            </div>

            <VendasTable
              data={vendas.data}
              loading={vendas.loading}
              page={vendas.page}
              sort={vendas.sort}
              onPageChange={vendas.setPage}
              onSortChange={vendas.toggleSort}
              status={vendas.status}
              onStatusChange={vendas.setStatus}
              onChanged={vendas.reload}
            />
          </TabsContent>

          {/* ── Aba Clientes ── */}
          <TabsContent value="clients" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm text-slate-600">
                {clientes.data.total} cliente{clientes.data.total !== 1 ? "s" : ""}
              </span>
              <Button size="sm" onClick={handleNewClient}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Cliente
              </Button>
            </div>

            <ClientesTable
              data={clientes.data}
              loading={clientes.loading}
              page={clientes.page}
              sort={clientes.sort}
              onPageChange={clientes.setPage}
              onSortChange={clientes.toggleSort}
              search={clientes.searchInput}
              onSearchChange={clientes.setSearchInput}
              delinquentOnly={clientes.delinquentOnly}
              onDelinquentOnlyChange={clientes.setDelinquentOnly}
              onEdit={handleEditClient}
              onChanged={handleClienteSaved}
            />
          </TabsContent>
        </Tabs>
      </div>

      <VendaForm
        open={vendaFormOpen}
        onOpenChange={setVendaFormOpen}
        clients={allClients}
        stockItems={stockItems}
        onSuccess={() => vendas.reload()}
      />

      <ClienteForm
        open={clienteFormOpen}
        onOpenChange={setClienteFormOpen}
        client={editingClient}
        onSuccess={handleClienteSaved}
      />
    </RootLayout>
  )
}
