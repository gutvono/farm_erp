"use client"

import { useState } from "react"
import { Ban, CheckCircle2, ChevronDown, ChevronUp, FileDown } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cancelarFatura, updateFaturaStatus } from "@/services/faturamento"
import { Invoice, InvoiceStatus } from "@/types/index"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"

const CANCEL_SUCCESS_MESSAGE = "Nota fiscal cancelada com sucesso"

// Efeito do cancelamento por tipo de NF (texto exibido no AlertDialog).
// Regra Demanda 1.1: "o dinheiro só se move no pagamento". Em compras
// (recebimento/serviço/transporte de compra), o financeiro só é estornado se a
// ordem JÁ foi paga; caso contrário, a(s) conta(s) a pagar em aberto são
// canceladas. O transporte de VENDA mantém o estorno do frete.
const CANCEL_DESCRIPTIONS: Record<NfType, string> = {
  venda:
    "Isto cancelará a venda, devolverá os produtos ao estoque e cancelará as contas a receber vinculadas.",
  recebimento:
    "Os itens recebidos sairão do estoque. Se a compra já foi paga, o valor será estornado; caso contrário, a(s) conta(s) a pagar em aberto serão canceladas.",
  transporte: "Isto estornará o valor do frete.",
  servico:
    "Sem efeito no estoque. Se a compra já foi paga, o valor será estornado; caso contrário, a(s) conta(s) a pagar em aberto serão canceladas.",
  devolucao: "Os produtos devolvidos voltarão ao estoque como itens AVARIADOS.",
  folha: "Cancelamento de nota fiscal de folha não é suportado.",
}

// Transporte de COMPRA (frete embutido na conta a pagar) segue o princípio
// "estorno só se pago"; transporte de VENDA mantém o estorno do frete.
const CANCEL_TRANSPORTE_COMPRA =
  "Os itens recebidos seguem o princípio da compra: se já foi paga, o valor do frete será estornado; caso contrário, a(s) conta(s) a pagar em aberto serão canceladas."

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  emitida: "Emitida",
  paga: "Paga",
  cancelada: "Cancelada",
}

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  emitida: "bg-blue-100 text-blue-800",
  paga: "bg-green-100 text-green-800",
  cancelada: "bg-slate-100 text-slate-600",
}

type NfType =
  | "venda"
  | "recebimento"
  | "devolucao"
  | "transporte"
  | "servico"
  | "folha"

function detectNfType(notes: string | null): NfType | null {
  if (!notes) return null
  if (notes.includes("[NF-RECEBIMENTO]")) return "recebimento"
  if (notes.includes("[NF-DEVOLUCAO]")) return "devolucao"
  if (notes.includes("[NF-TRANSPORTE]")) return "transporte"
  if (notes.includes("[NF-SERVICO]")) return "servico"
  if (notes.includes("[NF-FOLHA]")) return "folha"
  return null
}

function getNfType(invoice: Invoice): NfType | null {
  if (invoice.invoice_type === "venda") return "venda"
  if (invoice.invoice_type === "recebimento") return "recebimento"
  if (invoice.invoice_type === "devolucao") return "devolucao"
  if (invoice.invoice_type === "transporte") return "transporte"
  if (invoice.invoice_type === "servico") return "servico"
  if (invoice.invoice_type === "folha_pagamento") return "folha"
  if (invoice.sale_id && invoice.invoice_type === "normal") return "venda"
  return detectNfType(invoice.notes)
}

function extractOrderIdFromNotes(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/order_id=([0-9a-f-]{36})/i)
  return match ? match[1] : null
}

const FISCAL_NCM = "09010110"
const FISCAL_CFOP_VENDA = "6101"
const FISCAL_CFOP_RECEBIMENTO = "1101"
const FISCAL_CFOP_DEVOLUCAO = "5201"
const FISCAL_ICMS_RATE = 12
const FISCAL_IPI_RATE = 0
const FISCAL_PIS_RATE = 0.65
const FISCAL_COFINS_RATE = 3

function calcTax(base: number, rate: number) {
  return (base * rate) / 100
}

function extractSaleIdFromNotes(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/sale_id=([0-9a-f-]{36})/i)
  return match ? match[1] : null
}

