"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateEntry } from "@/services/folha"
import { PayrollEntry } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const schema = z.object({
  overtime_amount: z.number().min(0, "Valor deve ser >= 0"),
  deductions: z.number().min(0, "Valor deve ser >= 0"),
})

type FormData = z.infer<typeof schema>

interface EntryEditFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: PayrollEntry | null
  onSuccess: () => void
}

export function EntryEditForm({
  open,
  onOpenChange,
  entry,
  onSuccess,
}: EntryEditFormProps) {
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { overtime_amount: 0, deductions: 0 },
  })

  const overtime = watch("overtime_amount")
  const deductions = watch("deductions")

  useEffect(() => {
    if (open && entry) {
      reset({
        overtime_amount: entry.overtime_amount,
        deductions: entry.deductions,
      })
    }
  }, [open, entry, reset])

  if (!entry) return null

  const previewTotal =
    entry.base_salary + (Number(overtime) || 0) - (Number(deductions) || 0)

  async function onSubmit(data: FormData) {
    if (!entry) return
    setLoading(true)
    try {
      await updateEntry(entry.id, {
        overtime_amount: data.overtime_amount,
        deductions: data.deductions,
      })
      toast.success("Holerite atualizado")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar holerite")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Holerite — {entry.employee_name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="rounded-md border bg-slate-50 p-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Salário base</span>
              <span className="font-medium">{formatCurrency(entry.base_salary)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="overtime_amount">Horas extras (R$)</Label>
            <Input
              id="overtime_amount"
              type="number"
              step="0.01"
              {...register("overtime_amount", { valueAsNumber: true })}
            />
            {errors.overtime_amount && (
              <p className="text-xs text-red-500">{errors.overtime_amount.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="deductions">Descontos (R$)</Label>
            <Input
              id="deductions"
              type="number"
              step="0.01"
              {...register("deductions", { valueAsNumber: true })}
            />
            {errors.deductions && (
              <p className="text-xs text-red-500">{errors.deductions.message}</p>
            )}
          </div>

          <div className="rounded-md border-2 border-slate-300 bg-slate-100 p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Total líquido</span>
            <span className="text-lg font-bold text-slate-900">
              {formatCurrency(previewTotal)}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
