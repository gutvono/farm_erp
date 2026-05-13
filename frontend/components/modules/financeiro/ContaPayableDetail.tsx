"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { AccountsPayable, BoletoPaymentInfo, PixPaymentInfo } from "@/types/index"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import {
  cancelarConta,
  getBoletoPagar,
  getPixPagar,
  pagarConta,
} from "@/services/financeiro"
import { StatusBadge } from "./StatusBadge"
import { PixModal } from "./PixModal"
import { BoletoModal } from "./BoletoModal"

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  a_vista: "À Vista",
  parcelado: "Parcelado",
  pix: "PIX",
  boleto: "Boleto",
}

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  a_vista: "bg-slate-100 text-slate-700",
  parcelado: "bg-blue-100 text-blue-800",
  pix: "bg-purple-100 text-purple-800",
  boleto: "bg-orange-100 text-orange-800",
}

interface ContaPayableDetailProps {
  conta: AccountsPayable | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

export function ContaPayableDetail({
  conta,
  open,
  onOpenChange,
  onChanged,
}: ContaPayableDetailProps) {
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [pixOpen, setPixOpen] = useState(false)
  const [pixInfo, setPixInfo] = useState<PixPaymentInfo | null>(null)
  const [pixLoading, setPixLoading] = useState(false)
  const [boletoOpen, setBoletoOpen] = useState(false)
  const [boletoInfo, setBoletoInfo] = useState<BoletoPaymentInfo | null>(null)
  const [boletoLoading, setBoletoLoading] = useState(false)

  if (!conta) return null

  const isFinal = conta.status === "paga" || conta.status === "cancelada"

  async function handlePay() {
    if (!conta) return
    setPaying(true)
    try {
      await pagarConta(conta.id)
      toast.success("Conta paga com sucesso")
      onChanged()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao pagar conta")
    } finally {
      setPaying(false)
    }
  }

  async function handleCancel() {
    if (!conta) return
    setCancelling(true)
    try {
      await cancelarConta(conta.id)
      toast.success("Conta cancelada")
      onChanged()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar conta")
    } finally {
      setCancelling(false)
    }
  }

  async function handleOpenPix() {
    if (!conta) return
    setPixOpen(true)
    setPixLoading(true)
    try {
      const info = await getPixPagar(conta.id)
      setPixInfo(info)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar dados do PIX")
      setPixOpen(false)
    } finally {
      setPixLoading(false)
    }
  }

  async function handleOpenBoleto() {
    if (!conta) return
    setBoletoOpen(true)
    setBoletoLoading(true)
    try {
      const info = await getBoletoPagar(conta.id)
      setBoletoInfo(info)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar boleto")
      setBoletoOpen(false)
    } finally {
      setBoletoLoading(false)
    }
  }

  async function handleConfirmPaymentFromModal() {
    await handlePay()
    setPixOpen(false)
    setBoletoOpen(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{conta.number}</SheetTitle>
            <SheetDescription>Detalhes da conta a pagar</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 text-sm">
            <DetailRow label="Status">
              <StatusBadge status={conta.status} />
            </DetailRow>
            {conta.payment_method && (
              <DetailRow label="Pagamento">
                <Badge className={PAYMENT_METHOD_COLORS[conta.payment_method]}>
                  {PAYMENT_METHOD_LABELS[conta.payment_method] ?? conta.payment_method}
                </Badge>
              </DetailRow>
            )}
            {conta.installment_number && conta.installment_total && (
              <DetailRow label="Parcela">
                {conta.installment_number}/{conta.installment_total}
              </DetailRow>
            )}
            <DetailRow label="Descrição">{conta.description}</DetailRow>
            <DetailRow label="Valor">{formatCurrency(conta.amount)}</DetailRow>
            <DetailRow label="Vencimento">{formatDate(conta.due_date)}</DetailRow>
            {conta.paid_at && (
              <DetailRow label="Pago em">{formatDateTime(conta.paid_at)}</DetailRow>
            )}
            {conta.notes && <DetailRow label="Observações">{conta.notes}</DetailRow>}
            <DetailRow label="Criada em">
              {formatDateTime(conta.created_at)}
            </DetailRow>
          </div>

          {/* PIX / Boleto buttons */}
          {!isFinal && conta.payment_method === "pix" && (
            <div className="mt-6">
              <Button variant="outline" className="w-full gap-2" onClick={handleOpenPix}>
                Ver informações PIX
              </Button>
            </div>
          )}
          {!isFinal && conta.payment_method === "boleto" && (
            <div className="mt-4">
              <Button variant="outline" className="w-full gap-2" onClick={handleOpenBoleto}>
                Ver Boleto
              </Button>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button
              onClick={handlePay}
              disabled={isFinal || paying}
              className="w-full"
            >
              {paying ? "Processando..." : "Pagar"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isFinal || cancelling}
                  className="w-full"
                >
                  Cancelar conta
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar conta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é definitiva e a conta não poderá mais ser paga.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
                    {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </SheetContent>
      </Sheet>

      <PixModal
        open={pixOpen}
        onOpenChange={setPixOpen}
        info={pixInfo}
        loading={pixLoading}
        onConfirmPayment={!isFinal ? handleConfirmPaymentFromModal : undefined}
      />
      <BoletoModal
        open={boletoOpen}
        onOpenChange={setBoletoOpen}
        info={boletoInfo}
        loading={boletoLoading}
        onConfirmPayment={!isFinal ? handleConfirmPaymentFromModal : undefined}
      />
    </>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  )
}
