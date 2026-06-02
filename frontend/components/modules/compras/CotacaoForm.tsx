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
import { createCotacao } from "@/services/compras"
import { StockItem } from "@/types/index"

const itemSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um item"),
  quantity: z.number({ error: "Informe a quantidade" }).positive("Qtd > 0"),
})

const schema = z
  .object({
    order_type: z.enum(["produto", "servico"]),
    service_description: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(itemSchema),
  })
  .superRefine((data, ctx) => {
    if (data.order_type === "servico") {
      if (!data.service_description || !data.service_description.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Descreva o serviço",
          path: ["service_description"],
        })
      }
    } else {
      if (!data.items || data.items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Adicione pelo menos 1 item",
          path: ["items"],
        })
      }
    }
  })

type FormData = z.infer<typeof schema>

interface CotacaoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stockItems: StockItem[]
  onSuccess: () => void
}

export function CotacaoForm({
  open,
  onOpenChange,
  stockItems,
  onSuccess,
}: CotacaoFormProps) {
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
      order_type: "produto",
      service_description: "",
      notes: "",
      items: [{ stock_item_id: "", quantity: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "items" })

  const watchedItems = watch("items")
  const orderType = watch("order_type")

  useEffect(() => {
    if (open) {
      reset({
        order_type: "produto",
        service_description: "",
        notes: "",
        items: [{ stock_item_id: "", quantity: 0 }],
      })
    }
  }, [open, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      if (data.order_type === "servico") {
        await createCotacao({
          order_type: "servico",
          service_description: data.service_description,
          notes: data.notes || undefined,
          items: [],
        })
      } else {
        await createCotacao({
          order_type: "produto",
          notes: data.notes || undefined,
          items: data.items.map((item) => ({
            stock_item_id: item.stock_item_id,
            quantity: item.quantity,
          })),
        })
      }
      toast.success("Cotação criada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar cotação")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Cotação</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Tipo de Cotação */}
          <div className="space-y-2">
            <Label>Tipo de Cotação</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setValue("order_type", "produto")
                  setValue("items", [{ stock_item_id: "", quantity: 0 }])
                }}
                className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  orderType === "produto"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Produto
              </button>
              <button
                type="button"
                onClick={() => {
                  setValue("order_type", "servico")
                  setValue("items", [])
                }}
                className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  orderType === "servico"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Serviço
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {orderType === "servico"
                ? "Os fornecedores enviarão um preço total para o serviço."
                : "Os fornecedores cotarão o preço unitário de cada item."}
            </p>
          </div>

          {orderType === "servico" ? (
            <div className="space-y-1">
              <Label htmlFor="service_description">Descrição do Serviço *</Label>
              <textarea
                id="service_description"
                {...register("service_description")}
                rows={3}
                placeholder="Descreva o serviço a ser cotado..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
              {errors.service_description && (
                <p className="text-xs text-red-500">{errors.service_description.message}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Itens *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ stock_item_id: "", quantity: 0 })}
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar item
                </Button>
              </div>

              {errors.items && typeof errors.items.message === "string" && (
                <p className="text-xs text-red-500">{errors.items.message}</p>
              )}

              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-7 space-y-1">
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
                              {s.name}
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

                    <div className="col-span-4 space-y-1">
                      {idx === 0 && <Label className="text-xs">Quantidade</Label>}
                      <Input
                        type="number"
                        step="0.001"
                        {...register(`items.${idx}.quantity`, { valueAsNumber: true })}
                      />
                      {errors.items?.[idx]?.quantity && (
                        <p className="text-xs text-red-500">
                          {errors.items[idx]?.quantity?.message}
                        </p>
                      )}
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
          )}

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" {...register("notes")} placeholder="Informações adicionais..." />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar cotação"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
