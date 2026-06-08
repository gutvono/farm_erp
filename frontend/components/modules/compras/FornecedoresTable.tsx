"use client"

import { useMemo, useState } from "react"
import { BookOpen, Pencil, Trash2 } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { deleteFornecedor } from "@/services/compras"
import { StockItem, Supplier } from "@/types/index"
import { CatalogoFornecedorModal } from "./CatalogoFornecedorModal"

const PAGE_SIZE = 10

/**
 * Monta o endereço exibível a partir dos campos estruturados (Demanda 6),
 * caindo para o endereço legado (texto livre) quando os campos novos estão
 * vazios.
 */
export function composeAddress(supplier: Supplier): string {
  const line1 = [supplier.street, supplier.number].filter(Boolean).join(", ")
  const withComplement = [line1, supplier.complement].filter(Boolean).join(" - ")
  const cityState = [supplier.city, supplier.state].filter(Boolean).join("/")
  const parts = [
    withComplement,
    supplier.neighborhood,
    cityState,
    supplier.cep,
  ].filter((p) => p && p.trim())
  if (parts.length > 0) return parts.join(" · ")
  return supplier.address ?? ""
}

/** Célula de ações com estado próprio (catálogo + exclusão) por fornecedor. */
function FornecedorActions({
  supplier,
  stockItems,
  onEdit,
  onDeleted,
}: {
  supplier: Supplier
  stockItems: StockItem[]
  onEdit: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [catalogoOpen, setCatalogoOpen] = useState(false)

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
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCatalogoOpen(true)}
        title="Itens vendidos (catálogo)"
      >
        <BookOpen className="h-4 w-4 text-slate-600" />
      </Button>

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
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              O fornecedor <strong>{supplier.name}</strong> será excluído. Esta ação
              não pode ser desfeita.
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

      <CatalogoFornecedorModal
        open={catalogoOpen}
        onOpenChange={setCatalogoOpen}
        supplier={supplier}
        stockItems={stockItems}
      />
    </div>
  )
}

interface FornecedoresTableProps {
  suppliers: Supplier[]
  loading: boolean
  stockItems: StockItem[]
  onEdit: (supplier: Supplier) => void
  onChanged: () => void
}

/**
 * Lista de fornecedores em DataTable (Demanda 0) com busca, ordenação e
 * paginação no cliente — o endpoint de fornecedores devolve a lista completa.
 */
export function FornecedoresTable({
  suppliers,
  loading,
  stockItems,
  onEdit,
  onChanged,
}: FornecedoresTableProps) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<{ by: string; dir: "asc" | "desc" }>({
    by: "name",
    dir: "asc",
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const base = term
      ? suppliers.filter((s) =>
          [s.name, s.document, s.email]
            .filter(Boolean)
            .some((v) => (v as string).toLowerCase().includes(term))
        )
      : suppliers
    const sorted = [...base].sort((a, b) => {
      const av = (a[sort.by as keyof Supplier] ?? "") as string
      const bv = (b[sort.by as keyof Supplier] ?? "") as string
      const cmp = String(av).localeCompare(String(bv), "pt-BR", {
        sensitivity: "base",
      })
      return sort.dir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [suppliers, search, sort])

  const total = filtered.length
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1)
  const currentPage = Math.min(page, pages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.by === key
        ? { by: key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { by: key, dir: "asc" }
    )
    setPage(1)
  }

  const columns: DataTableColumn<Supplier>[] = [
    {
      key: "name",
      label: "Nome",
      sortable: true,
      render: (s) => (
        <div>
          <p className="font-medium text-slate-800">{s.name}</p>
          {s.document && <p className="text-xs text-slate-500">{s.document}</p>}
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (s) => <span className="text-sm text-slate-600">{s.email ?? "—"}</span>,
    },
    {
      key: "phone",
      label: "Telefone",
      render: (s) => <span className="text-sm text-slate-600">{s.phone ?? "—"}</span>,
    },
    {
      key: "address",
      label: "Endereço",
      render: (s) => {
        const address = composeAddress(s)
        return (
          <span
            className="block max-w-[260px] truncate text-sm text-slate-500"
            title={address}
          >
            {address || "—"}
          </span>
        )
      },
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (s) => (
        <FornecedorActions
          supplier={s}
          stockItems={stockItems}
          onEdit={() => onEdit(s)}
          onDeleted={onChanged}
        />
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-slate-500">Buscar</Label>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Nome, documento ou e-mail..."
          className="w-72"
        />
      </div>

      <DataTable<Supplier>
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="Nenhum fornecedor cadastrado"
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={total}
        pages={pages}
        onPageChange={setPage}
        sort={sort}
        onSortChange={toggleSort}
        rowKey={(s) => s.id}
      />
    </div>
  )
}
