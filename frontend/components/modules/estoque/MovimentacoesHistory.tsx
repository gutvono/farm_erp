"use client"

import { MovimentacoesTable } from "./MovimentacoesTable"
import { useMovimentacoes } from "./useMovimentacoes"

interface MovimentacoesHistoryProps {
  stockItemId: string
}

/**
 * Histórico paginado de movimentações de um único item (usado no Sheet de
 * "Histórico"). Fixa o filtro `stock_item_id` e esconde o seletor de item.
 * Renderize com `key={stockItemId}` para reiniciar a paginação ao trocar de item.
 */
export function MovimentacoesHistory({ stockItemId }: MovimentacoesHistoryProps) {
  const { data, loading, page, setPage, sort, toggleSort, filters, setFilters } =
    useMovimentacoes({ stock_item_id: stockItemId })

  return (
    <MovimentacoesTable
      data={data}
      loading={loading}
      page={page}
      sort={sort}
      onPageChange={setPage}
      onSortChange={toggleSort}
      filters={filters}
      onFiltersChange={setFilters}
      hideItemFilter
    />
  )
}
