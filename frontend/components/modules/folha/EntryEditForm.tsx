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
import {
  aplicarCalculoFolha,
  deleteEntryItem,
  previewCalculoFolha,
  updateEntry,
} from "@/services/folha"
import {
  PayrollCalculationPreview,
  PayrollCalculationType,
  PayrollEntry,
} from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const schema = z.object({
  overtime_amount: z.number().min(0, "Valor deve ser >= 0"),
  deductions: z.number().min(0, "Valor deve ser >= 0"),
})

type FormData = z.infer<typeof schema>

const CALC_LABEL: Record<PayrollCalculationType, string> = {
  manual: "Manual",
  overtime: "Hora extra",
  night_shift: "Adicional noturno",
  inss: "INSS",
  fgts: "FGTS",
  transport_voucher: "Vale-transporte",
  irrf: "IRRF",
}

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
  const [calcLoading, setCalcLoading] = useState(false)
  const [calculationType, setCalculationType] =
    useState<PayrollCalculationType>("inss")
  const [quantity, setQuantity] = useState("1")
  const [percentage, setPercentage] = useState("")
  const [transportCost, setTransportCost] = useState("")
  const [startTime, setStartTime] = useState("22:00")
  const [endTime, setEndTime] = useState("05:00")
  const [rule, setRule] = useState<"urbana" | "rural">("urbana")
  const [preview, setPreview] = useState<PayrollCalculationPreview | null>(null)

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
      setPreview(null)
    }
  }, [open, entry, reset])

  useEffect(() => {
    setPreview(null)
  }, [calculationType, quantity, percentage, transportCost, startTime, endTime, rule])

  if (!entry) return null
  const currentEntry = entry

  const previewTotal =
    currentEntry.base_salary + (Number(overtime) || 0) - (Number(deductions) || 0)

  function numberOrUndefined(value: string): number | undefined {
    if (!value.trim()) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  function buildCalculationPayload() {
    return {
      calculation_type: calculationType,
      quantity:
        calculationType === "overtime" ? numberOrUndefined(quantity) : undefined,
      percentage: numberOrUndefined(percentage),
      real_transport_cost:
        calculationType === "transport_voucher"
          ? numberOrUndefined(transportCost)
          : undefined,
      start_time: calculationType === "night_shift" ? startTime : undefined,
      end_time: calculationType === "night_shift" ? endTime : undefined,
      rule: calculationType === "night_shift" ? rule : undefined,
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await updateEntry(currentEntry.id, {
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

  async function handlePreviewCalculation() {
    setCalcLoading(true)
    try {
      const result = await previewCalculoFolha(
        currentEntry.id,
        buildCalculationPayload()
      )
      setPreview(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao simular calculo")
    } finally {
      setCalcLoading(false)
    }
  }

  async function handleApplyCalculation() {
    setCalcLoading(true)
    try {
      await aplicarCalculoFolha(currentEntry.id, buildCalculationPayload())
      toast.success("Calculo aplicado ao holerite")
      setPreview(null)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar calculo")
    } finally {
      setCalcLoading(false)
    }
  }

  async function handleDeleteItem(itemId: string) {
    setCalcLoading(true)
    try {
      await deleteEntryItem(currentEntry.id, itemId)
      toast.success("Item removido")
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover item")
    } finally {
      setCalcLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Holerite - {currentEntry.employee_name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="rounded-md border bg-slate-50 p-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Salario base</span>
              <span className="font-medium">
                {formatCurrency(currentEntry.base_salary)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="overtime_amount">Horas extras (R$)</Label>
              <Input
                id="overtime_amount"
                type="number"
                step="0.01"
                {...register("overtime_amount", { valueAsNumber: true })}
              />
              {errors.overtime_amount && (
                <p className="text-xs text-red-500">
                  {errors.overtime_amount.message}
                </p>
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
          </div>

          <div className="rounded-md border-2 border-slate-300 bg-slate-100 p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Total liquido
            </span>
            <span className="text-lg font-bold text-slate-900">
              {formatCurrency(previewTotal)}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar ajustes manuais"}
            </Button>
          </div>
        </form>

        <div className="space-y-3 rounded-lg border bg-white p-4">
          <div>
            <h3 className="font-semibold text-slate-800">Calculos automaticos</h3>
            <p className="text-xs text-slate-500">
              INSS, IRRF e vale-transporte reduzem o liquido. FGTS fica informativo.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="calculation_type">Evento</Label>
              <select
                id="calculation_type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={calculationType}
                onChange={(event) =>
                  setCalculationType(event.target.value as PayrollCalculationType)
                }
              >
                <option value="inss">INSS</option>
                <option value="irrf">IRRF</option>
                <option value="fgts">FGTS</option>
                <option value="transport_voucher">Vale-transporte</option>
                <option value="overtime">Hora extra</option>
                <option value="night_shift">Adicional noturno</option>
              </select>
            </div>

            {calculationType === "overtime" && (
              <div className="space-y-1">
                <Label htmlFor="quantity">Horas</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>
            )}

            {calculationType === "transport_voucher" && (
              <div className="space-y-1">
                <Label htmlFor="transport_cost">Custo mensal real</Label>
                <Input
                  id="transport_cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={transportCost}
                  onChange={(event) => setTransportCost(event.target.value)}
                />
              </div>
            )}

            {["overtime", "night_shift", "fgts"].includes(calculationType) && (
              <div className="space-y-1">
                <Label htmlFor="percentage">Percentual (%)</Label>
                <Input
                  id="percentage"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={
                    calculationType === "fgts"
                      ? "8"
                      : calculationType === "night_shift"
                        ? "20"
                        : "50"
                  }
                  value={percentage}
                  onChange={(event) => setPercentage(event.target.value)}
                />
              </div>
            )}
          </div>

          {calculationType === "night_shift" && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="start_time">Inicio</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end_time">Fim</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule">Regra</Label>
                <select
                  id="rule"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={rule}
                  onChange={(event) => setRule(event.target.value as "urbana" | "rural")}
                >
                  <option value="urbana">Urbana</option>
                  <option value="rural">Rural</option>
                </select>
              </div>
            </div>
          )}

          {preview && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <div className="flex justify-between">
                <span>{preview.event_description}</span>
                <strong>{formatCurrency(preview.amount)}</strong>
              </div>
              <p className="mt-1 text-xs text-blue-700">
                Base: {formatCurrency(preview.calculation_base)} |{" "}
                {preview.affects_net ? "Afeta liquido" : "Informativo"}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreviewCalculation}
              disabled={calcLoading}
            >
              Simular
            </Button>
            <Button
              type="button"
              onClick={handleApplyCalculation}
              disabled={calcLoading}
            >
              {calcLoading ? "Processando..." : "Aplicar"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-slate-800">Itens do holerite</h3>
          {currentEntry.items.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-slate-500">
              Nenhum item detalhado registrado ainda.
            </p>
          ) : (
            <div className="rounded-md border">
              {currentEntry.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 border-b p-3 text-sm last:border-b-0"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      {item.event_description}
                    </p>
                    <p className="text-xs text-slate-500">
                      {CALC_LABEL[item.calculation_type]} |{" "}
                      {item.event_type === "desconto"
                        ? "Desconto"
                        : item.event_type === "informativo"
                          ? "Informativo"
                          : "Provento"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        item.event_type === "desconto"
                          ? "font-medium text-red-700"
                          : item.event_type === "informativo"
                            ? "font-medium text-blue-700"
                            : "font-medium text-green-700"
                      }
                    >
                      {item.event_type === "desconto" ? "- " : ""}
                      {formatCurrency(item.amount)}
                    </span>
                    {item.event_description !== "Salario base" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={calcLoading}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
