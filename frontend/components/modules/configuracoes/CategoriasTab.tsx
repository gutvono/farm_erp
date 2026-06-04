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
import { CategoriaForm } from "@/components/modules/configuracoes/CategoriaForm"
import { useCategorias } from "@/components/modules/configuracoes/useCategorias"
import { roleLabel } from "@/components/modules/configuracoes/roleLabels"
import { deleteCategoria } from "@/services/configuracoes"
import { Category } from "@/types/index"

export function CategoriasTab() {
  const { data, loading, page, setPage, sort, toggleSort, search, setSearch, reload } =
    useCategorias()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  function handleNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function handleEdit(categoria: Category) {
    setEditing(categoria)
    setFormOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCategoria(deleteTarget.id)
      toast.success(`Categoria "${deleteTarget.name}" excluída com sucesso`)
      setDeleteTarget(null)
      reload()
    } catch (err) {
      // Backend bloqueia exclusão de categoria com itens vinculados (400).
      // Exibimos a mensagem verbatim e mantemos a categoria na lista.
      toast.error(err instanceof Error ? err.message : "Erro ao excluir categoria")
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<Category>[] = [
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
        <span className="block max-w-[240px] truncate text-sm text-slate-600">
          {c.description ?? "—"}
        </span>
      ),
    },
    {
      key: "roles",
      label: "Papéis",
      render: (c) =>
        c.roles.length === 0 ? (
          <span className="text-sm text-slate-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {c.roles.map((r) => (
              <Badge key={r} className="bg-indigo-50 text-indigo-700 border border-indigo-200">
                {roleLabel(r)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "is_active",
      label: "Situação",
      render: (c) =>
        c.is_active ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ativa</Badge>
        ) : (
          <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200">Inativa</Badge>
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
          placeholder="Buscar categoria por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Button size="sm" onClick={handleNew}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Categoria
        </Button>
      </div>

      <DataTable<Category>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhuma categoria encontrada"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={setPage}
        sort={sort}
        onSortChange={toggleSort}
        rowKey={(c) => c.id}
      />

      <CategoriaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categoria={editing}
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
            <AlertDialogTitle>Excluir categoria {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria deixará de aparecer nas listagens e no cadastro de itens.
              Categorias com itens vinculados não podem ser excluídas.
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
