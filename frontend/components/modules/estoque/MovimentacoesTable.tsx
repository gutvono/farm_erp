"use client"

import { useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StockMovement, StockMovementType } from "@/types/index"
import { formatCurrency, formatDateTime } from "@/lib/utils"

type SortKey = keyof Pick<
  StockMovement,
  "occurred_at" | "stock_item_name" | "movement_type" | "quantity" | "unit_cost" | "total_value"
>

interface MovimentacoesTableProps {
  movements: StockMovement[]
  loading: boolean
  hideItemFilter?: boolean
  items?: { id: string; name: string }[]
  onFilterChange?: (params: {
    stock_item_id?: string
    movement_type?: StockMovementType
    source_module?: string
    order_by?: string
    order_dir?: "asc" | "desc"
  }) => void
}

export function MovimentacoesTable({
  movements,
  loading,
  hideItemFilter,
  items = [],
  onFilterChange,
}: MovimentacoesTableProps) {
  const [itemFilter, setItemFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [moduleFilter, setModuleFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("occurred_at")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const sourceModules = Array.from(new Set(movements.map((m) => m.source_module))).filter(Boolean)

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      const newDir = sortDir === "asc" ? "desc" : "asc"
      setSortDir(newDir)
      onFilterChange?.({ order_by: key, order_dir: newDir })
    } else {
      setSortKey(key)
      setSortDir("desc")
      onFilterChange?.({ order_by: key, order_dir: "desc" })
    }
  }

  const filtered = movements.filter((m) => {
    if (itemFilter !== "all" && m.stock_item_id !== itemFilter) return false
    if (typeFilter !== "all" && m.movement_type !== typeFilter) return false
    if (moduleFilter !== "all" && m.source_module !== moduleFilter) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })

  function SortIcon({ field }: { field: SortKey }) {
    if (sortKey !== field) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!hideItemFilter && items.length > 0 && (
          <Select value={itemFilter} onValueChange={setItemFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os itens</SelectItem>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="entrada">Entrada</SelectItem>
            <SelectItem value="saida">Saída</SelectItem>
          </SelectContent>
        </Select>

        {sourceModules.length > 0 && (
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os módulos</SelectItem>
              {sourceModules.map((mod) => (
                <SelectItem key={mod} value={mod}>
                  {mod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("occurred_at")}
              >
                Data <SortIcon field="occurred_at" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("stock_item_name")}
              >
                Item <SortIcon field="stock_item_name" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("movement_type")}
              >
                Tipo <SortIcon field="movement_type" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("quantity")}
              >
                Qtd <SortIcon field="quantity" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("unit_cost")}
              >
                Custo Unit. <SortIcon field="unit_cost" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("total_value")}
              >
                Total <SortIcon field="total_value" />
              </TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Módulo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                  Nenhuma movimentação encontrada
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((mov) => (
                <TableRow key={mov.id}>
                  <TableCell className="text-sm">{formatDateTime(mov.occurred_at)}</TableCell>
                  <TableCell className="font-medium">{mov.stock_item_name}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        mov.movement_type === "entrada"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }
                    >
                      {mov.movement_type === "entrada" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{mov.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(mov.unit_cost)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(mov.total_value)}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-slate-600">
                    {mov.description}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{mov.source_module}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {sorted.length > 0 && (
        <p className="text-xs text-slate-500 text-right">
          {sorted.length} movimentação{sorted.length !== 1 ? "ões" : ""}
        </p>
      )}
    </div>
  )
}
