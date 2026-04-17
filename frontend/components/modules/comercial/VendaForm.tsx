"use client"

import { useEffect, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertTriangle, Plus, Trash2 } from "lucide-react"
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
import { createVenda } from "@/services/comercial"
import { Client, StockItem } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const itemSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um item"),
  quantity: z.number().positive("Qtd > 0"),
  unit_price: z.number().min(0, "Preço >= 0"),
})

const schema = z.object({
  client_id: z.string().min(1, "Selecione um cliente"),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "Adicione pelo menos 1 item"),
})

type FormData = z.infer<typeof schema>

interface VendaFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
  stockItems: StockItem[]
  onSuccess: () => void
}

export function VendaForm({
  open,
  onOpenChange,
  clients,
  stockItems,
  onSuccess,
}: VendaFormProps) {
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
      client_id: "",
      notes: "",
      items: [{ stock_item_id: "", quantity: 0, unit_price: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "items" })

  const watchedItems = watch("items")
  const clientId = watch("client_id")
  const selectedClient = clients.find((c) => c.id === clientId)

  const totalAmount = watchedItems.reduce((acc, item) => {
    const q = Number(item.quantity) || 0
    const p = Number(item.unit_price) || 0
    return acc + q * p
  }, 0)

  useEffect(() => {
    if (open) {
      reset({
        client_id: "",
        notes: "",
        items: [{ stock_item_id: "", quantity: 0, unit_price: 0 }],
      })
    }
  }, [open, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await createVenda({
        client_id: data.client_id,
        notes: data.notes || undefined,
        items: data.items.map((item) => ({
          stock_item_id: item.stock_item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      })
      toast.success("Venda criada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar venda")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Venda</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Cliente *</Label>
              <Select
                value={clientId}
                onValueChange={(v) => setValue("client_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.is_delinquent ? " ⚠️" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.client_id && (
                <p className="text-xs text-red-500">{errors.client_id.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Observações</Label>
              <Input id="notes" {...register("notes")} placeholder="Informações adicionais..." />
            </div>
          </div>

          {selectedClient?.is_delinquent && (
            <div className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Este cliente está marcado como inadimplente
            </div>
          )}

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ stock_item_id: "", quantity: 0, unit_price: 0 })}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar item
              </Button>
            </div>

            {errors.items && typeof errors.items.message === "string" && (
              <p className="text-xs text-red-500">{errors.items.message}</p>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => {
                const qty = Number(watchedItems[idx]?.quantity) || 0
                const price = Number(watchedItems[idx]?.unit_price) || 0
                const lineTotal = qty * price

                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5 space-y-1">
                      {idx === 0 && <Label className="text-xs">Item</Label>}
                      <Select
                        value={watchedItems[idx]?.stock_item_id ?? ""}
                        onValueChange={(v) => setValue(`items.${idx}.stock_item_id`, v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {stockItems.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} ({s.quantity_on_hand} {s.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.items?.[idx]?.stock_item_id && (
                        <p className="text-xs text-red-500">
                          {errors.items[idx]?.stock_item_id?.message}
                        </p>
                      )}
                    </div>

                    <div className="col-span-2 space-y-1">
                      {idx === 0 && <Label className="text-xs">Quantidade</Label>}
                      <Input
                        type="number"
                        step="0.001"
                        {...register(`items.${idx}.quantity`, { valueAsNumber: true })}
                      />
                    </div>

                    <div className="col-span-2 space-y-1">
                      {idx === 0 && <Label className="text-xs">Preço Unit.</Label>}
                      <Input
                        type="number"
                        step="0.01"
                        {...register(`items.${idx}.unit_price`, { valueAsNumber: true })}
                      />
                    </div>

                    <div className="col-span-2 space-y-1">
                      {idx === 0 && <Label className="text-xs">Subtotal</Label>}
                      <div className="h-9 flex items-center px-2 rounded-md border bg-slate-50 text-sm font-medium">
                        {formatCurrency(lineTotal)}
                      </div>
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
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm font-semibold text-slate-700">
              Total:{" "}
              <span className="text-lg font-bold text-slate-900">
                {formatCurrency(totalAmount)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Criando..." : "Criar venda"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