// Layout simples (sem CFOP/impostos de mercadoria), reaproveitado pela NF de
// transporte e pela NF de serviço — ambas têm apenas descrição + total.
async function generateSimplePdf(invoice: Invoice, title: string) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(title, 105, 18, { align: "center" })

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`NF-e Nº: ${invoice.number}`, 15, 30)
  doc.text(`Emissão: ${formatDate(invoice.issue_date)}`, 80, 30)

  const orderId = extractOrderIdFromNotes(invoice.notes)
  const saleId = extractSaleIdFromNotes(invoice.notes) ?? invoice.sale_id
  let y = 37
  if (orderId) {
    doc.text(`Ref. Ordem: ${orderId}`, 15, y)
    y += 7
  } else if (saleId) {
    doc.text(`Ref. Venda: ${saleId}`, 15, y)
    y += 7
  }
  if (invoice.client_name) {
    doc.text(`Destinatário: ${invoice.client_name}`, 15, y)
    y += 7
  }

  y += 2
  doc.line(15, y, 195, y)
  y += 5

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.text("Descrição", 15, y)
  doc.text("Qtd", 120, y, { align: "right" })
  doc.text("V.Unit.", 150, y, { align: "right" })
  doc.text("Subtotal", 190, y, { align: "right" })
  y += 2
  doc.line(15, y, 195, y)
  y += 5

  doc.setFont("helvetica", "normal")
  for (const item of invoice.items) {
    const lines = doc.splitTextToSize(item.description, 100) as string[]
    doc.text(lines, 15, y)
    doc.text(String(item.quantity), 120, y, { align: "right" })
    doc.text(formatCurrency(item.unit_price), 150, y, { align: "right" })
    doc.text(formatCurrency(item.subtotal), 190, y, { align: "right" })
    y += lines.length * 5 + 2
  }

  y += 2
  doc.line(15, y, 195, y)
  y += 5

  doc.setFont("helvetica", "bold")
  doc.text("TOTAL NF-e:", 150, y, { align: "right" })
  doc.text(formatCurrency(invoice.total_amount), 190, y, { align: "right" })

  if (invoice.notes) {
    y += 10
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("Observações", 15, y)
    y += 4
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    const noteLines = doc.splitTextToSize(invoice.notes, 180) as string[]
    doc.text(noteLines, 15, y)
  }

  doc.save(`${invoice.number}.pdf`)
}

async function generatePdf(invoice: Invoice, nfType: NfType) {
  if (nfType === "transporte") {
    await generateSimplePdf(invoice, "NOTA FISCAL DE TRANSPORTE")
    return
  }
  if (nfType === "servico") {
    await generateSimplePdf(invoice, "NOTA FISCAL DE SERVIÇO")
    return
  }
  if (nfType === "folha") {
    await generateSimplePdf(invoice, "NOTA FISCAL DE FOLHA DE PAGAMENTO")
    return
  }

  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF()

  const titleMap = {
    venda: "NOTA FISCAL DE VENDA",
    recebimento: "NOTA FISCAL DE RECEBIMENTO",
    devolucao: "NOTA FISCAL DE DEVOLUÇÃO",
  }
  const cfopMap = {
    venda: FISCAL_CFOP_VENDA,
    recebimento: FISCAL_CFOP_RECEBIMENTO,
    devolucao: FISCAL_CFOP_DEVOLUCAO,
  }

  const title = titleMap[nfType]
  const cfop = cfopMap[nfType]
  const orderId = extractOrderIdFromNotes(invoice.notes)

  // Header
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(title, 105, 18, { align: "center" })

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`NF-e Nº: ${invoice.number}`, 15, 30)
  doc.text(`Emissão: ${formatDate(invoice.issue_date)}`, 80, 30)
  if (invoice.due_date) doc.text(`Vencimento: ${formatDate(invoice.due_date)}`, 145, 30)

  if (invoice.client_name) {
    doc.text(`Destinatário: ${invoice.client_name}`, 15, 37)
  }
  if (orderId) {
    doc.text(`Ref. Ordem: ${orderId}`, 15, 44)
  }

  // Fiscal data block
  let y = orderId ? 52 : invoice.client_name ? 44 : 37
  y += 3

  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.setFillColor(240, 240, 240)
  doc.rect(15, y, 180, 6, "F")
  doc.text("NCM", 17, y + 4)
  doc.text("CFOP", 50, y + 4)
  doc.text("ICMS %", 80, y + 4)
  doc.text("IPI %", 110, y + 4)
  doc.text("PIS %", 135, y + 4)
  doc.text("COFINS %", 160, y + 4)
  y += 8
  doc.setFont("helvetica", "normal")
  doc.text(FISCAL_NCM, 17, y)
  doc.text(cfop, 50, y)
  doc.text(`${FISCAL_ICMS_RATE}%`, 80, y)
  doc.text(`${FISCAL_IPI_RATE}%`, 110, y)
  doc.text(`${FISCAL_PIS_RATE}%`, 135, y)
  doc.text(`${FISCAL_COFINS_RATE}%`, 160, y)
  y += 8

  doc.line(15, y, 195, y)
  y += 4

  // Items table header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.text("Descrição", 15, y)
  doc.text("Qtd", 100, y, { align: "right" })
  doc.text("V.Unit.", 125, y, { align: "right" })
  doc.text("Subtotal", 150, y, { align: "right" })
  doc.text("ICMS", 170, y, { align: "right" })
  doc.text("PIS+COF", 195, y, { align: "right" })
  y += 2
  doc.line(15, y, 195, y)
  y += 5

  doc.setFont("helvetica", "normal")
  let totalIcms = 0
  let totalPisCofins = 0

  for (const item of invoice.items) {
    const lines = doc.splitTextToSize(item.description, 80) as string[]
    const icms = calcTax(item.subtotal, FISCAL_ICMS_RATE)
    const pisCofins = calcTax(item.subtotal, FISCAL_PIS_RATE + FISCAL_COFINS_RATE)
    totalIcms += icms
    totalPisCofins += pisCofins

    doc.text(lines, 15, y)
    doc.text(String(item.quantity), 100, y, { align: "right" })
    doc.text(formatCurrency(item.unit_price), 125, y, { align: "right" })
    doc.text(formatCurrency(item.subtotal), 150, y, { align: "right" })
    doc.text(formatCurrency(icms), 170, y, { align: "right" })
    doc.text(formatCurrency(pisCofins), 195, y, { align: "right" })
    y += lines.length * 5 + 2
  }

  y += 2
  doc.line(15, y, 195, y)
  y += 5

  // Totals
  doc.setFont("helvetica", "bold")
  doc.text("Subtotal mercadoria:", 120, y, { align: "right" })
  doc.text(formatCurrency(invoice.total_amount), 150, y, { align: "right" })
  y += 5
  doc.setFont("helvetica", "normal")
  doc.text("ICMS:", 120, y, { align: "right" })
  doc.text(formatCurrency(totalIcms), 150, y, { align: "right" })
  y += 5
  doc.text("PIS + COFINS:", 120, y, { align: "right" })
  doc.text(formatCurrency(totalPisCofins), 150, y, { align: "right" })
  y += 5
  doc.setFont("helvetica", "bold")
  doc.text("TOTAL NF-e:", 120, y, { align: "right" })
  doc.text(formatCurrency(invoice.total_amount), 150, y, { align: "right" })

  // Duplicatas (installments)
  if (invoice.installment_number !== null && invoice.installment_total !== null) {
    y += 10
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("DUPLICATAS", 15, y)
    y += 3
    doc.line(15, y, 195, y)
    y += 5
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.text(`Parcela ${invoice.installment_number}/${invoice.installment_total}`, 15, y)
    if (invoice.due_date) doc.text(`Vencimento: ${formatDate(invoice.due_date)}`, 80, y)
    doc.text(`Valor: ${formatCurrency(invoice.total_amount)}`, 150, y)
  }

  doc.save(`${invoice.number}.pdf`)
}

