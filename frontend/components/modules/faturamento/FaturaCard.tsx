"use client"

import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronUp, FileDown } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import { updateFaturaStatus } from "@/services/faturamento"
import { Invoice, InvoiceStatus } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

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

function detectNfType(notes: string | null): "recebimento" | "devolucao" | null {
  if (!notes) return null
  if (notes.includes("[NF-RECEBIMENTO]")) return "recebimento"
  if (notes.includes("[NF-DEVOLUCAO]")) return "devolucao"
  return null
}

function getNfType(invoice: Invoice): "recebimento" | "devolucao" | null {
  if (invoice.invoice_type === "recebimento") return "recebimento"
  if (invoice.invoice_type === "devolucao") return "devolucao"
  return detectNfType(invoice.notes)
}

function extractOrderIdFromNotes(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/order_id=([0-9a-f-]{36})/i)
  return match ? match[1] : null
}

async function generatePdf(invoice: Invoice, nfType: "recebimento" | "devolucao") {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF()

  const title =
    nfType === "recebimento" ? "NOTA FISCAL DE RECEBIMENTO" : "NOTA FISCAL DE DEVOLUÇÃO"
  const orderId = extractOrderIdFromNotes(invoice.notes)

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(title, 105, 20, { align: "center" })

  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text(`Número: ${invoice.number}`, 15, 36)
  doc.text(`Emissão: ${formatDate(invoice.issue_date)}`, 15, 44)
  if (orderId) {
    doc.text(`Ordem de Compra: ${orderId}`, 15, 52)
  }

  let y = orderId ? 64 : 56

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("Descrição", 15, y)
  doc.text("Qtd", 110, y, { align: "right" })
  doc.text("Preço Unit.", 148, y, { align: "right" })
  doc.text("Subtotal", 195, y, { align: "right" })
  y += 2
  doc.line(15, y, 195, y)
  y += 6

  doc.setFont("helvetica", "normal")
  for (const item of invoice.items) {
    const lines = doc.splitTextToSize(item.description, 90) as string[]
    doc.text(lines, 15, y)
    doc.text(String(item.quantity), 110, y, { align: "right" })
    doc.text(formatCurrency(item.unit_price), 148, y, { align: "right" })
    doc.text(formatCurrency(item.subtotal), 195, y, { align: "right" })
    y += lines.length * 6 + 2
  }

  y += 2
  doc.line(15, y, 195, y)
  y += 6
  doc.setFont("helvetica", "bold")
  doc.text("Total:", 148, y, { align: "right" })
  doc.text(formatCurrency(invoice.total_amount), 195, y, { align: "right" })

  if (invoice.notes) {
    y += 12
    doc.setFontSize(9)
    doc.setFont("helvetica", "italic")
    const noteLines = doc.splitTextToSize(invoice.notes, 180) as string[]
    doc.text(noteLines, 15, y)
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

  const isFinal = invoice.status === "paga" || invoice.status === "cancelada"
  const nfType = getNfType(invoice)
  const isNfFiscal = nfType !== null
  const orderId = extractOrderIdFromNotes(invoice.notes)
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
              ) : (
                <Select
                  value={invoice.status}
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
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
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
        open={pendingStatus === "cancelada"}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A fatura <strong>{invoice.number}</strong> será cancelada. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              disabled={updating}
              className="bg-red-600 hover:bg-red-700"
            >
              {updating ? "Cancelando..." : "Cancelar fatura"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
