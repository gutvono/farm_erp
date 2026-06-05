"use client"

import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
  title: string
  /** Contagem exibida no badge ao lado do título (oculto quando 0/indefinido). */
  count?: number
  /** Começa aberta por padrão. Estado é só de UI (não persiste). */
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Seção com cabeçalho clicável (chevron + título + badge de contagem) que
 * expande/recolhe o conteúdo. Estado local de apresentação. Reutilizável —
 * usado nas 3 filas da aba Aprovações do Financeiro.
 */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-yellow-500 text-white text-xs px-1.5 py-0.5 leading-none">
            {count}
          </span>
        )}
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  )
}
