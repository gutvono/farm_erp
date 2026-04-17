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
import { createTalhao, updateTalhao } from "@/services/pcp"
import { Plot } from "@/types/index"

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  location: z.string().optional(),
  variety: z.string().min(1, "Variedade é obrigatória"),
  capacity_sacas: z.number().min(0, "Capacidade deve ser >= 0"),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface TalhaoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plot?: Plot | null
  onSuccess: () => void
}

export function TalhaoForm({ open, onOpenChange, plot, onSuccess }: TalhaoFormProps) {
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) {
      reset({
        name: plot?.name ?? "",
        location: plot?.location ?? "",
        variety: plot?.variety ?? "",
        capacity_sacas: plot?.capacity_sacas ?? 0,
        notes: plot?.notes ?? "",
      })
    }
  }, [open, plot, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const payload = {
        name: data.name,
        location: data.location || undefined,
        variety: data.variety,
        capacity_sacas: data.capacity_sacas,
        notes: data.notes || undefined,
      }
      if (plot) {
        await updateTalhao(plot.id, payload)
        toast.success("Talhão atualizado com sucesso")
      } else {
        await createTalhao(payload)
        toast.success("Talhão criado com sucesso")
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar talhão")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{plot ? "Editar Talhão" : "Novo Talhão"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" {...register("name")} placeholder="Talhão A - Bourbon Amarelo" />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="variety">Variedade *</Label>
              <Input id="variety" {...register("variety")} placeholder="Arábica Bourbon" />
              {errors.variety && (
                <p className="text-xs text-red-500">{errors.variety.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="capacity_sacas">Capacidade (sacas) *</Label>
              <Input
                id="capacity_sacas"
                type="number"
                step="0.001"
                {...register("capacity_sacas", { valueAsNumber: true })}
              />
              {errors.capacity_sacas && (
                <p className="text-xs text-red-500">{errors.capacity_sacas.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="location">Localização</Label>
            <Input id="location" {...register("location")} placeholder="Setor Norte, 5 ha" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" {...register("notes")} placeholder="Informações adicionais..." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : plot ? "Salvar alterações" : "Criar talhão"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
