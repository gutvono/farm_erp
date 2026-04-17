"use client"

import { useEffect, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Trash2 } from "lucide-react"
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
import { createOrdem } from "@/services/pcp"
import { Plot, StockItem } from "@/types/index"

const inputSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um insumo"),
  quantity: z.number().positive("Qtd > 0"),
})

const schema = z.object({
  plot_id: z.string().min(1, "Selecione um talhão"),
  planned_date: z.string().min(1, "Data planejada é obrigatória"),
  notes: z.string().optional(),
  inputs: z.array(inputSchema).min(1, "Adicione pelo menos 1 insumo"),
})

type FormData = z.infer<typeof schema>

interface OrdemProducaoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plots: Plot[]
  insumos: StockItem[]
  onSuccess: () => void
}

export function OrdemProducaoForm({
  open,
  onOpenChange,
  plots,
  insumos,
  onSuccess,
}: OrdemProducaoFormProps) {
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      plot_id: "",
      planned_date: "",
      notes: "",
      inputs: [{ stock_item_id: "", quantity: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "inputs" })
  const plotId = watch("plot_id")
  const watchedInputs = watch("inputs")

  useEffect(() => {
    if (open) {
      reset({
        plot_id: "",
        planned_date: "",
        notes: "",
        inputs: [{ stock_item_id: "", quantity: 0 }],
      })
    }
  }, [open, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await createOrdem({
        plot_id: data.plot_id,
        planned_date: data.planned_date,
        notes: data.notes || undefined,
        inputs: data.inputs.map((inp) => ({
          stock_item_id: inp.stock_item_id,
          quantity: inp.quantity,
        })),
      })
      toast.success("Ordem de produção criada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar ordem de produção")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Produção</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Talhão *</Label>
              <Select value={plotId} onValueChange={(v) => setValue("plot_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o talhão" />
                </SelectTrigger>
                <SelectContent>
                  {plots.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.capacity_sacas} sacas
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.plot_id && (
                <p className="text-xs text-red-500">{errors.plot_id.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="planned_date">Data Planejada *</Label>
              <Input id="planned_date" type="date" {...register("planned_date")} />
              {errors.planned_date && (
                <p className="text-xs text-red-500">{errors.planned_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" {...register("notes")} placeholder="Observações sobre a safra..." />
          </div>

          {/* Insumos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Insumos *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ stock_item_id: "", quantity: 0 })}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar insumo
              </Button>
            </div>

            {errors.inputs && typeof errors.inputs.message === "string" && (
              <p className="text-xs text-red-500">{errors.inputs.message}</p>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-8 space-y-1">
                    {idx === 0 && <Label className="text-xs">Insumo</Label>}
                    <Select
                      value={watchedInputs[idx]?.stock_item_id ?? ""}
                      onValueChange={(v) => setValue(`inputs.${idx}.stock_item_id`, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o insumo" />
                      </SelectTrigger>
                      <SelectContent>
                        {insumos.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.quantity_on_hand} {s.unit} disp.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.inputs?.[idx]?.stock_item_id && (
                      <p className="text-xs text-red-500">
                        {errors.inputs[idx]?.stock_item_id?.message}
                      </p>
                    )}
                  </div>

                  <div className="col-span-3 space-y-1">
                    {idx === 0 && <Label className="text-xs">Quantidade</Label>}
                    <Input
                      type="number"
                      step="0.001"
                      {...register(`inputs.${idx}.quantity`, { valueAsNumber: true })}
                    />
                  </div>

                  <div className="col-span-1">
                    {idx === 0 && <div className="text-xs invisible">X</div>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length === 1}
                      onClick={() => remove(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar ordem"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
