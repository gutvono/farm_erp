"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface TruncatedTextProps {
  /** Texto completo. Exibido cortado com reticências e por inteiro no tooltip. */
  text: string
  /** Classes aplicadas ao span (ex.: `max-w-[280px] text-sm text-slate-700`). */
  className?: string
}

/**
 * Texto em **uma linha** cortado com reticências (`truncate`). Mostra o texto
 * completo num tooltip ao passar o mouse **somente quando ele está realmente
 * truncado** (detecção de overflow via `scrollWidth > clientWidth`, reavaliada
 * em resize). Componente reutilizável — aqui usado nas colunas de descrição das
 * tabelas do Financeiro; pode ser reaproveitado no resto do projeto.
 */
export function TruncatedText({ text, className }: TruncatedTextProps) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setIsTruncated(el.scrollWidth > el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  const content = (
    <span ref={ref} className={cn("block truncate", className)}>
      {text}
    </span>
  )

  if (!isTruncated) return content

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
