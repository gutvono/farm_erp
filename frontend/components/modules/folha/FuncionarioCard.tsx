"use client"

import { useState } from "react"
import { Pencil, UserMinus } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { demitirFuncionario } from "@/services/folha"
import { ContractType, Employee } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

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

interface FuncionarioCardProps {
  employee: Employee
  onEdit: () => void
  onDemitted: () => void
}

export function FuncionarioCard({ employee, onEdit, onDemitted }: FuncionarioCardProps) {
  const [demitirOpen, setDemitirOpen] = useState(false)
  const [demitting, setDemitting] = useState(false)

  const initial = employee.name.trim().charAt(0).toUpperCase()
  const terminationCost =
    employee.termination_cost_override ??
    DEFAULT_TERMINATION_COST[employee.contract_type]

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

  return (
    <>
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-14 w-14 flex-shrink-0">
              {employee.photo_url ? (
                <AvatarImage src={employee.photo_url} alt={employee.name} />
              ) : null}
              <AvatarFallback className="bg-slate-200 text-slate-700 text-lg font-semibold">
                {initial}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{employee.name}</p>
                  <p className="text-sm text-slate-500 truncate">{employee.role}</p>
                </div>
                {!employee.is_active && (
                  <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200 flex-shrink-0">
                    Inativo
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className={CONTRACT_CLASS[employee.contract_type]}>
                  {CONTRACT_LABEL[employee.contract_type]}
                </Badge>
                <span className="text-sm font-medium text-slate-700">
                  {formatCurrency(employee.base_salary)}
                </span>
              </div>

              <p className="text-xs text-slate-500 mt-1">
                Admissão: {formatDate(employee.admission_date)}
              </p>

              {employee.is_active && (
                <div className="flex items-center gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={onEdit}>
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDemitirOpen(true)}
                  >
                    <UserMinus className="h-3 w-3 mr-1" />
                    Demitir
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={demitirOpen} onOpenChange={setDemitirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Demitir {employee.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O custo de demissão é de{" "}
              <strong>{formatCurrency(terminationCost)}</strong> (
              {CONTRACT_LABEL[employee.contract_type]}). Isso será lançado no financeiro
              como saída e uma conta a pagar será criada.
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
