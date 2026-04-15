"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, ChevronDown, LogOut, User as UserIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { formatDateTime } from "@/lib/utils"
import { getMe, logout } from "@/services/auth"
import { apiFetch } from "@/lib/api"
import type { Notification, User } from "@/types"

export function Header({ title }: { title: string }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {
        // RootLayout handles redirect on auth failure
      })
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
      router.replace("/login")
    } catch {
      toast.error("Erro ao realizar logout")
      setLoggingOut(false)
    }
  }

  async function fetchNotifications() {
    try {
      const data = await apiFetch<Notification[]>("/api/notifications")
      setNotifications(data)
    } catch {
      // Notifications failing should not block the UI
    }
  }

  useEffect(() => {
    fetchNotifications()
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function markAsRead(id: string) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
    } catch {
      // Silent fail
    }
  }

  function handleNotificationClick(notification: Notification) {
    markAsRead(notification.id)
    setOpen(false)
    if (notification.reference_module) {
      router.push(`/${notification.reference_module}`)
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>

      <div className="flex items-center gap-1">
        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 text-sm font-normal">
              <UserIcon className="h-4 w-4 text-slate-500" />
              <span className="text-slate-700">
                {user ? `Bem-vindo, ${user.username}` : "Carregando..."}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={loggingOut}
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Saindo..." : "Sair"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notification bell */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>

        <SheetContent side="right" className="w-96">
          <SheetHeader>
            <SheetTitle>Notificações</SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex flex-col gap-3 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">
                Nenhuma notificação
              </p>
            )}

            {notifications.map((notification) => (
              <div key={notification.id}>
                <div
                  className={`cursor-pointer rounded-lg p-3 transition-colors hover:bg-slate-50 ${
                    !notification.is_read ? "bg-blue-50" : ""
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDateTime(notification.created_at)}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          markAsRead(notification.id)
                        }}
                      >
                        Marcar como lida
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
              </div>
            ))}
          </div>
        </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
