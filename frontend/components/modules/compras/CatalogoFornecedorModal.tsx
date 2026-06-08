"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import {
  addItemCatalogo,
  deleteItemCatalogo,
  getCatalogoFornecedor,
  updateItemCatalogo,
} from "@/services/compras"
import { Paginated, StockItem, Supplier, SupplierItem } from "@/types/index"

const PAGE_SIZE = 10

const EMPTY_PAGE: Paginated<SupplierItem> = {
  items: [],
  total: 0,
  page: 1,
  page_size: PAGE_SIZE,
  pages: 0,
}

/** Itens avariados não entram no catálogo (decisão #1 da Demanda 6). */
function isAvariado(item: StockItem): boolean {
  return item.sku.endsWith("-AVARIADO")
}

interface CatalogoFornecedorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: Supplier
  stockItems: StockItem[]
}

export function CatalogoFornecedorModal({
  open,
  onOpenChange,
  supplier,
  stockItems,
}: CatalogoFornecedorModalProps) {
  const [data, setData] = useState<Paginated<SupplierItem>>(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ by: string; dir: "asc" | "desc" }>({
    by: "stock_item_name",
    dir: "asc",
  })

  // Formulário de adicionar item
  const [newItemId, setNewItemId] = useState("")
  const [newPrice, setNewPrice] = useState("")
  const [adding, setAdding] = useState(false)

  // Preço em edição por linha (id -> valor digitado)
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getCatalogoFornecedor(supplier.id, {
        page,
        page_size: PAGE_SIZE,
        order_by: sort.by,
        order_dir: sort.dir,
      })
      setData(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar catálogo")
    } finally {
      setLoading(false)
    }
  }, [supplier.id, page, sort])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  useEffect(() => {
    if (open) {
      setNewItemId("")
      setNewPrice("")
      setPage(1)
      setEditingPrice({})
    }
  }, [open])

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.by === key
        ? { by: key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { by: key, dir: "asc" }
    )
    setPage(1)
  }

  const availableItems = stockItems.filter((s) => !isAvariado(s))

  async function handleAdd() {
    const price = Number(newPrice)
    if (!newItemId) {
      toast.error("Selecione um item de estoque")
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Informe um preço maior que zero")
      return
    }
    setAdding(true)
    try {
      await addItemCatalogo(supplier.id, {
        stock_item_id: newItemId,
        unit_price: price,
      })
      toast.success("Item adicionado ao catálogo")
      setNewItemId("")
      setNewPrice("")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar item")
    } finally {
      setAdding(false)
    }
  }

  async function handleSavePrice(item: SupplierItem) {
    const raw = editingPrice[item.id]
    if (raw === undefined) return
    const price = Number(raw)
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Informe um preço maior que zero")
      return
    }
    if (price === item.unit_price) {
      setEditingPrice((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      return
    }
    try {
      await updateItemCatalogo(supplier.id, item.id, { unit_price: price })
      toast.success("Preço atualizado")
      setEditingPrice((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar preço")
    }
  }

  async function handleToggleActive(item: SupplierItem) {
    try {
      await updateItemCatalogo(supplier.id, item.id, { is_active: !item.is_active })
      toast.success(item.is_active ? "Item desativado" : "Item ativado")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar item")
    }
  }

  async function handleDelete(item: SupplierItem) {
    try {
      await deleteItemCatalogo(supplier.id, item.id)
      toast.success("Item removido do catálogo")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover item")
    }
  }

  const columns: DataTableColumn<SupplierItem>[] = [
    {
      key: "stock_item_name",
      label: "Item",
      sortable: true,
      render: (i) => (
        <div>
          <p className="font-medium text-slate-800">{i.stock_item_name}</p>
          <p className="text-xs text-slate-500">{i.stock_item_sku}</p>
        </div>
      ),
    },
    {
      key: "unit_price",
      label: "Preço unit.",
      sortable: true,
      align: "right",
      render: (i) => (
        <div className="flex items-center justify-end gap-2">
          <Input
            type="number"
            step="0.01"
            min="0"
            className="h-8 w-28 text-right"
            value={editingPrice[i.id] ?? String(i.unit_price)}
            onChange={(e) =>
              setEditingPrice((prev) => ({ ...prev, [i.id]: e.target.value }))
            }
            onBlur={() => handleSavePrice(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleSavePrice(i)
              }
            }}
          />
        </div>
      ),
    },
    {
      key: "is_active",
      label: "Status",
      align: "center",
      render: (i) => (
        <button type="button" onClick={() => handleToggleActive(i)} title="Clique para alternar">
          <Badge
            className={
              i.is_active
                ? "bg-green-100 text-green-800 hover:bg-green-200"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }
          >
            {i.is_active ? "Ativo" : "Inativo"}
          </Badge>
        </button>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (i) => (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover item do catálogo?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{i.stock_item_name}</strong> deixará de aparecer como item
                vendido por <strong>{supplier.name}</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDelete(i)}
                className="bg-red-600 hover:bg-red-700"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Itens vendidos — {supplier.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Adicionar item */}
          <div className="flex items-end gap-2 rounded-md border border-slate-200 p-3">
            <div className="flex-1 space-y-1">
              <Label>Item de estoque</Label>
              <Select value={newItemId} onValueChange={setNewItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um item" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36 space-y-1">
              <Label htmlFor="new-price">Preço unit. (R$)</Label>
              <Input
                id="new-price"
                type="number"
                step="0.01"
                min="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button type="button" onClick={handleAdd} disabled={adding}>
              <Plus className="h-4 w-4 mr-1" />
              {adding ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>

          <DataTable<SupplierItem>
            columns={columns}
            rows={data.items}
            loading={loading}
            emptyMessage="Nenhum item no catálogo deste fornecedor"
            page={page}
            pageSize={data.page_size}
            total={data.total}
            pages={data.pages}
            onPageChange={setPage}
            sort={sort}
            onSortChange={toggleSort}
            rowKey={(i) => i.id}
          />

          <p className="text-xs text-slate-500">
            O preço cadastrado aqui é sugerido (e editável) ao montar uma ordem de
            compra. Itens marcados como <strong>Inativo</strong> não aparecem na
            seleção de fornecedores da ordem.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
