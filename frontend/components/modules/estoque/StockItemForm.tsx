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
import { createItem, updateItem } from "@/services/estoque"
import { StockCategory, StockItem, StockUnit } from "@/types/index"

const schema = z.object({
  sku: z.string().min(1, "SKU é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  category: z.enum(["cafe", "insumo", "equipamento", "veiculo", "outro"], {
    error: "Categoria é obrigatória",
  }),
  unit: z.enum(["saca", "litro", "kg", "unidade"], {
    error: "Unidade é obrigatória",
  }),
  minimum_stock: z.number().min(0, "Mínimo deve ser >= 0"),
  unit_cost: z.number().min(0, "Custo deve ser >= 0"),
  description: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const CATEGORIES: { value: StockCategory; label: string }[] = [
  { value: "cafe", label: "Café" },
  { value: "insumo", label: "Insumo" },
  { value: "equipamento", label: "Equipamento" },
  { value: "veiculo", label: "Veículo" },
  { value: "outro", label: "Outro" },
]

const UNITS: { value: StockUnit; label: string }[] = [
  { value: "saca", label: "Saca" },
  { value: "litro", label: "Litro" },
  { value: "kg", label: "Kg" },
  { value: "unidade", label: "Unidade" },
]

interface StockItemFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: StockItem | null
  onSuccess: () => void
}

export function StockItemForm({ open, onOpenChange, item, onSuccess }: StockItemFormProps) {
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: "",
      name: "",
      minimum_stock: 0,
      unit_cost: 0,
      description: "",
    },
  })

  useEffect(() => {
    if (open && item) {
      reset({
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        minimum_stock: item.minimum_stock,
        unit_cost: item.unit_cost,
        description: item.description ?? "",
      })
    } else if (open && !item) {
      reset({ sku: "", name: "", minimum_stock: 0, unit_cost: 0, description: "" })
    }
  }, [open, item, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      if (item) {
        await updateItem(item.id, {
          name: data.name,
          category: data.category as StockCategory,
          unit: data.unit as StockUnit,
          minimum_stock: data.minimum_stock,
          unit_cost: data.unit_cost,
          description: data.description,
        })
        toast.success("Item atualizado com sucesso")
      } else {
        await createItem({
          sku: data.sku,
          name: data.name,
          category: data.category as StockCategory,
          unit: data.unit as StockUnit,
          minimum_stock: data.minimum_stock,
          unit_cost: data.unit_cost,
          description: data.description || undefined,
        })
        toast.success("Item criado com sucesso")
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar item")
    } finally {
      setLoading(false)
    }
  }

  const categoryValue = watch("category")
  const unitValue = watch("unit")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Editar Item" : "Novo Item de Estoque"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                {...register("sku")}
                disabled={!!item}
                placeholder="CAFE-ESP-001"
              />
              {errors.sku && <p className="text-xs text-red-500">{errors.sku.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...register("name")} placeholder="Café Especial" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select
                value={categoryValue}
                onValueChange={(v) => setValue("category", v as StockCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-xs text-red-500">{errors.category.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Unidade</Label>
              <Select
                value={unitValue}
                onValueChange={(v) => setValue("unit", v as StockUnit)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.unit && <p className="text-xs text-red-500">{errors.unit.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="minimum_stock">Estoque Mínimo</Label>
              <Input
                id="minimum_stock"
                type="number"
                step="0.001"
                {...register("minimum_stock", { valueAsNumber: true })}
              />
              {errors.minimum_stock && (
                <p className="text-xs text-red-500">{errors.minimum_stock.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="unit_cost">Custo Unitário (R$)</Label>
              <Input
                id="unit_cost"
                type="number"
                step="0.01"
                {...register("unit_cost", { valueAsNumber: true })}
              />
              {errors.unit_cost && (
                <p className="text-xs text-red-500">{errors.unit_cost.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Input id="description" {...register("description")} placeholder="Observações..." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : item ? "Salvar alterações" : "Criar item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
