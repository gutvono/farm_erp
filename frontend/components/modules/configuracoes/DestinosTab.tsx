"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getDestinosColheita, updateDestinosColheita } from "@/services/configuracoes"
import { getItens } from "@/services/estoque"
import { StockItem } from "@/types/index"

interface DestinoState {
  industria_item_id: string
  embalagem_item_id: string
  descarte_item_id: string
}

const EMPTY: DestinoState = {
  industria_item_id: "",
  embalagem_item_id: "",
  descarte_item_id: "",
}

const FIELDS: { key: keyof DestinoState; label: string; help: string }[] = [
  {
    key: "industria_item_id",
    label: "Indústria",
    help: "Item de estoque que recebe o café enviado para a indústria/beneficiamento.",
  },
  {
    key: "embalagem_item_id",
    label: "Embalagem",
    help: "Item de estoque que representa o café embalado.",
  },
  {
    key: "descarte_item_id",
    label: "Descarte",
    help: "Item de estoque que recebe o que for descartado na colheita.",
  },
]

export function DestinosTab() {
  const [items, setItems] = useState<StockItem[]>([])
  const [state, setState] = useState<DestinoState>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [itens, destinos] = await Promise.all([getItens(), getDestinosColheita()])
      setItems(itens)
      setState({
        industria_item_id: destinos.industria_item_id ?? "",
        embalagem_item_id: destinos.embalagem_item_id ?? "",
        descarte_item_id: destinos.descarte_item_id ?? "",
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar destinos da colheita")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allSelected =
    !!state.industria_item_id && !!state.embalagem_item_id && !!state.descarte_item_id

  async function handleSave() {
    if (!allSelected) return
    setSaving(true)
    try {
      await updateDestinosColheita({
        industria_item_id: state.industria_item_id,
        embalagem_item_id: state.embalagem_item_id,
        descarte_item_id: state.descarte_item_id,
      })
      toast.success("Destinos da colheita salvos com sucesso")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar destinos da colheita")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Carregando destinos...</div>
  }

  return (
    <Card className="border-slate-200 max-w-2xl">
      <CardHeader className="pb-3">
        <h3 className="text-sm font-semibold text-slate-700">Destinos da colheita</h3>
        <p className="text-sm text-slate-500">
          Defina quais itens de estoque recebem o café conforme o destino na colheita.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label>{field.label}</Label>
            <Select
              value={state[field.key] || undefined}
              onValueChange={(v) => setState((prev) => ({ ...prev, [field.key]: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">{field.help}</p>
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!allSelected || saving}>
            {saving ? "Salvando..." : "Salvar destinos"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
