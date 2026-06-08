"use client"

import { useState } from "react"
import { AlertTriangle, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { deleteItem } from "@/services/estoque"
import { Category, Paginated, StockItem, SystemRole } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const ALL = "all"

const ROLE_LABELS: Record<SystemRole, string> = {
  maquina: "Máquina",
  veiculo: "Veículo",
  embalagem: "Embalagem",
  insumo: "Insumo",
  produto_final: "Produto final",
  produto_inacabado: "Produto inacabado",
  produto_descartado: "Produto descartado",
  produto_vendavel: "Produto vendável",
}

const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [SystemRole, string][]

/** Ações por item (editar + excluir) com estado próprio de exclusão. */
function StockItemActions({
  item,
  onEdit,
  onDeleted,
}: {
  item: StockItem
  onEdit: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteItem(item.id)
      toast.success("Item excluído com sucesso")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir item")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="flex items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
        <Pencil className="h-4 w-4" />
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" disabled={deleting} title="Excluir">
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item de estoque?</AlertDialogTitle>
            <AlertDialogDescription>
              O item <strong>{item.name}</strong> será excluído. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface ItensTableProps {
  data: Paginated<StockItem>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  search: string
  onSearchChange: (value: string) => void
  categories: Category[]
  categoryId: string | undefined
  onCategoryChange: (categoryId: string | undefined) => void
  role: SystemRole | undefined
  onRoleChange: (role: SystemRole | undefined) => void
  belowMinimum: boolean
  onBelowMinimumChange: (value: boolean) => void
  onRowClick: (item: StockItem) => void
  onEdit: (item: StockItem) => void
  onChanged: () => void
}

export function ItensTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  search,
  onSearchChange,
  categories,
  categoryId,
  onCategoryChange,
  role,
  onRoleChange,
  belowMinimum,
  onBelowMinimumChange,
  onRowClick,
  onEdit,
  onChanged,
}: ItensTableProps) {
  const columns: DataTableColumn<StockItem>[] = [
    {
      key: "name",
      label: "Nome",
      sortable: true,
      render: (i) => (
        <div className="flex items-center gap-2">
          {i.is_below_minimum && (
            <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          )}
          <span className="font-medium text-slate-800">{i.name}</span>
        </div>
      ),
    },
    {
      key: "sku",
      label: "SKU",
      sortable: true,
      render: (i) => <span className="font-mono text-xs text-slate-500">{i.sku}</span>,
    },
    {
      key: "category_name",
      label: "Categoria",
      render: (i) => <Badge className="bg-slate-100 text-slate-700">{i.category_name}</Badge>,
    },
    {
      key: "quantity_on_hand",
      label: "Saldo",
      align: "right",
      render: (i) => (
        <span className="text-sm text-slate-600">
          {i.quantity_on_hand} {i.unit}
        </span>
      ),
    },
    {
      key: "minimum_stock",
      label: "Mínimo",
      align: "right",
      render: (i) => <span className="text-sm text-slate-500">{i.minimum_stock}</span>,
    },
    {
      key: "unit_cost",
      label: "Custo unit.",
      align: "right",
      render: (i) => (
        <span className="text-sm font-medium text-slate-700">{formatCurrency(i.unit_cost)}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (i) => (
        <StockItemActions item={i} onEdit={() => onEdit(i)} onDeleted={onChanged} />
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Buscar</Label>
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Nome ou SKU..."
            className="w-56"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Categoria</Label>
          <Select
            value={categoryId ?? ALL}
            onValueChange={(v) => onCategoryChange(v === ALL ? undefined : v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Papel</Label>
          <Select
            value={role ?? ALL}
            onValueChange={(v) => onRoleChange(v === ALL ? undefined : (v as SystemRole))}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os papéis</SelectItem>
              {ROLE_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant={belowMinimum ? "default" : "outline"}
          size="sm"
          onClick={() => onBelowMinimumChange(!belowMinimum)}
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          Apenas críticos
        </Button>
      </div>

      <DataTable<StockItem>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhum item encontrado"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={onPageChange}
        sort={sort}
        onSortChange={onSortChange}
        rowKey={(i) => i.id}
        onRowClick={onRowClick}
      />
    </div>
  )
}
