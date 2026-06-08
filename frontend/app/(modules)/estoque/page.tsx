"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, PackageCheck, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { RootLayout } from "@/components/layout/RootLayout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ItensTable } from "@/components/modules/estoque/ItensTable"
import { useItens } from "@/components/modules/estoque/useItens"
import { StockItemForm } from "@/components/modules/estoque/StockItemForm"
import { MovimentacaoForm } from "@/components/modules/estoque/MovimentacaoForm"
import { MovimentacoesTable } from "@/components/modules/estoque/MovimentacoesTable"
import { MovimentacoesHistory } from "@/components/modules/estoque/MovimentacoesHistory"
import { useMovimentacoes } from "@/components/modules/estoque/useMovimentacoes"
import { InventarioModal } from "@/components/modules/estoque/InventarioModal"
import { RecebimentosTable } from "@/components/modules/estoque/RecebimentosTable"
import { useRecebimentos } from "@/components/modules/estoque/useRecebimentos"
import { getItens, getInventario } from "@/services/estoque"
import { getCategorias } from "@/services/configuracoes"
import { Category, Inventory, StockItem } from "@/types/index"

const CATEGORIAS_PAGE_SIZE = 100

export default function EstoquePage() {
  const itens = useItens()
  const movements = useMovimentacoes()
  const recebimentos = useRecebimentos()

  const [categories, setCategories] = useState<Category[]>([])

  // Lista completa de itens (ARRAY) para os SELETORES: formulário de
  // movimentação, filtro de item nas movimentações e contagem de críticos.
  const [allItems, setAllItems] = useState<StockItem[]>([])

  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)

  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)

  const [movFormOpen, setMovFormOpen] = useState(false)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null)

  const loadAllItems = useCallback(() => {
    getItens().then(setAllItems).catch(() => {})
  }, [])

  useEffect(() => {
    loadAllItems()
  }, [loadAllItems])

  useEffect(() => {
    getCategorias({ page: 1, page_size: CATEGORIAS_PAGE_SIZE, order_by: "name", order_dir: "asc" })
      .then((res) => setCategories(res.items))
      .catch(() => {})
  }, [])

  function reloadItemData() {
    itens.reload()
    loadAllItems()
    movements.reload()
  }

  async function handleOpenInventory() {
    setInventoryOpen(true)
    setInventoryLoading(true)
    try {
      const data = await getInventario()
      setInventory(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar inventário")
    } finally {
      setInventoryLoading(false)
    }
  }

  function handleOpenHistory(item: StockItem) {
    setHistoryItem(item)
    setHistoryOpen(true)
  }

  function handleEditItem(item: StockItem) {
    setEditingItem(item)
    setItemFormOpen(true)
  }

  function handleNewItem() {
    setEditingItem(null)
    setItemFormOpen(true)
  }

  async function handleConferenciaFinalizada() {
    itens.reload()
    loadAllItems()
    await Promise.all([recebimentos.reload(), movements.reload()])
  }

  const criticalCount = allItems.filter((i) => i.is_below_minimum).length

  return (
    <RootLayout title="Estoque">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Estoque</h2>
            <p className="text-slate-500 text-sm">Gerencie itens, movimentações e inventário</p>
          </div>
        </div>

        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">Itens</TabsTrigger>
            <TabsTrigger value="movements">Movimentações</TabsTrigger>
            <TabsTrigger value="inventory">Inventário</TabsTrigger>
            <TabsTrigger value="recebimentos" className="relative">
              Recebimentos
              {recebimentos.data.total > 0 && (
                <span className="ml-1.5 rounded-full bg-orange-500 text-white text-xs px-1.5 py-0.5 leading-none">
                  {recebimentos.data.total}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Aba Itens ── */}
          <TabsContent value="items" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-slate-600">
                {itens.data.total} item{itens.data.total !== 1 ? "s" : ""}
                {criticalCount > 0 && (
                  <span className="ml-1 inline-flex items-center gap-1 text-red-600 font-medium">
                    , <AlertTriangle className="h-3 w-3" />
                    {criticalCount} crítico{criticalCount !== 1 ? "s" : ""}
                  </span>
                )}
              </span>

              <Button onClick={handleNewItem} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Novo Item
              </Button>
            </div>

            <ItensTable
              data={itens.data}
              loading={itens.loading}
              page={itens.page}
              sort={itens.sort}
              onPageChange={itens.setPage}
              onSortChange={itens.toggleSort}
              search={itens.searchInput}
              onSearchChange={itens.setSearchInput}
              categories={categories}
              categoryId={itens.categoryId}
              onCategoryChange={itens.setCategory}
              role={itens.role}
              onRoleChange={itens.setRole}
              belowMinimum={itens.belowMinimum}
              onBelowMinimumChange={itens.setBelowMinimum}
              onRowClick={handleOpenHistory}
              onEdit={handleEditItem}
              onChanged={reloadItemData}
            />
          </TabsContent>

          {/* ── Aba Movimentações ── */}
          <TabsContent value="movements" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setMovFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Registrar Movimentação
              </Button>
            </div>

            <MovimentacoesTable
              data={movements.data}
              loading={movements.loading}
              page={movements.page}
              sort={movements.sort}
              onPageChange={movements.setPage}
              onSortChange={movements.toggleSort}
              filters={movements.filters}
              onFiltersChange={movements.setFilters}
              items={allItems.map((i) => ({ id: i.id, name: i.name }))}
            />
          </TabsContent>

          {/* ── Aba Inventário ── */}
          <TabsContent value="inventory" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Inventário de Estoque</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-600 text-sm">
                  O inventário consolida todos os itens em estoque com suas quantidades atuais,
                  custo unitário e valor total. Use para auditorias e controle patrimonial.
                </p>
                <Button onClick={handleOpenInventory}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Gerar Inventário
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Aba Recebimentos ── */}
          <TabsContent value="recebimentos" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Ordens aprovadas aguardando conferência de recebimento
              </p>
              <Button variant="outline" size="sm" onClick={recebimentos.reload}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>
            </div>

            {!recebimentos.loading && recebimentos.data.total === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <PackageCheck className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                Nenhuma ordem aguardando conferência
              </div>
            ) : (
              <RecebimentosTable
                data={recebimentos.data}
                loading={recebimentos.loading}
                page={recebimentos.page}
                sort={recebimentos.sort}
                onPageChange={recebimentos.setPage}
                onSortChange={recebimentos.toggleSort}
                onReload={recebimentos.reload}
                onFinalized={handleConferenciaFinalizada}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs e Sheets */}
      <StockItemForm
        open={itemFormOpen}
        onOpenChange={setItemFormOpen}
        item={editingItem}
        onSuccess={reloadItemData}
      />

      <MovimentacaoForm
        open={movFormOpen}
        onOpenChange={setMovFormOpen}
        items={allItems}
        onSuccess={reloadItemData}
      />

      <InventarioModal
        open={inventoryOpen}
        onOpenChange={setInventoryOpen}
        inventory={inventory}
        loading={inventoryLoading}
      />

      {/* Sheet de histórico por item */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Histórico: {historyItem?.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {historyItem && (
              <MovimentacoesHistory key={historyItem.id} stockItemId={historyItem.id} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </RootLayout>
  )
}
