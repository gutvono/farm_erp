"use client"

import { AccountsPayable, AccountsReceivable } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"
import { StatusBadge } from "./StatusBadge"

interface ContaRowProps {
  conta: AccountsPayable | AccountsReceivable
  onClick: () => void
}

export function ContaRow({ conta, onClick }: ContaRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 hover:border-slate-300 cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">
            {conta.number}
          </span>
          <StatusBadge status={conta.status} />
        </div>
        <p className="mt-1 truncate text-sm font-medium text-slate-800">
          {conta.description}
        </p>
        <p className="text-xs text-slate-500">
          Vencimento: {formatDate(conta.due_date)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-base font-semibold text-slate-800">
          {formatCurrency(conta.amount)}
        </p>
      </div>
    </button>
  )
}
