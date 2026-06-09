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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { createVenda } from "@/services/comercial"
import { Client, PaymentMethod, StockItem } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const itemSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um item"),
  quantity: z.number({ error: "Informe a quantidade" }).positive("Qtd > 0"),
  unit_price: z.number({ error: "Informe o preço" }).min(0, "Preço >= 0"),
})

const schema = z
  .object({
    client_id: z.string().min(1, "Selecione um cliente"),
    notes: z.string().optional(),
    payment_method: z.enum(["a_vista", "parcelado", "pix", "boleto"] as const),
    installments: z.number().int().min(1).max(12),
    first_due_date: z.string().optional(),
    installment_interval_days: z
      .number({ error: "Informe o intervalo" })
      .int()
      .min(1),
    shipping_cost: z.number().min(0).optional(),
    items: z.array(itemSchema).min(1, "Adicione pelo menos 1 item"),
  })
  .superRefine((data, ctx) => {
    if (data.payment_method === "parcelado" && data.installments >= 2 && !data.first_due_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o vencimento da 1ª parcela",
        path: ["first_due_date"],
      })
    }
  })

type FormData = z.infer<typeof schema>

interface VendaFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
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

export function VendaForm({
  open,
  onOpenChange,
  clients,
  stockItems,
  onSuccess,
}: VendaFormProps) {
  const [loading, setLoading] = useState(false)
  const [delinquentConfirmOpen, setDelinquentConfirmOpen] = useState(false)
  const [pendingData, setPendingData] = useState<FormData | null>(null)

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
      payment_method: "a_vista",
      installments: 2,
      first_due_date: "",
      installment_interval_days: 30,
      shipping_cost: undefined,
      items: [{ stock_item_id: "", quantity: 0, unit_price: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "items" })

  const watchedItems = watch("items")
  const clientId = watch("client_id")
  const paymentMethod = watch("payment_method")
  const installments = watch("installments")
  const firstDueDate = watch("first_due_date")
  const intervalDays = watch("installment_interval_days")

  const isParcelado = paymentMethod === "parcelado"

  const selectedClient = clients.find((c) => c.id === clientId)

  const itemsTotal = watchedItems.reduce((acc, item) => {
    const q = Number(item.quantity) || 0
    const p = Number(item.unit_price) || 0
    return acc + q * p
  }, 0)

  const shippingCost = Number(watch("shipping_cost")) || 0
  const totalAmount = itemsTotal + shippingCost

  const installmentPreview: { label: string; due: string; amount: number }[] =
    (() => {
      if (!isParcelado || installments < 2 || !firstDueDate) return []
      const base = Math.round((itemsTotal / installments) * 100) / 100
      const dates = calcInstallmentDates(firstDueDate, installments, intervalDays || 30)
      return dates.map((dt, i) => {
        const amount =
          i === installments - 1
            ? Math.round((itemsTotal - base * (installments - 1)) * 100) / 100
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
        client_id: "",
        notes: "",
        payment_method: "a_vista",
        installments: 2,
        first_due_date: "",
        installment_interval_days: 30,
        shipping_cost: undefined,
        items: [{ stock_item_id: "", quantity: 0, unit_price: 0 }],
      })
    }
  }, [open, reset])

  // Inadimplência = AVISAR, não bloquear (Demanda 7): se o cliente está
  // inadimplente, pede confirmação antes de finalizar; confirmar prossegue.
  function onSubmit(data: FormData) {
    if (selectedClient?.is_delinquent) {
      setPendingData(data)
      setDelinquentConfirmOpen(true)
      return
    }
    void createSale(data)
  }

  function confirmDelinquentSale() {
    if (!pendingData) return
    const data = pendingData
    setDelinquentConfirmOpen(false)
    setPendingData(null)
    void createSale(data)
  }

  async function createSale(data: FormData) {
    setLoading(true)
    try {
      await createVenda({
        client_id: data.client_id,
        notes: data.notes || undefined,
        payment_method: data.payment_method as PaymentMethod,
        installments: isParcelado ? data.installments : undefined,
        first_due_date: isParcelado && data.installments >= 2 ? data.first_due_date : undefined,
        installment_interval_days:
          isParcelado && data.installments >= 2 ? data.installment_interval_days : undefined,
        shipping_cost:
          data.shipping_cost && data.shipping_cost > 0 ? data.shipping_cost : undefined,
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
    <>
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

          {/* Condições de Pagamento */}
          <div className="space-y-3 rounded-md border p-4">
            <Label className="text-sm font-semibold">Condições de Pagamento</Label>

            <div className="space-y-1">
              <Label className="text-xs">Forma de Pagamento</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => {
                  setValue("payment_method", v as FormData["payment_method"])
                  if (v !== "parcelado") setValue("installments", 2)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_vista">À Vista</SelectItem>
                  <SelectItem value="parcelado">Parcelado</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isParcelado && (
              <div className="space-y-3">
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
                        {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}x
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

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
                </div>

                {installmentPreview.length > 0 && (
                  <div className="space-y-1">
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
                              <td className="px-3 py-1.5 text-right">
                                {formatCurrency(row.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {shippingCost > 0 && (
                      <p className="text-xs text-slate-500">
                        Frete (cobrado à vista): {formatCurrency(shippingCost)}
                      </p>
                    )}
                  </div>
                )}
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
                        onValueChange={(v) => {
                          setValue(`items.${idx}.stock_item_id`, v)
                          // Preenche o preço com o valor médio (CMP) do produto como
                          // referência ao selecionar — editável (espelha o Compras).
                          const selected = stockItems.find((s) => s.id === v)
                          if (selected) {
                            setValue(`items.${idx}.unit_price`, selected.unit_cost)
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {stockItems.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} — {formatCurrency(s.unit_cost)} ({s.quantity_on_hand} {s.unit})
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

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="shipping_cost">Valor do Transporte (R$)</Label>
              <span className="text-xs text-slate-500">Gera uma NF de transporte separada</span>
            </div>
            <Input
              id="shipping_cost"
              type="number"
              step="0.01"
              min="0"
              {...register("shipping_cost", {
                setValueAs: (v) => {
                  if (v === "" || v === null || v === undefined) return undefined
                  const n = Number(v)
                  return Number.isNaN(n) ? undefined : n
                },
              })}
              placeholder="0.00"
            />
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

      {/* AlertDialog: confirmação de venda para cliente inadimplente */}
      <AlertDialog
        open={delinquentConfirmOpen}
        onOpenChange={(o) => {
          if (loading) return
          setDelinquentConfirmOpen(o)
          if (!o) setPendingData(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cliente inadimplente</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedClient?.name}</strong> está marcado como inadimplente. Deseja
              continuar com a venda mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelinquentSale} disabled={loading}>
              {loading ? "Criando..." : "Continuar com a venda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
