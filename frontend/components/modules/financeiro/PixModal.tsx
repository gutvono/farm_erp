"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PixPaymentInfo } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

interface PixModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  info: PixPaymentInfo | null
  loading: boolean
  onConfirmPayment?: () => Promise<void>
}

export function PixModal({
  open,
  onOpenChange,
  info,
  loading,
  onConfirmPayment,
}: PixModalProps) {
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleCopyKey() {
    if (!info) return
    await navigator.clipboard.writeText(info.pix_key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  async function handleCopyCode() {
    if (!info) return
    await navigator.clipboard.writeText(info.pix_code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  async function handleConfirm() {
    if (!onConfirmPayment) return
    setConfirming(true)
    try {
      await onConfirmPayment()
      onOpenChange(false)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagamento via PIX</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Carregando...</p>
        ) : !info ? null : (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500">Valor</p>
                <p className="font-bold text-slate-900">{formatCurrency(info.amount)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500">Descrição</p>
                <p className="text-sm text-slate-700 truncate" title={info.description}>
                  {info.description}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500">Chave PIX</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-slate-100 px-2 py-1.5 text-sm">
                  {info.pix_key}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleCopyKey}
                >
                  {copiedKey ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500">PIX Copia e Cola</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 break-all rounded bg-slate-100 px-2 py-1.5 text-xs leading-relaxed">
                  {info.pix_code}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="mt-0.5 shrink-0"
                  onClick={handleCopyCode}
                >
                  {copiedCode ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {onConfirmPayment && (
              <Button className="w-full" onClick={handleConfirm} disabled={confirming}>
                {confirming ? "Confirmando..." : "Confirmar pagamento"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
