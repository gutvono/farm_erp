"use client"

import { useState } from "react"
import { Pencil, UserMinus } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
} from "@/components/ui/alert-dialog"
import { DataTable, DataTableColumn } from "@/components/ui/data-table"
import { demitirFuncionario } from "@/services/folha"
import { ContractType, Employee, Paginated } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

const ALL = "all"

const CONTRACT_LABEL: Record<ContractType, string> = {
  clt: "CLT",
  pj: "PJ",
  temporario: "Temporário",
}

const CONTRACT_CLASS: Record<ContractType, string> = {
  clt: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  pj: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  temporario: "bg-orange-100 text-orange-800 hover:bg-orange-100",
}

const DEFAULT_TERMINATION_COST: Record<ContractType, number> = {
  clt: 5000,
  pj: 1000,
  temporario: 500,
}

const CONTRACT_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: "Todos os contratos" },
  { value: "clt", label: "CLT" },
  { value: "pj", label: "PJ" },
  { value: "temporario", label: "Temporário" },
]

/** Ações por funcionário (editar + demitir com custo de rescisão). */
function FuncionarioActions({
  employee,
  onEdit,
  onDemitted,
}: {
  employee: Employee
  onEdit: () => void
  onDemitted: () => void
}) {
  const [demitirOpen, setDemitirOpen] = useState(false)
  const [demitting, setDemitting] = useState(false)

  const terminationCost =
    employee.termination_cost_override ?? DEFAULT_TERMINATION_COST[employee.contract_type]

  async function handleDemitir() {
    setDemitting(true)
    try {
      await demitirFuncionario(employee.id)
      toast.success(`${employee.name} demitido com sucesso`)
      onDemitted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao demitir funcionário")
    } finally {
      setDemitting(false)
      setDemitirOpen(false)
    }
  }

  if (!employee.is_active) {
    return <span className="text-xs text-slate-400">—</span>
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => setDemitirOpen(true)}
          title="Demitir"
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={demitirOpen} onOpenChange={setDemitirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Demitir {employee.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O custo de demissão é de <strong>{formatCurrency(terminationCost)}</strong> (
              {CONTRACT_LABEL[employee.contract_type]}). Isso será lançado no financeiro como
              saída e uma conta a pagar será criada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDemitir}
              disabled={demitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {demitting ? "Demitindo..." : "Confirmar demissão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface FuncionariosTableProps {
  data: Paginated<Employee>
  loading: boolean
  page: number
  sort: { by: string; dir: "asc" | "desc" }
  onPageChange: (page: number) => void
  onSortChange: (key: string) => void
  search: string
  onSearchChange: (value: string) => void
  activeOnly: boolean
  onActiveOnlyChange: (value: boolean) => void
  contractType: ContractType | undefined
  onContractTypeChange: (value: ContractType | undefined) => void
  onEdit: (employee: Employee) => void
  onChanged: () => void
}

export function FuncionariosTable({
  data,
  loading,
  page,
  sort,
  onPageChange,
  onSortChange,
  search,
  onSearchChange,
  activeOnly,
  onActiveOnlyChange,
  contractType,
  onContractTypeChange,
  onEdit,
  onChanged,
}: FuncionariosTableProps) {
  const columns: DataTableColumn<Employee>[] = [
    {
      key: "name",
      label: "Funcionário",
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-9 w-9 flex-shrink-0">
            {e.photo_url ? <AvatarImage src={e.photo_url} alt={e.name} /> : null}
            <AvatarFallback className="bg-slate-200 text-slate-700 text-sm font-semibold">
              {e.name.trim().charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate">{e.name}</p>
            <p className="text-xs text-slate-500 truncate">{e.position_name}</p>
          </div>
        </div>
      ),
    },
    {
      key: "contract_type",
      label: "Contrato",
      render: (e) => (
        <Badge className={CONTRACT_CLASS[e.contract_type]}>
          {CONTRACT_LABEL[e.contract_type]}
        </Badge>
      ),
    },
    {
      key: "base_salary",
      label: "Salário base",
      align: "right",
      render: (e) => (
        <span className="text-sm font-medium text-slate-700">
          {formatCurrency(e.base_salary)}
        </span>
      ),
    },
    {
      key: "admission_date",
      label: "Admissão",
      render: (e) => <span className="text-sm text-slate-500">{formatDate(e.admission_date)}</span>,
    },
    {
      key: "is_active",
      label: "Situação",
      render: (e) =>
        e.is_active ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ativo</Badge>
        ) : (
          <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200">Inativo</Badge>
        ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (e) => (
        <FuncionarioActions employee={e} onEdit={() => onEdit(e)} onDemitted={onChanged} />
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
            className="w-56"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">Contrato</Label>
          <Select
            value={contractType ?? ALL}
            onValueChange={(v) =>
              onContractTypeChange(v === ALL ? undefined : (v as ContractType))
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant={activeOnly ? "default" : "outline"}
          size="sm"
          onClick={() => onActiveOnlyChange(!activeOnly)}
        >
          {activeOnly ? "Apenas ativos" : "Todos"}
        </Button>
      </div>

      <DataTable<Employee>
        columns={columns}
        rows={data.items}
        loading={loading}
        emptyMessage="Nenhum funcionário encontrado"
        page={page}
        pageSize={data.page_size}
        total={data.total}
        pages={data.pages}
        onPageChange={onPageChange}
        sort={sort}
        onSortChange={onSortChange}
        rowKey={(e) => e.id}
      />
    </div>
  )
}
