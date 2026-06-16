"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { parseISODate, toISODate } from "@/lib/date"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface DateRangeValue {
  /** Início do intervalo no contrato da API: `YYYY-MM-DD` (ou undefined). */
  from?: string
  /** Fim do intervalo no contrato da API: `YYYY-MM-DD` (ou undefined). */
  to?: string
}

interface DateRangePickerProps {
  value: DateRangeValue
  /** Emite o intervalo já no contrato da API (`YYYY-MM-DD`). */
  onChange: (value: DateRangeValue) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

function formatLabel(range: DateRange | undefined, placeholder: string) {
  if (!range?.from) return placeholder
  const from = format(range.from, "dd/MM/yyyy", { locale: ptBR })
  if (!range.to) return from
  const to = format(range.to, "dd/MM/yyyy", { locale: ptBR })
  return `${from} – ${to}`
}

export function DateRangePicker({
  value,
  onChange,
  id,
  placeholder = "Selecione um período",
  disabled,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected: DateRange | undefined = value.from
    ? { from: parseISODate(value.from), to: parseISODate(value.to) }
    : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatLabel(selected, placeholder)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={selected?.from ?? new Date()}
          selected={selected}
          onSelect={(range) =>
            onChange({
              from: toISODate(range?.from) || undefined,
              to: toISODate(range?.to) || undefined,
            })
          }
        />
      </PopoverContent>
    </Popover>
  )
}
