"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

export interface DataTableColumn<T> {
  /** Identificador da coluna; em colunas `sortable` deve casar com o `order_by` do backend. */
  key: string
  label: string
  sortable?: boolean
  align?: "left" | "right" | "center"
  /** Renderização customizada da célula. Sem `render`, usa `row[key]` como texto. */
  render?: (row: T) => React.ReactNode
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  loading: boolean
  emptyMessage?: string
  /** Página atual (1-based). */
  page: number
  pageSize: number
  total: number
  pages: number
  onPageChange: (page: number) => void
  /** Estado de ordenação atual; `by` casa com `column.key`. */
  sort?: { by: string; dir: "asc" | "desc" }
  /** Disparado ao clicar num cabeçalho `sortable` (alterna asc/desc na mesma coluna). */
  onSortChange?: (key: string) => void
  /** Chave estável para o React. Sem ela, usa o índice da linha. */
  rowKey?: (row: T) => string
  /** Opcional: clique na linha (ex.: abrir detalhe). Células de ação devem
   * chamar `stopPropagation` para não disparar este callback. */
  onRowClick?: (row: T) => void
}

const ALIGN_CLASS: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
}

function defaultCell<T>(row: T, key: string): React.ReactNode {
  const value = (row as Record<string, unknown>)[key]
  if (value === null || value === undefined) return ""
  return String(value)
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  emptyMessage = "Nenhum registro encontrado",
  page,
  pageSize,
  total,
  pages,
  onPageChange,
  sort,
  onSortChange,
  rowKey,
  onRowClick,
}: DataTableProps<T>) {
  const totalPages = Math.max(pages, 1)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  function handleHeaderClick(column: DataTableColumn<T>) {
    if (!column.sortable || !onSortChange) return
    onSortChange(column.key)
  }

  function SortIcon({ column }: { column: DataTableColumn<T> }) {
    if (!column.sortable) return null
    if (sort?.by !== column.key) {
      return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />
    }
    return sort.dir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    column.align && ALIGN_CLASS[column.align],
                    column.sortable && "cursor-pointer select-none hover:text-foreground"
                  )}
                  onClick={() => handleHeaderClick(column)}
                >
                  {column.label}
                  <SortIcon column={column} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-slate-400"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, rowIndex) => (
                <TableRow
                  key={rowKey ? rowKey(row) : rowIndex}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(column.align && ALIGN_CLASS[column.align])}
                    >
                      {column.render ? column.render(row) : defaultCell(row, column.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {total === 0
            ? "Mostrando 0 de 0"
            : `Mostrando ${from}–${to} de ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={loading || page <= 1}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Anterior
          </Button>
          <span className="px-1">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={loading || page >= totalPages}
          >
            Próxima
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
