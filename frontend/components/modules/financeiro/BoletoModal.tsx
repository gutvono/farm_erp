"use client"

import { useState } from "react"
import { Check, Copy, Download } from "lucide-react"
import { jsPDF } from "jspdf"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BoletoPaymentInfo } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

interface BoletoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  info: BoletoPaymentInfo | null
  loading: boolean
  onConfirmPayment?: () => Promise<void>
}

export function BoletoModal({
  open,
  onOpenChange,
  info,
  loading,
  onConfirmPayment,
}: BoletoModalProps) {
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleCopy() {
    if (!info) return
    await navigator.clipboard.writeText(info.boleto_number)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownloadPDF() {
    if (!info) return
    const doc = new jsPDF()

    doc.setFontSize(18)
    doc.setFont("helvetica", "bold")
    doc.text("BOLETO BANCÁRIO", 105, 22, { align: "center" })

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.setDrawColor(200, 200, 200)
    doc.line(15, 28, 195, 28)

    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("Beneficiário:", 15, 38)
    doc.setFont("helvetica", "normal")
    doc.text(info.beneficiary, 15, 45)

    doc.setFont("helvetica", "bold")
    doc.text("Pagador:", 15, 55)
    doc.setFont("helvetica", "normal")
    doc.text(info.payer, 15, 62)

    doc.setFont("helvetica", "bold")
    doc.text("Vencimento:", 15, 72)
    doc.setFont("helvetica", "normal")
    doc.text(info.due_date, 55, 72)

    doc.setFont("helvetica", "bold")
    doc.text("Valor:", 120, 72)
    doc.setFont("helvetica", "normal")
    doc.text(formatCurrency(info.amount), 140, 72)

    doc.line(15, 78, 195, 78)

    doc.setFont("helvetica", "bold")
    doc.text("Linha Digitável:", 15, 88)
    doc.setFont("helvetica", "normal")
    const boletoLines = doc.splitTextToSize(info.boleto_number, 175)
    doc.text(boletoLines, 15, 96)

    doc.setFont("helvetica", "bold")
    doc.text("Código de Barras:", 15, 116)
    doc.setFont("helvetica", "normal")
    const barcodeLines = doc.splitTextToSize(info.barcode, 175)
    doc.text(barcodeLines, 15, 124)

    doc.line(15, 278, 195, 278)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      "Boleto simulado — sem validade bancária. Gerado por Coffee Farm ERP.",
      105,
      283,
      { align: "center" }
    )

    doc.save(`boleto-${info.boleto_number.slice(0, 8).replace(/\D/g, "")}.pdf`)
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Boleto Bancário</DialogTitle>
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
                <p className="text-xs text-slate-500">Vencimento</p>
                <p className="font-medium text-slate-700">{info.due_date}</p>
              </div>
            </div>

            <div className="space-y-0.5">
              <p className="text-xs text-slate-500">Beneficiário</p>
              <p className="text-sm text-slate-700">{info.beneficiary}</p>
            </div>

            <div className="space-y-0.5">
              <p className="text-xs text-slate-500">Pagador</p>
              <p className="text-sm text-slate-700">{info.payer}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500">Linha Digitável</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 break-all rounded bg-slate-100 px-2 py-1.5 text-xs leading-relaxed">
                  {info.boleto_number}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="mt-0.5 shrink-0"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button variant="outline" className="w-full gap-2" onClick={handleDownloadPDF}>
                <Download className="h-4 w-4" />
                Baixar Boleto PDF
              </Button>
              {onConfirmPayment && (
                <Button className="w-full" onClick={handleConfirm} disabled={confirming}>
                  {confirming ? "Confirmando..." : "Confirmar pagamento"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
