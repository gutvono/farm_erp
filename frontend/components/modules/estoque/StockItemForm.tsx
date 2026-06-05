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
import { getCategorias } from "@/services/configuracoes"
import { Category, StockItem, StockUnit } from "@/types/index"

const schema = z.object({
  sku: z.string().min(1, "SKU é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  unit: z.enum(["saca", "litro", "kg", "unidade"], {
    error: "Unidade é obrigatória",
  }),
  minimum_stock: z.number().min(0, "Mínimo deve ser >= 0"),
  unit_cost: z.number().min(0, "Custo deve ser >= 0"),
  hourly_cost: z.number().min(0).optional(),
  description: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const UNITS: { value: StockUnit; label: string }[] = [
  { value: "saca", label: "Saca" },
  { value: "litro", label: "Litro" },
  { value: "kg", label: "Kg" },
  { value: "unidade", label: "Unidade" },
]

const CATEGORIAS_PAGE_SIZE = 100

interface StockItemFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: StockItem | null
  onSuccess: () => void
}

export function StockItemForm({ open, onOpenChange, item, onSuccess }: StockItemFormProps) {
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

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

  // Carrega as categorias (com seus papéis) para o dropdown ao abrir.
  useEffect(() => {
    if (!open) return
    getCategorias({ page: 1, page_size: CATEGORIAS_PAGE_SIZE, order_by: "name", order_dir: "asc" })
      .then((res) => setCategories(res.items))
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (open && item) {
      reset({
        sku: item.sku,
        name: item.name,
        category_id: item.category_id,
        unit: item.unit,
        minimum_stock: item.minimum_stock,
        unit_cost: item.unit_cost,
        hourly_cost: item.hourly_cost ?? undefined,
        description: item.description ?? "",
      })
    } else if (open && !item) {
      reset({ sku: "", name: "", category_id: "", minimum_stock: 0, unit_cost: 0, hourly_cost: undefined, description: "" })
    }
  }, [open, item, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      if (item) {
        await updateItem(item.id, {
          name: data.name,
          category_id: data.category_id,
          unit: data.unit as StockUnit,
          minimum_stock: data.minimum_stock,
          unit_cost: data.unit_cost,
          hourly_cost: data.hourly_cost,
          description: data.description,
        })
        toast.success("Item atualizado com sucesso")
      } else {
        await createItem({
          sku: data.sku,
          name: data.name,
          category_id: data.category_id,
          unit: data.unit as StockUnit,
          minimum_stock: data.minimum_stock,
          unit_cost: data.unit_cost,
          hourly_cost: data.hourly_cost,
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

  const categoryValue = watch("category_id")
  const unitValue = watch("unit")

  // Custo por hora só faz sentido para itens cuja categoria tem papel de máquina
  // ou veículo (entram no cálculo de custo por hora).
  const selectedCategory = categories.find((c) => c.id === categoryValue)
  const showHourlyCost =
    selectedCategory?.roles.includes("maquina") ||
    selectedCategory?.roles.includes("veiculo")

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
                value={categoryValue ?? ""}
                onValueChange={(v) => setValue("category_id", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category_id && (
                <p className="text-xs text-red-500">{errors.category_id.message}</p>
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

          {showHourlyCost && (
            <div className="space-y-1">
              <Label htmlFor="hourly_cost">Custo por Hora (R$) — opcional</Label>
              <Input
                id="hourly_cost"
                type="number"
                step="0.01"
                placeholder="Ex: 35.00"
                {...register("hourly_cost", { valueAsNumber: true })}
              />
              {errors.hourly_cost && (
                <p className="text-xs text-red-500">{errors.hourly_cost.message}</p>
              )}
            </div>
          )}

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
