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
import { createOrdem } from "@/services/compras"
import { StockItem, Supplier } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const itemSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um item"),
  quantity: z.number({ error: "Informe a quantidade" }).positive("Qtd > 0"),
  unit_price: z.number({ error: "Informe o preço" }).min(0, "Preço >= 0"),
})

const schema = z
  .object({
    supplier_id: z.string().min(1, "Selecione um fornecedor"),
    notes: z.string().optional(),
    installments: z.number().int().min(1).max(12).default(1),
    first_due_date: z.string().optional(),
    installment_interval_days: z
      .number({ error: "Informe o intervalo" })
      .int()
      .min(1)
      .default(30),
    items: z.array(itemSchema).min(1, "Adicione pelo menos 1 item"),
  })
  .superRefine((data, ctx) => {
    if (data.installments >= 2 && !data.first_due_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o vencimento da 1ª parcela",
        path: ["first_due_date"],
      })
    }
  })

type FormData = z.infer<typeof schema>

interface OrdemFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: Supplier[]
  stockItems: StockItem[]
  onSuccess: () => void
}

function calcInstallmentDates(
  firstDueDateStr: string,
  installments: number,
  intervalDays: number
): Date[] {
  const [y, m, d] = firstDueDateStr.split("-").map(Number)
  const dates: Date[] = []
  for (let i = 0; i < installments; i++) {
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + i * intervalDays)
    dates.push(dt)
  }
  return dates
}

export function OrdemForm({
  open,
  onOpenChange,
  suppliers,
  stockItems,
  onSuccess,
}: OrdemFormProps) {
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
      supplier_id: "",
      notes: "",
      installments: 1,
      first_due_date: "",
      installment_interval_days: 30,
      items: [{ stock_item_id: "", quantity: 0, unit_price: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "items" })

  const watchedItems = watch("items")
  const supplierId = watch("supplier_id")
  const installments = watch("installments")
  const firstDueDate = watch("first_due_date")
  const intervalDays = watch("installment_interval_days")

  const totalAmount = watchedItems.reduce((acc, item) => {
    const q = Number(item.quantity) || 0
    const p = Number(item.unit_price) || 0
    return acc + q * p
  }, 0)

  const installmentPreview: { label: string; due: string; amount: number }[] =
    (() => {
      if (installments < 2 || !firstDueDate) return []
      const base = Math.round((totalAmount / installments) * 100) / 100
      const dates = calcInstallmentDates(firstDueDate, installments, intervalDays || 30)
      return dates.map((dt, i) => {
        const amount =
          i === installments - 1
            ? Math.round((totalAmount - base * (installments - 1)) * 100) / 100
            : base
        return {
          label: `Parcela ${i + 1}/${installments}`,
          due: dt.toLocaleDateString("pt-BR"),
          amount,
        }
      })
    })()

  useEffect(() => {
    if (open) {
      reset({
        supplier_id: "",
        notes: "",
        installments: 1,
        first_due_date: "",
        installment_interval_days: 30,
        items: [{ stock_item_id: "", quantity: 0, unit_price: 0 }],
      })
    }
  }, [open, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await createOrdem({
        supplier_id: data.supplier_id,
        notes: data.notes || undefined,
        installments: data.installments,
        first_due_date: data.installments >= 2 ? data.first_due_date : undefined,
        installment_interval_days:
          data.installments >= 2 ? data.installment_interval_days : undefined,
        items: data.items.map((item) => ({
          stock_item_id: item.stock_item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      })
      toast.success("Ordem de compra criada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar ordem de compra")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Compra</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Fornecedor *</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => setValue("supplier_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.supplier_id && (
                <p className="text-xs text-red-500">{errors.supplier_id.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Observações</Label>
              <Input id="notes" {...register("notes")} placeholder="Informações adicionais..." />
            </div>
          </div>

          {/* Condições de Pagamento */}
          <div className="space-y-3 rounded-md border p-4">
            <Label className="text-sm font-semibold">Condições de Pagamento</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Parcelas</Label>
                <Select
                  value={String(installments)}
                  onValueChange={(v) => setValue("installments", parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n === 1 ? "À vista" : `${n}x`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {installments >= 2 && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Vencimento 1ª Parcela</Label>
                    <Input type="date" {...register("first_due_date")} />
                    {errors.first_due_date && (
                      <p className="text-xs text-red-500">{errors.first_due_date.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Intervalo (dias)</Label>
                    <Input
                      type="number"
                      min={1}
                      {...register("installment_interval_days", { valueAsNumber: true })}
                    />
                    {errors.installment_interval_days && (
                      <p className="text-xs text-red-500">
                        {errors.installment_interval_days.message}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {installmentPreview.length > 0 && (
              <div className="overflow-hidden rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Parcela</th>
                      <th className="px-3 py-1.5 text-left font-medium">Vencimento</th>
                      <th className="px-3 py-1.5 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installmentPreview.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5">{row.label}</td>
                        <td className="px-3 py-1.5">{row.due}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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
                {loading ? "Criando..." : "Criar ordem"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
