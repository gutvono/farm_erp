"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { RootLayout } from "@/components/layout/RootLayout"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FornecedorForm } from "@/components/modules/compras/FornecedorForm"
import { FornecedoresTable } from "@/components/modules/compras/FornecedoresTable"
import { useFornecedores } from "@/components/modules/compras/useFornecedores"
import { OrdensTable } from "@/components/modules/compras/OrdensTable"
import { useOrdens } from "@/components/modules/compras/useOrdens"
import { OrdemForm } from "@/components/modules/compras/OrdemForm"
import { CotacoesTable } from "@/components/modules/compras/CotacoesTable"
import { useCotacoes } from "@/components/modules/compras/useCotacoes"
import { CotacaoForm } from "@/components/modules/compras/CotacaoForm"
import { getFornecedores } from "@/services/compras"
import { getItens } from "@/services/estoque"
import { StockItem, Supplier } from "@/types/index"

export default function ComprasPage() {
  const ordens = useOrdens()
  const cotacoes = useCotacoes()
  const fornecedores = useFornecedores()

  // Listas completas (ARRAY) para SELETORES e detalhes: fornecedores alimentam a
  // ordem de compra, as propostas de cotação e os filtros das tabelas; itens
  // alimentam os formulários. Independentes das tabelas paginadas.
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])

  const [ordemFormOpen, setOrdemFormOpen] = useState(false)
  const [fornecedorFormOpen, setFornecedorFormOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [cotacaoFormOpen, setCotacaoFormOpen] = useState(false)

  const loadAllSuppliers = useCallback(() => {
    getFornecedores().then(setAllSuppliers).catch(() => {})
  }, [])

  useEffect(() => {
    loadAllSuppliers()
  }, [loadAllSuppliers])

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

  function handleSupplierChanged() {
    fornecedores.reload()
    loadAllSuppliers()
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
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={() => setOrdemFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Ordem
              </Button>
            </div>

            <OrdensTable
              data={ordens.data}
              loading={ordens.loading}
              page={ordens.page}
              sort={ordens.sort}
              onPageChange={ordens.setPage}
              onSortChange={ordens.toggleSort}
              search={ordens.searchInput}
              onSearchChange={ordens.setSearchInput}
              status={ordens.status}
              onStatusChange={ordens.setStatus}
              suppliers={allSuppliers}
              supplierId={ordens.supplierId}
              onSupplierChange={ordens.setSupplierId}
              onChanged={ordens.reload}
            />
          </TabsContent>

          {/* ── Aba Cotações ── */}
          <TabsContent value="cotacoes" className="space-y-4">
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={() => setCotacaoFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Cotação
              </Button>
            </div>

            <CotacoesTable
              data={cotacoes.data}
              loading={cotacoes.loading}
              page={cotacoes.page}
              sort={cotacoes.sort}
              onPageChange={cotacoes.setPage}
              onSortChange={cotacoes.toggleSort}
              status={cotacoes.status}
              onStatusChange={cotacoes.setStatus}
              orderType={cotacoes.orderType}
              onOrderTypeChange={cotacoes.setOrderType}
              suppliers={allSuppliers}
              onChanged={cotacoes.reload}
            />
          </TabsContent>

          {/* ── Aba Fornecedores ── */}
          <TabsContent value="suppliers" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={handleNewSupplier}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Fornecedor
              </Button>
            </div>

            <FornecedoresTable
              data={fornecedores.data}
              loading={fornecedores.loading}
              stockItems={stockItems}
              page={fornecedores.page}
              sort={fornecedores.sort}
              onPageChange={fornecedores.setPage}
              onSortChange={fornecedores.toggleSort}
              search={fornecedores.searchInput}
              onSearchChange={fornecedores.setSearchInput}
              onEdit={handleEditSupplier}
              onChanged={handleSupplierChanged}
            />
          </TabsContent>
        </Tabs>
      </div>

      <OrdemForm
        open={ordemFormOpen}
        onOpenChange={setOrdemFormOpen}
        suppliers={allSuppliers}
        stockItems={stockItems}
        onSuccess={() => ordens.reload()}
      />

      <FornecedorForm
        open={fornecedorFormOpen}
        onOpenChange={setFornecedorFormOpen}
        supplier={editingSupplier}
        onSuccess={handleSupplierChanged}
      />

      <CotacaoForm
        open={cotacaoFormOpen}
        onOpenChange={setCotacaoFormOpen}
        stockItems={stockItems}
        onSuccess={() => cotacoes.reload()}
      />
    </RootLayout>
  )
}
