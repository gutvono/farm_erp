"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { pagarEntry } from "@/services/folha"
import {
  ContractType,
  Employee,
  PayrollEntry,
  PayrollEntryStatus,
  PayrollPeriod,
} from "@/types/index"
import { formatCurrency } from "@/lib/utils"
import { EntryEditForm } from "./EntryEditForm"
import { HoleritePDF } from "./HoleritePDF"

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

const STATUS_CLASS: Record<PayrollEntryStatus, string> = {
  pendente: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  pago: "bg-green-100 text-green-800 hover:bg-green-100",
}

const STATUS_LABEL: Record<PayrollEntryStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
}

interface EntryRowProps {
  entry: PayrollEntry
  period: PayrollPeriod
  employee?: Employee
  onChanged: () => void
}

export function EntryRow({ entry, period, employee, onChanged }: EntryRowProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [paying, setPaying] = useState(false)

  const canEdit = period.status === "aberta" && entry.status === "pendente"
  const initial = entry.employee_name.trim().charAt(0).toUpperCase()

  async function handlePagar() {
    setPaying(true)
    try {
      await pagarEntry(entry.id)
      toast.success(`Holerite de ${entry.employee_name} pago`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao pagar holerite")
    } finally {
      setPaying(false)
    }
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {employee?.photo_url ? (
                <AvatarImage src={employee.photo_url} alt={entry.employee_name} />
              ) : null}
              <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-slate-800">{entry.employee_name}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge className={CONTRACT_CLASS[entry.contract_type]}>
            {CONTRACT_LABEL[entry.contract_type]}
          </Badge>
        </TableCell>
        <TableCell className="text-right">{formatCurrency(entry.base_salary)}</TableCell>
        <TableCell className="text-right text-green-700">
          {entry.overtime_amount > 0 ? `+ ${formatCurrency(entry.overtime_amount)}` : "—"}
        </TableCell>
        <TableCell className="text-right text-red-700">
          {entry.deductions > 0 ? `- ${formatCurrency(entry.deductions)}` : "—"}
        </TableCell>
        <TableCell className="text-right font-bold text-slate-900">
          {formatCurrency(entry.total_amount)}
        </TableCell>
        <TableCell>
          <Badge className={STATUS_CLASS[entry.status]}>
            {STATUS_LABEL[entry.status]}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditOpen(true)}
                title="Editar"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={handlePagar} disabled={paying}>
                {paying ? "..." : "Pagar"}
              </Button>
            )}
            <HoleritePDF entry={entry} period={period} employee={employee} />
          </div>
        </TableCell>
      </TableRow>

      <EntryEditForm
        open={editOpen}
        onOpenChange={setEditOpen}
        entry={entry}
        onSuccess={onChanged}
      />
    </>
  )
}