interface FaturaCardProps {
  invoice: Invoice
  onChanged: () => void
}

export function FaturaCard({ invoice, onChanged }: FaturaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<InvoiceStatus | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  const isFinal = invoice.status === "paga" || invoice.status === "cancelada"
  const isCancelled = invoice.status === "cancelada"
  const nfType = getNfType(invoice)
  // Cancelamento de NF de folha está fora de escopo (Demanda 4) — não oferecer.
  const canCancel =
    nfType !== "folha" &&
    (invoice.status === "emitida" || invoice.status === "paga")
  const isNfFiscal = nfType !== null
  const orderId = extractOrderIdFromNotes(invoice.notes)
  // Transporte de COMPRA (tem order_id) segue "estorno só se pago"; transporte
  // de VENDA mantém o estorno do frete.
  const cancelDescription =
    nfType === "transporte" && orderId
      ? CANCEL_TRANSPORTE_COMPRA
      : CANCEL_DESCRIPTIONS[nfType ?? "venda"]
  const fornecedorNotificado = invoice.notes?.includes("Fornecedor notificado") ?? false

  const isParcelada =
    invoice.installment_number !== null && invoice.installment_total !== null

  const headerNumber = isParcelada
    ? `${invoice.number} — Parcela ${invoice.installment_number}/${invoice.installment_total}`
    : invoice.number

  async function confirmStatusChange() {
    if (!pendingStatus) return
    setUpdating(true)
    try {
      await updateFaturaStatus(invoice.id, pendingStatus)
      toast.success(
        pendingStatus === "paga"
          ? "Fatura marcada como paga — movimentação registrada no financeiro"
          : "Fatura cancelada"
      )
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status")
    } finally {
      setUpdating(false)
      setPendingStatus(null)
    }
  }

  async function confirmCancel() {
    setCancelling(true)
    try {
      await cancelarFatura(invoice.id, cancelReason)
      toast.success(CANCEL_SUCCESS_MESSAGE)
      setCancelOpen(false)
      setCancelReason("")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar nota fiscal")
    } finally {
      setCancelling(false)
    }
  }

  async function handleDownloadPdf() {
    if (!nfType) return
    setGeneratingPdf(true)
    try {
      await generatePdf(invoice, nfType)
    } catch {
      toast.error("Erro ao gerar PDF")
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{headerNumber}</span>
                <Badge className={STATUS_COLORS[invoice.status]}>
                  {STATUS_LABELS[invoice.status]}
                </Badge>

                {nfType === "venda" && (
                  <Badge className="bg-purple-50 text-purple-700 border border-purple-200">
                    NF-e Venda
                  </Badge>
                )}
                {nfType === "recebimento" && (
                  <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                    Recebimento
                  </Badge>
                )}
                {nfType === "devolucao" && (
                  <>
                    <Badge className="bg-red-50 text-red-700 border border-red-200">
                      Devolução
                    </Badge>
                    {orderId && (
                      <Badge
                        variant="outline"
                        className="text-xs cursor-default"
                        title={`Ordem de compra: ${orderId}`}
                      >
                        Vinculada
                      </Badge>
                    )}
                  </>
                )}
                {nfType === "transporte" && (
                  <Badge className="bg-amber-50 text-amber-700 border border-amber-200">
                    Transporte
                  </Badge>
                )}
                {nfType === "servico" && (
                  <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Serviço
                  </Badge>
                )}
                {nfType === "folha" && (
                  <Badge className="bg-teal-50 text-teal-700 border border-teal-200">
                    Folha de pagamento
                  </Badge>
                )}

                {invoice.sale_id && !isNfFiscal && (
                  <Badge variant="outline" className="text-xs">
                    {isParcelada ? "Parcelada" : "Gerada automaticamente"}
                  </Badge>
                )}
              </div>

              {invoice.client_name ? (
                <p className="text-sm text-slate-600 mt-0.5">{invoice.client_name}</p>
              ) : nfType === "recebimento" ? (
                <p className="text-sm text-slate-400 mt-0.5 italic">Nota fiscal de recebimento</p>
              ) : nfType === "devolucao" ? (
                <p className="text-sm text-slate-400 mt-0.5 italic">Nota fiscal de devolução</p>
              ) : nfType === "transporte" ? (
                <p className="text-sm text-slate-400 mt-0.5 italic">Nota fiscal de transporte</p>
              ) : nfType === "servico" ? (
                <p className="text-sm text-slate-400 mt-0.5 italic">Nota fiscal de serviço</p>
              ) : nfType === "folha" ? (
                <p className="text-sm text-slate-400 mt-0.5 italic">Nota fiscal de folha de pagamento</p>
              ) : null}

              <p className="text-sm text-slate-500">
                Emissão: {formatDate(invoice.issue_date)}
                {invoice.due_date && ` · Vencimento: ${formatDate(invoice.due_date)}`}
                {" · "}
                <span className="font-medium text-slate-700">
                  {formatCurrency(invoice.total_amount)}
                </span>
              </p>

              {fornecedorNotificado && (
                <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Fornecedor notificado
                </p>
              )}

              {isCancelled && (
                <p className="text-xs text-slate-500 mt-1">
                  Cancelada
                  {invoice.cancelled_at && ` em ${formatDateTime(invoice.cancelled_at)}`}
                  {invoice.cancellation_reason && (
                    <>
                      {" · Motivo: "}
                      <span className="italic">{invoice.cancellation_reason}</span>
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {isNfFiscal ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={generatingPdf}
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  {generatingPdf ? "Gerando..." : "PDF"}
                </Button>
              ) : !isCancelled ? (
                <Select
                  value={invoice.status === "paga" ? "paga" : "emitida"}
                  disabled={isFinal || updating}
                  onValueChange={(v) => setPendingStatus(v as InvoiceStatus)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emitida" disabled>
                      Emitida
                    </SelectItem>
                    <SelectItem value="paga">Paga</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}

              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setCancelOpen(true)}
                  disabled={cancelling}
                >
                  <Ban className="h-4 w-4 mr-1" />
                  Cancelar NF
                </Button>
              )}

              <Button variant="ghost" size="icon" onClick={() => setExpanded((v) => !v)}>
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preço Unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unit_price)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    {formatCurrency(invoice.total_amount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={pendingStatus === "paga"}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A fatura <strong>{invoice.number}</strong> será marcada como paga e uma entrada
              será registrada no financeiro. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange} disabled={updating}>
              {updating ? "Processando..." : "Confirmar pagamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (cancelling) return
          setCancelOpen(open)
          if (!open) setCancelReason("")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar nota fiscal {invoice.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelDescription} Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`cancel-reason-${invoice.id}`}>Motivo (opcional)</Label>
            <Input
              id={`cancel-reason-${invoice.id}`}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex.: erro de emissão, devolução acordada…"
              disabled={cancelling}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmCancel()
              }}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelling ? "Cancelando..." : "Cancelar NF"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
