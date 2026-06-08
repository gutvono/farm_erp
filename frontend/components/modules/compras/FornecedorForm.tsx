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
import { createFornecedor, updateFornecedor } from "@/services/compras"
import { lookupCep } from "@/services/cep"
import { maskCep, maskDocument, onlyDigits, validateDocument } from "@/lib/br-documents"
import { Supplier } from "@/types/index"

const schema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório"),
    document: z.string().optional(),
    email: z.string().email("Email inválido").optional().or(z.literal("")),
    phone: z.string().optional(),
    cep: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Documento é opcional; quando informado, precisa ser CPF ou CNPJ válido
    // (mesma regra do backend). É a única validação que bloqueia o submit.
    if (data.document && data.document.trim() && !validateDocument(data.document)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CPF ou CNPJ inválido",
        path: ["document"],
      })
    }
  })

type FormData = z.infer<typeof schema>

interface FornecedorFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier?: Supplier | null
  onSuccess: () => void
}

export function FornecedorForm({
  open,
  onOpenChange,
  supplier,
  onSuccess,
}: FornecedorFormProps) {
  const [loading, setLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) {
      reset({
        name: supplier?.name ?? "",
        document: supplier?.document ?? "",
        email: supplier?.email ?? "",
        phone: supplier?.phone ?? "",
        cep: supplier?.cep ?? "",
        street: supplier?.street ?? "",
        number: supplier?.number ?? "",
        complement: supplier?.complement ?? "",
        neighborhood: supplier?.neighborhood ?? "",
        city: supplier?.city ?? "",
        state: supplier?.state ?? "",
        notes: supplier?.notes ?? "",
      })
    }
  }, [open, supplier, reset])

  async function handleCepBlur() {
    const cep = watch("cep") ?? ""
    if (onlyDigits(cep).length !== 8) return
    setCepLoading(true)
    try {
      const result = await lookupCep(cep)
      if (!result) {
        toast.error("CEP não encontrado")
        return
      }
      // Autopreenche, mantendo tudo editável.
      setValue("street", result.street)
      setValue("neighborhood", result.neighborhood)
      setValue("city", result.city)
      setValue("state", result.state)
    } catch {
      // Falha de rede no ViaCEP é best-effort: avisa mas não trava o cadastro.
      toast.error("Não foi possível consultar o CEP. Preencha o endereço manualmente.")
    } finally {
      setCepLoading(false)
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const payload = {
        name: data.name,
        document: data.document || undefined,
        email: data.email || undefined,
        phone: data.phone || undefined,
        cep: data.cep || undefined,
        street: data.street || undefined,
        number: data.number || undefined,
        complement: data.complement || undefined,
        neighborhood: data.neighborhood || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        notes: data.notes || undefined,
      }
      if (supplier) {
        await updateFornecedor(supplier.id, payload)
        toast.success("Fornecedor atualizado com sucesso")
      } else {
        await createFornecedor(payload)
        toast.success("Fornecedor criado com sucesso")
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar fornecedor")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" {...register("name")} placeholder="Fornecedor ABC" />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="document">CNPJ / CPF</Label>
              <Input
                id="document"
                {...register("document")}
                value={watch("document") ?? ""}
                onChange={(e) =>
                  setValue("document", maskDocument(e.target.value), {
                    shouldValidate: true,
                  })
                }
                placeholder="00.000.000/0001-00"
              />
              {errors.document && (
                <p className="text-xs text-red-500">{errors.document.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" {...register("phone")} placeholder="(00) 00000-0000" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} placeholder="contato@empresa.com" />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          {/* Endereço estruturado */}
          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">Endereço</p>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  {...register("cep")}
                  value={watch("cep") ?? ""}
                  onChange={(e) => setValue("cep", maskCep(e.target.value))}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                />
                {cepLoading && (
                  <p className="text-xs text-slate-400">Buscando endereço...</p>
                )}
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="street">Rua / Logradouro</Label>
                <Input id="street" {...register("street")} placeholder="Rua das Flores" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="number">Número</Label>
                <Input id="number" {...register("number")} placeholder="123" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="complement">Complemento</Label>
                <Input id="complement" {...register("complement")} placeholder="Sala 4" />
              </div>
            </div>

            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-3 space-y-1">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" {...register("neighborhood")} placeholder="Centro" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" {...register("city")} placeholder="São Paulo" />
              </div>
              <div className="col-span-1 space-y-1">
                <Label htmlFor="state">UF</Label>
                <Input
                  id="state"
                  maxLength={2}
                  {...register("state")}
                  value={watch("state") ?? ""}
                  onChange={(e) =>
                    setValue("state", e.target.value.toUpperCase().slice(0, 2))
                  }
                  placeholder="SP"
                />
              </div>
            </div>
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
              {loading ? "Salvando..." : supplier ? "Salvar alterações" : "Criar fornecedor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
