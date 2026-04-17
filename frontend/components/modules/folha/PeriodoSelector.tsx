"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createOrGetPeriodo } from "@/services/folha"
import { PayrollPeriod } from "@/types/index"

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril",
  "Maio", "Junho", "Julho", "Agosto",
  "Setembro", "Outubro", "Novembro", "Dezembro",
]

interface PeriodoSelectorProps {
  activePeriod: PayrollPeriod | null
  onPeriodLoaded: (period: PayrollPeriod) => void
}

export function PeriodoSelector({ activePeriod, onPeriodLoaded }: PeriodoSelectorProps) {
  const today = new Date()
  const [month, setMonth] = useState<number>(today.getMonth() + 1)
  const [year, setYear] = useState<number>(today.getFullYear())
  const [loading, setLoading] = useState(false)

  async function handleAbrir() {
    setLoading(true)
    try {
      const before = activePeriod?.id
      const period = await createOrGetPeriodo({
        reference_month: month,
        reference_year: year,
      })
      if (before && before === period.id) {
        // mesma referência — apenas recarrega
      } else if (
        period.reference_month === month &&
        period.reference_year === year &&
        new Date(period.created_at).getTime() < Date.now() - 5_000
      ) {
        toast.message("Período já existe, carregando...")
      } else {
        toast.success(`Período ${MONTHS[month - 1]}/${year} aberto`)
      }
      onPeriodLoaded(period)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao abrir período")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1 min-w-[180px]">
          <Label>Mês</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((label, idx) => (
                <SelectItem key={idx + 1} value={String(idx + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 w-32">
          <Label htmlFor="year">Ano</Label>
          <Input
            id="year"
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || today.getFullYear())}
          />
        </div>

        <Button onClick={handleAbrir} disabled={loading}>
          {loading ? "Abrindo..." : "Abrir Período"}
        </Button>

        {activePeriod && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-600">
              Período ativo:{" "}
              <strong>
                {MONTHS[activePeriod.reference_month - 1]}/{activePeriod.reference_year}
              </strong>
            </span>
            <Badge
              className={
                activePeriod.status === "aberta"
                  ? "bg-green-100 text-green-800 hover:bg-green-100"
                  : "bg-slate-200 text-slate-600 hover:bg-slate-200"
              }
            >
              {activePeriod.status === "aberta" ? "Aberta" : "Fechada"}
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
}
