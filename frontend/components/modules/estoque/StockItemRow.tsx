"use client"

import { useState } from "react"
import { AlertTriangle, Pencil, Trash2 } from "lucide-react"
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
import { deleteItem } from "@/services/estoque"
import { StockItem, StockCategory } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const CATEGORY_LABELS: Record<StockCategory, string> = {
  cafe: "Café",
  insumo: "Insumo",
  equipamento: "Equipamento",
  veiculo: "Veículo",
  outro: "Outro",
}

const CATEGORY_COLORS: Record<StockCategory, string> = {
  cafe: "bg-amber-100 text-amber-800",
  insumo: "bg-green-100 text-green-800",
  equipamento: "bg-blue-100 text-blue-800",
  veiculo: "bg-purple-100 text-purple-800",
  outro: "bg-slate-100 text-slate-700",
}

interface StockItemRowProps {
  item: StockItem
  onClick: () => void
  onEdit: () => void
  onDeleted: () => void
}

export function StockItemRow({ item, onClick, onEdit, onDeleted }: StockItemRowProps) {
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
      className={`flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors ${
        item.is_below_minimum ? "bg-yellow-50 border-yellow-200" : "bg-white border-slate-200"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {item.is_below_minimum && (
          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-slate-800 truncate">{item.name}</p>
          <p className="text-xs text-slate-500">{item.sku}</p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-6 mx-4">
        <Badge className={CATEGORY_COLORS[item.category]}>
          {CATEGORY_LABELS[item.category]}
        </Badge>
        <span className="text-sm text-slate-600 w-20 text-right">
          {item.quantity_on_hand} {item.unit}
        </span>
        <span className="text-sm text-slate-500 w-20 text-right">
          mín: {item.minimum_stock}
        </span>
        <span className="text-sm text-slate-700 w-28 text-right font-medium">
          {formatCurrency(item.unit_cost)}
        </span>
      </div>

      <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" disabled={deleting}>
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
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
