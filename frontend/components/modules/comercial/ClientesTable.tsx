"use client"

import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ClearFiltersButton } from "@/components/ui/clear-filters-button"
import { deleteCliente } from "@/services/comercial"
import { Client, Paginated } from "@/types/index"
import { formatDate } from "@/lib/utils"

/**
 * Monta o endereço exibível a partir dos campos estruturados (Demanda 7),
 * caindo para o endereço legado (texto livre) quando os campos novos estão
 * vazios. Espelha o `composeAddress` do fornecedor.
 */
function composeAddress(client: Client): string {
  const line1 = [client.street, client.number].filter(Boolean).join(", ")
  const withComplement = [line1, client.complement].filter(Boolean).join(" - ")
  const cityState = [client.city, client.state].filter(Boolean).join("/")
  const parts = [withComplement, client.neighborhood, cityState, client.cep].filter(
    (p) => p && p.trim()
  )
  if (parts.length > 0) return parts.join(" · ")
  return client.address ?? ""
}

/**
 * Distingue a ORIGEM da inadimplência efetiva (Demanda 9.A) para o tooltip do
 * badge: marcação manual (D7), parcela vencida (derivada) ou ambas.
 */
function delinquentTitle(client: Client): string {
  if (client.is_delinquent && client.has_overdue) {
    return "Inadimplente: marcado manualmente e com parcela vencida"
  }
  if (client.is_delinquent) return "Inadimplente: marcado manualmente"
  return "Inadimplente: possui parcela vencida"
}

/** Ações por cliente (editar + excluir) com estado próprio de exclusão. */
function ClienteActions({
  client,
  onEdit,
  onDeleted,
}: {
  client: Client
  onEdit: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteCliente(client.id)
      toast.success("Cliente excluído com sucesso")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir cliente")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
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
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              O cliente <strong>{client.name}</strong> será excluído. Esta ação não pode ser
              desfeita.
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

interface ClientesTableProps {
  data: Paginated<Client>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  search: string
  onSearchChange: (value: string) => void
  delinquentOnly: boolean
  onDelinquentOnlyChange: (value: boolean) => void
  onEdit: (client: Client) => void
  onChanged: () => void
}

export function ClientesTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  search,
  onSearchChange,
  delinquentOnly,
  onDelinquentOnlyChange,
  onEdit,
  onChanged,
}: ClientesTableProps) {
  const columns: DataTableColumn<Client>[] = [
    {
      key: "name",
      label: "Nome",
      sortable: true,
      render: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800">{c.name}</span>
            {c.is_delinquent_effective && (
              <Badge
                className="bg-red-100 text-red-700"
                title={delinquentTitle(c)}
              >
                Inadimplente
              </Badge>
            )}
          </div>
          {c.document && <p className="text-xs text-slate-500">{c.document}</p>}
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (c) => <span className="text-sm text-slate-600">{c.email ?? "—"}</span>,
    },
    {
      key: "phone",
      label: "Telefone",
      render: (c) => <span className="text-sm text-slate-600">{c.phone ?? "—"}</span>,
    },
    {
      key: "address",
      label: "Endereço",
      render: (c) => {
        const address = composeAddress(c)
        return (
          <span
            className="block max-w-[240px] truncate text-sm text-slate-500"
            title={address}
          >
            {address || "—"}
          </span>
        )
      },
    },
    {
      key: "created_at",
      label: "Cadastro",
      sortable: true,
      render: (c) => <span className="text-sm text-slate-500">{formatDate(c.created_at)}</span>,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (c) => (
        <ClienteActions client={c} onEdit={() => onEdit(c)} onDeleted={onChanged} />
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
            placeholder="Nome ou documento..."
            className="w-64"
          />
        </div>
        <Button
          variant={delinquentOnly ? "default" : "outline"}
          size="sm"
          onClick={() => onDelinquentOnlyChange(!delinquentOnly)}
        >
          Apenas inadimplentes
        </Button>

        <ClearFiltersButton
          active={Boolean(search) || delinquentOnly}
          onClear={() => {
            onSearchChange("")
            onDelinquentOnlyChange(false)
          }}
        />
      </div>

      <DataTable<Client>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhum cliente encontrado"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={onPageChange}
        sort={sort}
        onSortChange={onSortChange}
        rowKey={(c) => c.id}
      />
    </div>
  )
}
