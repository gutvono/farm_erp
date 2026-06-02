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
import { CotacaoCard } from "@/components/modules/compras/CotacaoCard"
import { CotacaoForm } from "@/components/modules/compras/CotacaoForm"
import {
  getCotacoes,
  getFornecedores,
  getOrdens,
} from "@/services/compras"
import { getItens } from "@/services/estoque"
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  Quotation,
  QuotationStatus,
  StockItem,
  Supplier,
} from "@/types/index"

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "aguardando_aprovacao_financeiro", label: "Aguardando aprovação" },
  { value: "aprovada", label: "Aprovada" },
  { value: "em_conferencia", label: "Em conferência" },
  { value: "aguardando_pagamento", label: "Aguardando pagamento" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
]

const COTACAO_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "aguardando_aprovacao_financeiro", label: "Aguardando aprovação" },
  { value: "aprovado_financeiro", label: "Aprovado financeiro" },
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

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [quotationsLoading, setQuotationsLoading] = useState(false)
  const [quotationStatusFilter, setQuotationStatusFilter] = useState("all")
  const [cotacaoFormOpen, setCotacaoFormOpen] = useState(false)

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

  const loadQuotations = useCallback(async () => {
    setQuotationsLoading(true)
    try {
      const data = await getCotacoes(
        quotationStatusFilter !== "all"
          ? (quotationStatusFilter as QuotationStatus)
          : undefined
      )
      setQuotations(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar cotações")
    } finally {
      setQuotationsLoading(false)
    }
  }, [quotationStatusFilter])

  useEffect(() => { loadOrders() }, [loadOrders])
  useEffect(() => { loadSuppliers() }, [loadSuppliers])
  useEffect(() => { loadQuotations() }, [loadQuotations])

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
            <TabsTrigger value="cotacoes">Cotações</TabsTrigger>
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

          {/* ── Aba Cotações ── */}
          <TabsContent value="cotacoes" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Select
                value={quotationStatusFilter}
                onValueChange={setQuotationStatusFilter}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COTACAO_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button size="sm" onClick={() => setCotacaoFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Cotação
              </Button>
            </div>

            {quotationsLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando cotações...</div>
            ) : quotations.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhuma cotação encontrada</div>
            ) : (
              <div className="space-y-3">
                {quotations.map((q) => (
                  <CotacaoCard
                    key={q.id}
                    quotation={q}
                    suppliers={suppliers}
                    onChanged={loadQuotations}
                  />
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

      <CotacaoForm
        open={cotacaoFormOpen}
        onOpenChange={setCotacaoFormOpen}
        stockItems={stockItems}
        onSuccess={() => { loadQuotations() }}
      />
    </RootLayout>
  )
}
