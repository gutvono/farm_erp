"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { apiFetch } from "@/lib/api"

interface RootLayoutProps {
  children: React.ReactNode
  title: string
}

export function RootLayout({ children, title }: RootLayoutProps) {
  const router = useRouter()

  useEffect(() => {
    // Verify authentication on mount
    apiFetch("/api/auth/me").catch(() => {
      router.replace("/login")
    })
  }, [router])

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
