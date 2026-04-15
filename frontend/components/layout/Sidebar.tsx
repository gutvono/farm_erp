"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  FileText,
  DollarSign,
  Users,
  Tractor,
} from "lucide-react"
import { cn } from "@/lib/utils"

const modules = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Comercial", href: "/comercial", icon: ShoppingCart },
  { label: "Compras", href: "/compras", icon: Package },
  { label: "Estoque", href: "/estoque", icon: Warehouse },
  { label: "Faturamento", href: "/faturamento", icon: FileText },
  { label: "Financeiro", href: "/financeiro", icon: DollarSign },
  { label: "Folha de Pagamento", href: "/folha", icon: Users },
  { label: "PCP", href: "/pcp", icon: Tractor },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-60 flex-col bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-700 px-5">
        <Tractor className="h-6 w-6 text-emerald-400" />
        <span className="text-sm font-semibold leading-tight">
          Coffee Farm
          <br />
          <span className="text-xs font-normal text-slate-400">ERP</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {modules.map(({ label, href, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
