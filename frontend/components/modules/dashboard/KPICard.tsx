import { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

interface KPICardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  variant?: "default" | "warning" | "danger"
}

const variantStyles: Record<string, string> = {
  default: "border-slate-200",
  warning: "border-yellow-400",
  danger: "border-red-400",
}

export function KPICard({ title, value, icon: Icon, description, variant = "default" }: KPICardProps) {
  const formattedValue =
    typeof value === "number" &&
    (title.includes("Saldo") || title.includes("Receita") || title.includes("Despesa"))
      ? formatCurrency(value)
      : value

  return (
    <Card className={`border-2 ${variantStyles[variant]}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <Icon className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-2xl font-bold text-slate-800">{formattedValue}</p>
        {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
      </CardContent>
    </Card>
  )
}
