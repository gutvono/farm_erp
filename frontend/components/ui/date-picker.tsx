"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { parseISODate, toISODate } from "@/lib/date"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  /** Valor no contrato da API: `YYYY-MM-DD` (ou vazio). */
  value?: string
  /** Emite o valor já no contrato da API: `YYYY-MM-DD` (ou vazio ao limpar). */
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Ano inicial do dropdown de ano (default: ano atual - 100). */
  fromYear?: number
  /** Ano final do dropdown de ano (default: ano atual + 10). */
  toYear?: number
}

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Selecione uma data",
  disabled,
  className,
  fromYear,
  toYear,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseISODate(value)

  const currentYear = new Date().getFullYear()
  const startMonth = new Date(fromYear ?? currentYear - 100, 0)
  const endMonth = new Date(toYear ?? currentYear + 10, 11)

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
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
          {selected
            ? format(selected, "dd/MM/yyyy", { locale: ptBR })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={startMonth}
          endMonth={endMonth}
          defaultMonth={selected ?? new Date()}
          selected={selected}
          onSelect={(date) => {
            onChange(toISODate(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
