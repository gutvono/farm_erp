"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getMe } from "@/services/auth"

export default function ModulesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    // Auth check runs only on the client — cookies are not available during SSR.
    // We block rendering of children until the session is confirmed to prevent
    // child components from firing API requests that could trigger a 401 redirect.
    getMe()
      .then(() => setVerified(true))
      .catch(() => {
        router.replace("/login")
      })
  }, [router])

  if (!verified) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
      </div>
    )
  }

  return <>{children}</>
}
