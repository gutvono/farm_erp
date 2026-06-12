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
import { getEncargos, updateEncargos } from "@/services/configuracoes"

const schema = z.object({
  multa_atraso_percent: z
    .number({ error: "Informe um percentual" })
    .min(0, "Não pode ser negativo"),
  juros_mora_mensal_percent: z
    .number({ error: "Informe um percentual" })
    .min(0, "Não pode ser negativo"),
})

type FormData = z.infer<typeof schema>

export function EncargosTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { multa_atraso_percent: 0, juros_mora_mensal_percent: 0 },
  })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const taxas = await getEncargos()
        if (active) reset(taxas)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar taxas de encargo")
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
      const taxas = await updateEncargos(data)
      reset(taxas)
      toast.success("Taxas de encargo salvas com sucesso")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar taxas de encargo")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Carregando taxas...</div>
  }

  return (
    <Card className="border-slate-200 max-w-2xl">
      <CardHeader className="pb-3">
        <h3 className="text-sm font-semibold text-slate-700">Encargos por atraso</h3>
        <p className="text-sm text-slate-500">
          Taxas aplicadas na quitação de uma parcela vencida: a multa incide uma vez e os
          juros de mora são proporcionais aos dias de atraso. Pagamentos parciais não geram
          encargo.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="multa_atraso_percent">Multa por atraso (%)</Label>
            <Input
              id="multa_atraso_percent"
              type="number"
              step="0.01"
              min="0"
              {...register("multa_atraso_percent", { valueAsNumber: true })}
            />
            <p className="text-xs text-slate-400">
              Percentual fixo cobrado uma única vez sobre o saldo devedor da parcela vencida.
            </p>
            {errors.multa_atraso_percent && (
              <p className="text-xs text-red-500">{errors.multa_atraso_percent.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="juros_mora_mensal_percent">Juros de mora ao mês (%)</Label>
            <Input
              id="juros_mora_mensal_percent"
              type="number"
              step="0.01"
              min="0"
              {...register("juros_mora_mensal_percent", { valueAsNumber: true })}
            />
            <p className="text-xs text-slate-400">
              Juros mensais aplicados pro-rata pelos dias de atraso (ex.: 1% ao mês ≈ 0,033%
              ao dia).
            </p>
            {errors.juros_mora_mensal_percent && (
              <p className="text-xs text-red-500">
                {errors.juros_mora_mensal_percent.message}
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar taxas"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
