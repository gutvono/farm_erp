"use client"

import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
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
import { deleteFornecedor } from "@/services/compras"
import { Supplier } from "@/types/index"

interface FornecedorRowProps {
  supplier: Supplier
  onEdit: () => void
  onDeleted: () => void
}

export function FornecedorRow({ supplier, onEdit, onDeleted }: FornecedorRowProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteFornecedor(supplier.id)
      toast.success("Fornecedor excluído com sucesso")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir fornecedor")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-white border-slate-200 hover:bg-slate-50 transition-colors">
      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-1 md:gap-4">
        <div>
          <p className="font-medium text-slate-800 truncate">{supplier.name}</p>
          {supplier.document && (
            <p className="text-xs text-slate-500">{supplier.document}</p>
          )}
        </div>
        <p className="text-sm text-slate-600 truncate">{supplier.email ?? "—"}</p>
        <p className="text-sm text-slate-600">{supplier.phone ?? "—"}</p>
        <p className="text-sm text-slate-500 truncate">{supplier.address ?? "—"}</p>
      </div>

      <div className="flex items-center gap-1 ml-3 flex-shrink-0">
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
              <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
              <AlertDialogDescription>
                O fornecedor <strong>{supplier.name}</strong> será excluído. Esta ação não pode
                ser desfeita.
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
