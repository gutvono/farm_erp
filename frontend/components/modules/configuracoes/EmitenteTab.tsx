"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getEmitente, updateEmitente } from "@/services/configuracoes"

const schema = z.object({
  legal_name: z.string().min(1, "Razão social é obrigatória"),
  trade_name: z.string(),
  cnpj: z.string(),
  state_registration: z.string(),
  cep: z.string(),
  street: z.string(),
  number: z.string(),
  complement: z.string(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  phone: z.string(),
  email: z.string(),
})

type FormData = z.infer<typeof schema>

const EMPTY: FormData = {
  legal_name: "",
  trade_name: "",
  cnpj: "",
  state_registration: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  phone: "",
  email: "",
}

export function EmitenteTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const emitente = await getEmitente()
        if (active) reset(emitente)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar dados do emitente")
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [reset])

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const emitente = await updateEmitente(data)
      reset(emitente)
      toast.success("Dados do emitente salvos com sucesso")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar dados do emitente")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Carregando dados do emitente...</div>
  }

  return (
    <Card className="border-slate-200 max-w-3xl">
      <CardHeader className="pb-3">
        <h3 className="text-sm font-semibold text-slate-700">Emitente da fazenda</h3>
        <p className="text-sm text-slate-500">
          Dados da empresa que emite a nota fiscal. Aparecem no cabeçalho do PDF da NF. A
          razão social é obrigatória; os demais campos são opcionais.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Identificação
            </legend>

            <div className="space-y-1">
              <Label htmlFor="legal_name">Razão social</Label>
              <Input id="legal_name" {...register("legal_name")} />
              {errors.legal_name && (
                <p className="text-xs text-red-500">{errors.legal_name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="trade_name">Nome fantasia</Label>
                <Input id="trade_name" {...register("trade_name")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" {...register("cnpj")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="state_registration">Inscrição Estadual</Label>
                <Input id="state_registration" {...register("state_registration")} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Endereço
            </legend>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="cep">CEP</Label>
                <Input id="cep" {...register("cep")} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="street">Logradouro</Label>
                <Input id="street" {...register("street")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="number">Número</Label>
                <Input id="number" {...register("number")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="complement">Complemento</Label>
                <Input id="complement" {...register("complement")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" {...register("neighborhood")} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="city">Município</Label>
                <Input id="city" {...register("city")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="state">UF</Label>
                <Input id="state" maxLength={2} {...register("state")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" {...register("phone")} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register("email")} />
              </div>
            </div>
          </fieldset>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar dados"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
