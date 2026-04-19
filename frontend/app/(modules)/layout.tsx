"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getMe } from "@/services/auth"

export default function ModulesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    // Auth check runs only on the client — cookies are not available during SSR.
    getMe().catch(() => {
      router.replace("/login")
    })
  }, [router])

  return <>{children}</>
}
