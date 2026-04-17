"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
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
import { createContaPagar, createContaReceber } from "@/services/financeiro"

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const title =
    type === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"
  const description =
    type === "pagar"
      ? "Cadastre uma conta a pagar avulsa."
      : "Cadastre uma conta a receber avulsa. Informe o ID do cliente para vincular."

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
          toast.error("Informe o ID do cliente")
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
            <Input id="due_date" type="date" {...register("due_date")} />
            {errors.due_date && (
              <p className="text-xs text-red-600">{errors.due_date.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference_id">
              {type === "pagar"
                ? "ID do fornecedor (opcional)"
                : "ID do cliente"}
            </Label>
            <Input
              id="reference_id"
              placeholder="UUID"
              {...register("reference_id")}
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
