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
import { createMovimentacao } from "@/services/estoque"
import { StockItem, StockMovementType } from "@/types/index"

const schema = z.object({
  stock_item_id: z.string().min(1, "Selecione um item"),
  movement_type: z.enum(["entrada", "saida"], { error: "Tipo é obrigatório" }),
  quantity: z.number().positive("Quantidade deve ser maior que 0"),
  unit_cost: z.number().min(0, "Custo deve ser >= 0").optional(),
  description: z.string().min(1, "Motivo é obrigatório"),
})

type FormData = z.infer<typeof schema>

interface MovimentacaoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: StockItem[]
  onSuccess: () => void
}

export function MovimentacaoForm({
  open,
  onOpenChange,
  items,
  onSuccess,
}: MovimentacaoFormProps) {
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
    defaultValues: { quantity: 0, unit_cost: 0, description: "" },
  })

  const movementType = watch("movement_type")
  const selectedItemId = watch("stock_item_id")
  const selectedItem = items.find((i) => i.id === selectedItemId)

  useEffect(() => {
    if (open) reset({ quantity: 0, unit_cost: 0, description: "" })
  }, [open, reset])

  async function onSubmit(data: FormData) {
    if (data.movement_type === "saida" && selectedItem) {
      if (data.quantity > selectedItem.quantity_on_hand) {
        toast.error(
          `Quantidade insuficiente. Disponível: ${selectedItem.quantity_on_hand} ${selectedItem.unit}`
        )
        return
      }
    }

    setLoading(true)
    try {
      await createMovimentacao({
        stock_item_id: data.stock_item_id,
        movement_type: data.movement_type as StockMovementType,
        quantity: data.quantity,
        unit_cost: data.movement_type === "entrada" ? (data.unit_cost ?? 0) : undefined,
        description: data.description,
      })
      toast.success("Movimentação registrada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar movimentação")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Movimentação</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Item</Label>
            <Select
              value={selectedItemId}
              onValueChange={(v) => setValue("stock_item_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.quantity_on_hand} {item.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.stock_item_id && (
              <p className="text-xs text-red-500">{errors.stock_item_id.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select
              value={movementType}
              onValueChange={(v) => setValue("movement_type", v as StockMovementType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
              </SelectContent>
            </Select>
            {errors.movement_type && (
              <p className="text-xs text-red-500">{errors.movement_type.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="quantity">
              Quantidade
              {selectedItem && (
                <span className="text-slate-500 ml-1">
                  (disponível: {selectedItem.quantity_on_hand} {selectedItem.unit})
                </span>
              )}
            </Label>
            <Input
              id="quantity"
              type="number"
              step="0.001"
              {...register("quantity", { valueAsNumber: true })}
            />
            {errors.quantity && (
              <p className="text-xs text-red-500">{errors.quantity.message}</p>
            )}
          </div>

          {movementType === "entrada" && (
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
          )}

          <div className="space-y-1">
            <Label htmlFor="description">Motivo</Label>
            <Input
              id="description"
              {...register("description")}
              placeholder="Ex: Compra fornecedor X, Ajuste de inventário..."
            />
            {errors.description && (
              <p className="text-xs text-red-500">{errors.description.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
