"use client"

import { FilterX } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface ClearFiltersButtonProps {
  /** Há ao menos um filtro ativo? O botão só aparece quando `true`. */
  active: boolean
  /** Reseta todos os filtros da barra (e a paginação, se houver). */
  onClear: () => void
  className?: string
}

/**
 * Botão "Limpar filtros" padronizado para as barras de filtro do sistema.
 * Visibilidade: aparece **somente** quando há filtro ativo (`active`) — quando
 * não há nada para limpar, não polui a barra. Cada barra define o que é "ativo"
 * e o que o `onClear` reseta (busca, status, período, etc.).
 */
export function ClearFiltersButton({
  active,
  onClear,
  className,
}: ClearFiltersButtonProps) {
  if (!active) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClear}
      className={cn("text-slate-500 hover:text-slate-800", className)}
    >
      <FilterX className="mr-1.5 h-4 w-4" />
      Limpar filtros
    </Button>
  )
}
