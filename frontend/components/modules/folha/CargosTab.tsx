"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { CargoForm } from "@/components/modules/folha/CargoForm"
import { useCargos } from "@/components/modules/folha/useCargos"
import { deleteCargo } from "@/services/folha"
import { JobPosition } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

export function CargosTab() {
  const { data, loading, page, setPage, sort, toggleSort, search, setSearch, reload } =
    useCargos()

  const [formOpen, setFormOpen] = useState(false)
  const [editingCargo, setEditingCargo] = useState<JobPosition | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<JobPosition | null>(null)
  const [deleting, setDeleting] = useState(false)

  function handleNew() {
    setEditingCargo(null)
    setFormOpen(true)
  }

  function handleEdit(cargo: JobPosition) {
    setEditingCargo(cargo)
    setFormOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCargo(deleteTarget.id)
      toast.success(`Cargo "${deleteTarget.name}" excluído com sucesso`)
      setDeleteTarget(null)
      reload()
    } catch (err) {
      // Backend bloqueia exclusão de cargo com funcionário ativo vinculado (400).
      // Exibimos a mensagem do backend verbatim e mantemos o cargo na lista.
      toast.error(err instanceof Error ? err.message : "Erro ao excluir cargo")
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<JobPosition>[] = [
    {
      key: "name",
      label: "Nome",
      sortable: true,
      render: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      key: "description",
      label: "Descrição",
      render: (c) => (
        <span className="block max-w-[260px] truncate text-sm text-slate-600">
          {c.description ?? "—"}
        </span>
      ),
    },
    {
      key: "base_salary",
      label: "Salário base",
      sortable: true,
      align: "right",
      render: (c) => formatCurrency(c.base_salary),
    },
    {
      key: "is_active",
      label: "Ativo",
      render: (c) =>
        c.is_active ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ativo</Badge>
        ) : (
          <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200">Inativo</Badge>
        ),
    },
    {
      key: "actions",
      label: "Ações",
      align: "right",
      render: (c) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => handleEdit(c)}>
            <Pencil className="h-3 w-3 mr-1" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteTarget(c)}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Excluir
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input
          placeholder="Buscar cargo por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Button size="sm" onClick={handleNew}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Cargo
        </Button>
      </div>

      <DataTable<JobPosition>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhum cargo encontrado"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={setPage}
        sort={sort}
        onSortChange={toggleSort}
        rowKey={(c) => c.id}
      />

      <CargoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        cargo={editingCargo}
        onSuccess={reload}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (deleting) return
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cargo {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cargo deixará de aparecer nas listagens e no cadastro de funcionários.
              Cargos com funcionários ativos vinculados não podem ser excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
