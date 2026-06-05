"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  getCategorias,
  getPapeis,
  updateCategoriaPapeis,
} from "@/services/configuracoes"
import { Category, SystemRole } from "@/types/index"
import { ROLE_HELP, ROLE_LABELS } from "@/components/modules/configuracoes/roleLabels"

const CATEGORIAS_PAGE_SIZE = 100

function sameSet(a: SystemRole[], b: SystemRole[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

export function PapeisTab() {
  const [papeis, setPapeis] = useState<SystemRole[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [draft, setDraft] = useState<Record<string, SystemRole[]>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [roles, cats] = await Promise.all([
        getPapeis(),
        getCategorias({
          page: 1,
          page_size: CATEGORIAS_PAGE_SIZE,
          order_by: "name",
          order_dir: "asc",
        }),
      ])
      setPapeis(roles)
      setCategories(cats.items)
      setDraft(Object.fromEntries(cats.items.map((c) => [c.id, c.roles])))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar papéis")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleRole(categoryId: string, role: SystemRole) {
    setDraft((prev) => {
      const current = prev[categoryId] ?? []
      const next = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role]
      return { ...prev, [categoryId]: next }
    })
  }

  async function handleSave(category: Category) {
    const roles = draft[category.id] ?? []
    setSavingId(category.id)
    try {
      const updated = await updateCategoriaPapeis(category.id, roles)
      toast.success(`Papéis de "${category.name}" atualizados`)
      // Sincroniza o original com o que voltou do backend.
      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, roles: updated.roles } : c))
      )
      setDraft((prev) => ({ ...prev, [category.id]: updated.roles }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar papéis")
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Carregando papéis...</div>
  }

  return (
    <div className="space-y-4">
      {/* Legenda: o que cada papel faz (base do manual). */}
      <Card className="border-slate-200 bg-slate-50/60">
        <CardHeader className="pb-2">
          <h3 className="text-sm font-semibold text-slate-700">O que cada papel faz</h3>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {papeis.map((role) => (
            <div key={role} className="text-sm">
              <span className="font-medium text-slate-700">{ROLE_LABELS[role]}:</span>{" "}
              <span className="text-slate-500">{ROLE_HELP[role]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {categories.length === 0 ? (
        <div className="py-12 text-center text-slate-400">Nenhuma categoria cadastrada</div>
      ) : (
        categories.map((category) => {
          const selected = draft[category.id] ?? []
          const dirty = !sameSet(selected, category.roles)
          return (
            <Card key={category.id} className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-800">{category.name}</span>
                  <Button
                    size="sm"
                    onClick={() => handleSave(category)}
                    disabled={!dirty || savingId === category.id}
                  >
                    {savingId === category.id ? "Salvando..." : "Salvar papéis"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {papeis.map((role) => {
                    const active = selected.includes(role)
                    return (
                      <button
                        key={role}
                        type="button"
                        title={ROLE_HELP[role]}
                        onClick={() => toggleRole(category.id, role)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors",
                          active
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                        {ROLE_LABELS[role]}
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
