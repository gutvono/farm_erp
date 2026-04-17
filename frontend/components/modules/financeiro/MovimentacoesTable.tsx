"use client"

import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FinancialMovement } from "@/types/index"
import { formatCurrency, formatDateTime } from "@/lib/utils"

interface MovimentacoesTableProps {
  movements: FinancialMovement[]
  loading?: boolean
}

const PAGE_SIZE = 50
const ALL_MODULES = "__all__"

const KNOWN_MODULES = [
  "comercial",
  "compras",
  "estoque",
  "financeiro",
  "faturamento",
  "folha",
  "pcp",
]

export function MovimentacoesTable({
  movements,
  loading,
}: MovimentacoesTableProps) {
  const [moduleFilter, setModuleFilter] = useState<string>(ALL_MODULES)
  const [page, setPage] = useState(0)

  const availableModules = useMemo(() => {
    const set = new Set<string>()
    movements.forEach((m) => {
      if (m.source_module) set.add(m.source_module)
    })
    KNOWN_MODULES.forEach((k) => set.add(k))
    return Array.from(set).sort()
  }, [movements])

  const filtered = useMemo(() => {
    if (moduleFilter === ALL_MODULES) return movements
    return movements.filter((m) => m.source_module === moduleFilter)
  }, [movements, moduleFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageItems = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  )

  function handleModuleChange(value: string) {
    setModuleFilter(value)
    setPage(0)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="w-60">
          <Select value={moduleFilter} onValueChange={handleModuleChange}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MODULES}>Todos os módulos</SelectItem>
              {availableModules.map((mod) => (
                <SelectItem key={mod} value={mod}>
                  {mod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-slate-500">
          {filtered.length} movimentações
        </p>
      </div>

      <div className="rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-500">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!loading && pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-500">
                  Nenhuma movimentação encontrada
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageItems.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs text-slate-500">
                    {formatDateTime(m.occurred_at)}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {m.description}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {m.source_module ?? "—"}
                  </TableCell>
                  <TableCell>
                    {m.movement_type === "entrada" ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        Entrada
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                        Saída
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <span
                      className={
                        m.movement_type === "entrada"
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {formatCurrency(m.amount)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Página {currentPage + 1} de {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
          >
            Próximo
          </Button>
        </div>
      </div>
    </div>
  )
}
