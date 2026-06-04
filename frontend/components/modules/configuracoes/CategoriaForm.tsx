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
import { createCategoria, updateCategoria } from "@/services/configuracoes"
import { Category } from "@/types/index"

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface CategoriaFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoria?: Category | null
  onSuccess: () => void
}

export function CategoriaForm({ open, onOpenChange, categoria, onSuccess }: CategoriaFormProps) {
  const isEdit = !!categoria
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
    defaultValues: { name: "", description: "", is_active: true },
  })

  const isActive = watch("is_active")

  useEffect(() => {
    if (!open) return
    if (categoria) {
      reset({
        name: categoria.name,
        description: categoria.description ?? "",
        is_active: categoria.is_active,
      })
    } else {
      reset({ name: "", description: "", is_active: true })
    }
  }, [open, categoria, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const description = data.description?.trim() || undefined
      if (categoria) {
        await updateCategoria(categoria.id, {
          name: data.name,
          description,
          is_active: data.is_active,
        })
        toast.success("Categoria atualizada com sucesso")
      } else {
        await createCategoria({
          name: data.name,
          description,
          is_active: data.is_active,
        })
        toast.success("Categoria cadastrada com sucesso")
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar categoria")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="categoria-name">Nome *</Label>
            <Input id="categoria-name" {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="categoria-description">
              Descrição <span className="font-normal text-slate-400">(opcional)</span>
            </Label>
            <Input id="categoria-description" {...register("description")} />
          </div>

          <div className="space-y-1">
            <Label>Situação</Label>
            <Select
              value={isActive ? "true" : "false"}
              onValueChange={(v) => setValue("is_active", v === "true")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Ativa</SelectItem>
                <SelectItem value="false">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar categoria"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
