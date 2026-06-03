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
import { createCargo, updateCargo } from "@/services/folha"
import { JobPosition } from "@/types/index"

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  base_salary: z.number().min(0, "Salário deve ser >= 0"),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface CargoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cargo?: JobPosition | null
  onSuccess: () => void
}

export function CargoForm({ open, onOpenChange, cargo, onSuccess }: CargoFormProps) {
  const isEdit = !!cargo
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
    defaultValues: { name: "", description: "", base_salary: 0, is_active: true },
  })

  const isActive = watch("is_active")

  useEffect(() => {
    if (!open) return
    if (cargo) {
      reset({
        name: cargo.name,
        description: cargo.description ?? "",
        base_salary: cargo.base_salary,
        is_active: cargo.is_active,
      })
    } else {
      reset({ name: "", description: "", base_salary: 0, is_active: true })
    }
  }, [open, cargo, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const description = data.description?.trim() || undefined
      if (cargo) {
        await updateCargo(cargo.id, {
          name: data.name,
          description,
          base_salary: data.base_salary,
          is_active: data.is_active,
        })
        toast.success("Cargo atualizado com sucesso")
      } else {
        await createCargo({
          name: data.name,
          description,
          base_salary: data.base_salary,
          is_active: data.is_active,
        })
        toast.success("Cargo cadastrado com sucesso")
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar cargo")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Cargo" : "Novo Cargo"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cargo-name">Nome *</Label>
            <Input id="cargo-name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="cargo-description">
              Descrição <span className="font-normal text-slate-400">(opcional)</span>
            </Label>
            <Input id="cargo-description" {...register("description")} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cargo-base_salary">Salário base *</Label>
            <Input
              id="cargo-base_salary"
              type="number"
              step="0.01"
              min={0}
              {...register("base_salary", { valueAsNumber: true })}
            />
            {errors.base_salary && (
              <p className="text-xs text-red-500">{errors.base_salary.message}</p>
            )}
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
                <SelectItem value="true">Ativo</SelectItem>
                <SelectItem value="false">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar cargo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
