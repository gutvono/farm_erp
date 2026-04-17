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
import { FornecedorForm } from "@/components/modules/compras/FornecedorForm"
import { FornecedorRow } from "@/components/modules/compras/FornecedorRow"
import { OrdemCard } from "@/components/modules/compras/OrdemCard"
import { OrdemForm } from "@/components/modules/compras/OrdemForm"
import {
  getFornecedores,
  getOrdens,
} from "@/services/compras"
import { getItens } from "@/services/estoque"
import { PurchaseOrder, PurchaseOrderStatus, StockItem, Supplier } from "@/types/index"

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
]

export default function ComprasPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)

  const [stockItems, setStockItems] = useState<StockItem[]>([])

  const [ordemFormOpen, setOrdemFormOpen] = useState(false)
  const [fornecedorFormOpen, setFornecedorFormOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const data = await getOrdens(statusFilter !== "all" ? (statusFilter as PurchaseOrderStatus) : undefined)
      setOrders(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar ordens")
    } finally {
      setOrdersLoading(false)
    }
  }, [statusFilter])

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true)
    try {
      const data = await getFornecedores()
      setSuppliers(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar fornecedores")
    } finally {
      setSuppliersLoading(false)
    }
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])
  useEffect(() => { loadSuppliers() }, [loadSuppliers])

  useEffect(() => {
    getItens().then(setStockItems).catch(() => {})
  }, [])

  function handleEditSupplier(supplier: Supplier) {
    setEditingSupplier(supplier)
    setFornecedorFormOpen(true)
  }

  function handleNewSupplier() {
    setEditingSupplier(null)
    setFornecedorFormOpen(true)
  }

  return (
    <RootLayout title="Compras">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Compras</h2>
          <p className="text-slate-500 text-sm">Ordens de compra e fornecedores</p>
        </div>

        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Ordens de Compra</TabsTrigger>
            <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
          </TabsList>

          {/* ── Aba Ordens ── */}
          <TabsContent value="orders" className="space-y-4">
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

              <Button size="sm" onClick={() => setOrdemFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Ordem
              </Button>
            </div>

            {ordersLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando ordens...</div>
            ) : orders.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhuma ordem encontrada</div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <OrdemCard key={order.id} order={order} onChanged={loadOrders} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Aba Fornecedores ── */}
          <TabsContent value="suppliers" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={handleNewSupplier}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Fornecedor
              </Button>
            </div>

            {suppliersLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando fornecedores...</div>
            ) : suppliers.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhum fornecedor cadastrado</div>
            ) : (
              <div className="space-y-2">
                {suppliers.map((s) => (
                  <FornecedorRow
                    key={s.id}
                    supplier={s}
                    onEdit={() => handleEditSupplier(s)}
                    onDeleted={loadSuppliers}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <OrdemForm
        open={ordemFormOpen}
        onOpenChange={setOrdemFormOpen}
        suppliers={suppliers}
        stockItems={stockItems}
        onSuccess={() => { loadOrders() }}
      />

      <FornecedorForm
        open={fornecedorFormOpen}
        onOpenChange={setFornecedorFormOpen}
        supplier={editingSupplier}
        onSuccess={loadSuppliers}
      />
    </RootLayout>
  )
}
