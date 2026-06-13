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
import { getImpostos, updateImpostos } from "@/services/configuracoes"

const aliquota = z
  .number({ error: "Informe um percentual" })
  .min(0, "Não pode ser negativo")
  .max(100, "Não pode passar de 100%")

const schema = z.object({
  icms_percent: aliquota,
  pis_percent: aliquota,
  cofins_percent: aliquota,
  ipi_percent: aliquota,
})

type FormData = z.infer<typeof schema>

export function ImpostosTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      icms_percent: 0,
      pis_percent: 0,
      cofins_percent: 0,
      ipi_percent: 0,
    },
  })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const impostos = await getImpostos()
        if (active) reset(impostos)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar alíquotas")
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
      const impostos = await updateImpostos(data)
      reset(impostos)
      toast.success("Alíquotas salvas com sucesso")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar alíquotas")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Carregando alíquotas...</div>
  }

  return (
    <Card className="border-slate-200 max-w-2xl">
      <CardHeader className="pb-3">
        <h3 className="text-sm font-semibold text-slate-700">Impostos</h3>
        <p className="text-sm text-slate-500">
          Alíquotas usadas no cálculo de imposto exibido no PDF da nota fiscal (notas de
          venda, recebimento e devolução). Ao alterar aqui, todas as novas notas geradas
          passam a usar esses percentuais.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="icms_percent">ICMS (%)</Label>
              <Input
                id="icms_percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register("icms_percent", { valueAsNumber: true })}
              />
              {errors.icms_percent && (
                <p className="text-xs text-red-500">{errors.icms_percent.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="pis_percent">PIS (%)</Label>
              <Input
                id="pis_percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register("pis_percent", { valueAsNumber: true })}
              />
              {errors.pis_percent && (
                <p className="text-xs text-red-500">{errors.pis_percent.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="cofins_percent">COFINS (%)</Label>
              <Input
                id="cofins_percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register("cofins_percent", { valueAsNumber: true })}
              />
              {errors.cofins_percent && (
                <p className="text-xs text-red-500">{errors.cofins_percent.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="ipi_percent">IPI (%)</Label>
              <Input
                id="ipi_percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register("ipi_percent", { valueAsNumber: true })}
              />
              {errors.ipi_percent && (
                <p className="text-xs text-red-500">{errors.ipi_percent.message}</p>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            ICMS e IPI são exibidos como colunas próprias; PIS e COFINS são somados na
            coluna “PIS+COF” do detalhamento por item.
          </p>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar alíquotas"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
