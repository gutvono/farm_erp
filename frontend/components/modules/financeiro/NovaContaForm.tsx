"use client"

import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Combobox, ComboboxOption } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/date-picker"
import { createContaPagar, createContaReceber } from "@/services/financeiro"
import { getClientes } from "@/services/comercial"
import { getFornecedores } from "@/services/compras"

const schema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z
    .number({ message: "Valor é obrigatório" })
    .positive("Valor deve ser maior que zero"),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  reference_id: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface NovaContaFormProps {
  type: "pagar" | "receber"
  onSuccess: () => void
  trigger: React.ReactNode
}

export function NovaContaForm({ type, onSuccess, trigger }: NovaContaFormProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [options, setOptions] = useState<ComboboxOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Carrega clientes (receber) ou fornecedores (pagar) via service ao abrir.
  useEffect(() => {
    if (!open) return
    let active = true
    setLoadingOptions(true)
    const loader =
      type === "receber"
        ? getClientes().then((clientes) =>
            clientes.map<ComboboxOption>((c) => ({
              value: c.id,
              label: c.name,
              description: c.document ?? undefined,
            }))
          )
        : getFornecedores().then((fornecedores) =>
            fornecedores.map<ComboboxOption>((f) => ({
              value: f.id,
              label: f.name,
              description: f.document ?? undefined,
            }))
          )
    loader
      .then((opts) => {
        if (active) setOptions(opts)
      })
      .catch(() => {
        if (active)
          toast.error(
            type === "receber"
              ? "Erro ao carregar clientes"
              : "Erro ao carregar fornecedores"
          )
      })
      .finally(() => {
        if (active) setLoadingOptions(false)
      })
    return () => {
      active = false
    }
  }, [open, type])

  const title =
    type === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"
  const description =
    type === "pagar"
      ? "Cadastre uma conta a pagar avulsa. Vincule um fornecedor (opcional)."
      : "Cadastre uma conta a receber avulsa. Selecione o cliente para vincular."

  async function onSubmit(data: FormData) {
    setSubmitting(true)
    try {
      if (type === "pagar") {
        await createContaPagar({
          description: data.description,
          amount: data.amount,
          due_date: data.due_date,
          supplier_id: data.reference_id || undefined,
        })
      } else {
        if (!data.reference_id) {
          toast.error("Selecione o cliente")
          setSubmitting(false)
          return
        }
        await createContaReceber({
          description: data.description,
          amount: data.amount,
          due_date: data.due_date,
          client_id: data.reference_id,
        })
      }
      toast.success("Conta criada com sucesso")
      reset()
      setOpen(false)
      onSuccess()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar conta"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" {...register("description")} />
            {errors.description && (
              <p className="text-xs text-red-600">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register("amount", { valueAsNumber: true })}
            />
            {errors.amount && (
              <p className="text-xs text-red-600">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Vencimento</Label>
            <Controller
              control={control}
              name="due_date"
              render={({ field }) => (
                <DatePicker
                  id="due_date"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            {errors.due_date && (
              <p className="text-xs text-red-600">{errors.due_date.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference_id">
              {type === "pagar" ? "Fornecedor (opcional)" : "Cliente"}
            </Label>
            <Controller
              control={control}
              name="reference_id"
              render={({ field }) => (
                <Combobox
                  id="reference_id"
                  options={options}
                  value={field.value}
                  onChange={field.onChange}
                  loading={loadingOptions}
                  placeholder={
                    type === "pagar"
                      ? "Selecione um fornecedor"
                      : "Selecione um cliente"
                  }
                  searchPlaceholder="Buscar por nome ou documento..."
                  emptyMessage={
                    type === "pagar"
                      ? "Nenhum fornecedor encontrado"
                      : "Nenhum cliente encontrado"
                  }
                  allowClear={type === "pagar"}
                  clearLabel="Sem fornecedor (avulsa)"
                />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Salvando..." : "Criar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
