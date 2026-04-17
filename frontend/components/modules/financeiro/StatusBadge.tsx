import { Badge } from "@/components/ui/badge"
import { PayableStatus, ReceivableStatus } from "@/types/index"

type AnyStatus = PayableStatus | ReceivableStatus

const STATUS_META: Record<AnyStatus, { label: string; className: string }> = {
  em_aberto: {
    label: "Em aberto",
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  },
  paga: {
    label: "Paga",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  },
  quitado: {
    label: "Quitado",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  },
  parcialmente_pago: {
    label: "Parcialmente pago",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  },
  cancelada: {
    label: "Cancelada",
    className: "bg-slate-200 text-slate-700 hover:bg-slate-200",
  },
}

interface StatusBadgeProps {
  status: AnyStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status]
  return <Badge className={meta.className}>{meta.label}</Badge>
}
