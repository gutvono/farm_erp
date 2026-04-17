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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createAtividade } from "@/services/pcp"
import { ActivityType, LaborType, Plot } from "@/types/index"

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "plantio", label: "Plantio" },
  { value: "adubacao", label: "Adubação" },
  { value: "poda", label: "Poda" },
  { value: "colheita", label: "Colheita" },
  { value: "irrigacao", label: "Irrigação" },
  { value: "outra", label: "Outra" },
]

const schema = z.object({
  plot_id: z.string().min(1, "Selecione um talhão"),
  activity_type: z.enum(
    ["plantio", "adubacao", "poda", "colheita", "irrigacao", "outra"],
    { error: "Tipo é obrigatório" }
  ),
  activity_date: z.string().min(1, "Data é obrigatória"),
  labor_type: z.enum(["interna", "externa"], { error: "Tipo de mão de obra é obrigatório" }),
  cost: z.number().min(0, "Custo deve ser >= 0"),
  details: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface AtividadeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plots: Plot[]
  defaultPlotId?: string
  onSuccess: () => void
}

export function AtividadeForm({
  open,
  onOpenChange,
  plots,
  defaultPlotId,
  onSuccess,
}: AtividadeFormProps) {
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { cost: 0, details: "" },
  })

  const plotId = watch("plot_id")
  const activityType = watch("activity_type")
  const laborType = watch("labor_type")

  useEffect(() => {
    if (open) {
      reset({
        plot_id: defaultPlotId ?? "",
        activity_type: undefined,
        activity_date: "",
        labor_type: undefined,
        cost: 0,
        details: "",
      })
    }
  }, [open, defaultPlotId, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await createAtividade({
        plot_id: data.plot_id,
        activity_type: data.activity_type as ActivityType,
        activity_date: data.activity_date,
        labor_type: data.labor_type as LaborType,
        cost: data.cost,
        details: data.details || undefined,
      })
      toast.success("Atividade registrada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar atividade")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Atividade</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Talhão *</Label>
            <Select value={plotId} onValueChange={(v) => setValue("plot_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o talhão" />
              </SelectTrigger>
              <SelectContent>
                {plots.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.plot_id && (
              <p className="text-xs text-red-500">{errors.plot_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tipo de Atividade *</Label>
              <Select
                value={activityType}
                onValueChange={(v) => setValue("activity_type", v as ActivityType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.activity_type && (
                <p className="text-xs text-red-500">{errors.activity_type.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="activity_date">Data *</Label>
              <Input id="activity_date" type="date" {...register("activity_date")} />
              {errors.activity_date && (
                <p className="text-xs text-red-500">{errors.activity_date.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Mão de Obra *</Label>
              <Select
                value={laborType}
                onValueChange={(v) => setValue("labor_type", v as LaborType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interna">Interna</SelectItem>
                  <SelectItem value="externa">Externa</SelectItem>
                </SelectContent>
              </Select>
              {errors.labor_type && (
                <p className="text-xs text-red-500">{errors.labor_type.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="cost">Custo (R$)</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                {...register("cost", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="details">Detalhes</Label>
            <Input id="details" {...register("details")} placeholder="Observações sobre a atividade..." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrar atividade"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
