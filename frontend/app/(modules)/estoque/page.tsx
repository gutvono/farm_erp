"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { RootLayout } from "@/components/layout/RootLayout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StockItemRow } from "@/components/modules/estoque/StockItemRow"
import { StockItemForm } from "@/components/modules/estoque/StockItemForm"
import { MovimentacaoForm } from "@/components/modules/estoque/MovimentacaoForm"
import { MovimentacoesTable } from "@/components/modules/estoque/MovimentacoesTable"
import { InventarioModal } from "@/components/modules/estoque/InventarioModal"
import {
  getItens,
  getMovimentacoes,
  getInventario,
} from "@/services/estoque"
import {
  Inventory,
  StockCategory,
  StockItem,
  StockMovement,
} from "@/types/index"

const CATEGORIES: { value: string; label: string }[] = [
  { value: "all", label: "Todas as categorias" },
  { value: "cafe", label: "Café" },
  { value: "insumo", label: "Insumo" },
  { value: "equipamento", label: "Equipamento" },
  { value: "veiculo", label: "Veículo" },
  { value: "outro", label: "Outro" },
]

export default function EstoquePage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [belowMinFilter, setBelowMinFilter] = useState(false)

  const [movements, setMovements] = useState<StockMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)

  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)

  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)

  const [movFormOpen, setMovFormOpen] = useState(false)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null)
  const [historyMovements, setHistoryMovements] = useState<StockMovement[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadItems = useCallback(async () => {
    setItemsLoading(true)
    try {
      const data = await getItens({
        category: categoryFilter !== "all" ? (categoryFilter as StockCategory) : undefined,
        below_minimum: belowMinFilter || undefined,
      })
      setItems(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar itens")
    } finally {
      setItemsLoading(false)
    }
  }, [categoryFilter, belowMinFilter])

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true)
    try {
      const data = await getMovimentacoes({ order_by: "occurred_at", order_dir: "desc" })
      setMovements(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar movimentações")
    } finally {
      setMovementsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  useEffect(() => {
    loadMovements()
  }, [loadMovements])

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

  async function handleOpenHistory(item: StockItem) {
    setHistoryItem(item)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const data = await getMovimentacoes({
        stock_item_id: item.id,
        order_by: "occurred_at",
        order_dir: "desc",
      })
      setHistoryMovements(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar histórico")
    } finally {
      setHistoryLoading(false)
    }
  }

  function handleEditItem(item: StockItem) {
    setEditingItem(item)
    setItemFormOpen(true)
  }

  function handleNewItem() {
    setEditingItem(null)
    setItemFormOpen(true)
  }

  const criticalCount = items.filter((i) => i.is_below_minimum).length

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
          </TabsList>

          {/* ── Aba Itens ── */}
          <TabsContent value="items" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">
                  {items.length} item{items.length !== 1 ? "s" : ""} cadastrado{items.length !== 1 ? "s" : ""}
                  {criticalCount > 0 && (
                    <span className="ml-1 text-red-600 font-medium flex inline-flex items-center gap-1">
                      ,{" "}
                      <AlertTriangle className="h-3 w-3" />
                      {criticalCount} crítico{criticalCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant={belowMinFilter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBelowMinFilter((v) => !v)}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Apenas críticos
                </Button>

                <Button onClick={handleNewItem} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Novo Item
                </Button>
              </div>
            </div>

            {itemsLoading ? (
              <div className="py-12 text-center text-slate-400">Carregando itens...</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-slate-400">Nenhum item cadastrado</div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <StockItemRow
                    key={item.id}
                    item={item}
                    onClick={() => handleOpenHistory(item)}
                    onEdit={() => handleEditItem(item)}
                    onDeleted={loadItems}
                  />
                ))}
              </div>
            )}
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
              movements={movements}
              loading={movementsLoading}
              items={items.map((i) => ({ id: i.id, name: i.name }))}
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
        </Tabs>
      </div>

      {/* Dialogs e Sheets */}
      <StockItemForm
        open={itemFormOpen}
        onOpenChange={setItemFormOpen}
        item={editingItem}
        onSuccess={() => {
          loadItems()
          loadMovements()
        }}
      />

      <MovimentacaoForm
        open={movFormOpen}
        onOpenChange={setMovFormOpen}
        items={items}
        onSuccess={() => {
          loadItems()
          loadMovements()
        }}
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
            <SheetTitle>
              Histórico: {historyItem?.name}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <MovimentacoesTable
              movements={historyMovements}
              loading={historyLoading}
              hideItemFilter
            />
          </div>
        </SheetContent>
      </Sheet>
    </RootLayout>
  )
}
