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
import { getEmitente, getImpostos } from "@/services/configuracoes"
import {
  EmitenteData,
  ImpostosTaxas,
  Invoice,
  InvoiceStatus,
  ReceivableStatus,
} from "@/types/index"
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

// Status de cada PARCELA (conta a receber) — bloco de cobrança da Demanda 9.0.
const PARCELA_STATUS_LABELS: Record<ReceivableStatus, string> = {
  em_aberto: "Em aberto",
  parcialmente_pago: "Parcial",
  quitado: "Quitada",
  cancelada: "Cancelada",
}

const PARCELA_STATUS_COLORS: Record<ReceivableStatus, string> = {
  em_aberto: "bg-blue-100 text-blue-800",
  parcialmente_pago: "bg-amber-100 text-amber-800",
  quitado: "bg-green-100 text-green-800",
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

// Alíquotas-padrão (fallback). A fonte da verdade são as alíquotas configuradas
// em Configurações → Impostos (Demanda 11.2); estes valores só são usados se a
// leitura da config falhar, para não impedir a geração do PDF.
const DEFAULT_IMPOSTOS: ImpostosTaxas = {
  icms_percent: 12,
  pis_percent: 0.65,
  cofins_percent: 3,
  ipi_percent: 0,
}

// Emitente-padrão (fallback). A fonte da verdade são os dados em Configurações →
// Empresa (Demanda 11.1); só é usado se a leitura falhar, para não impedir o PDF.
const DEFAULT_EMITENTE: EmitenteData = {
  legal_name: "Fazenda Santa Esperança Café Ltda",
  trade_name: "",
  cnpj: "",
  state_registration: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  phone: "",
  email: "",
}

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

// Formatação numérica da grade fiscal — estilo DANFE (sem o prefixo "R$").
function moneyBR(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Chave de acesso ILUSTRATIVA (44 dígitos) — derivada de número/data/id da nota.
// É só estética: o PDF leva o aviso "DOCUMENTO SEM VALOR FISCAL". Determinística
// para a mesma nota.
function buildFakeAccessKey(invoice: Invoice): string {
  const seed = `${invoice.number}${invoice.issue_date}${invoice.id}`.replace(/\D/g, "")
  let key = seed || "0"
  while (key.length < 44) key += seed || "0"
  return key.slice(0, 44)
}

function groupAccessKey(key: string): string {
  return key.replace(/(.{4})/g, "$1 ").trim()
}

// Layout DANFE da NF de VENDA (Demanda 11.4). Renderer próprio: emitente (11.1),
// impostos (11.2) e destinatário (11.3) já chegam prontos. Campos que o sistema
// não possui saem fixos/0,00/em branco, como no DANFE de referência.
async function generateDanfeVenda(
  invoice: Invoice,
  impostos: ImpostosTaxas,
  emitente: EmitenteData
) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF() // A4 retrato, unidade mm

  const L = 8
  const R = 202
  const W = R - L

  const gray = () => doc.setTextColor(110)
  const black = () => doc.setTextColor(0)

  // Caixa com rótulo pequeno (cinza) + valor.
  function field(
    x: number,
    y: number,
    w: number,
    h: number,
    labelTxt: string,
    valueTxt: string,
    opts?: { align?: "left" | "right"; bold?: boolean }
  ) {
    doc.rect(x, y, w, h)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(5)
    gray()
    doc.text(labelTxt, x + 1.5, y + 2.6)
    doc.setFontSize(8)
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal")
    black()
    const align = opts?.align ?? "left"
    const vx = align === "right" ? x + w - 1.5 : x + 1.5
    doc.text(valueTxt, vx, y + h - 1.8, { align, maxWidth: w - 3 })
  }

  function sectionTitle(yPos: number, txt: string): number {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6)
    gray()
    doc.text(txt, L, yPos)
    black()
    doc.setFont("helvetica", "normal")
    return yPos + 1.5
  }

  let y = 8

  // ── 1. Canhoto / recibo ───────────────────────────────────────────────
  const recH = 14
  const recRightW = 40
  const recLeftW = W - recRightW
  doc.rect(L, y, recLeftW, recH)
  doc.setFontSize(6)
  black()
  doc.text(
    `RECEBEMOS DE ${emitente.legal_name} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO`,
    L + 2,
    y + 4,
    { maxWidth: recLeftW - 4 }
  )
  const subY = y + 8
  doc.line(L, subY, L + recLeftW, subY)
  const sigSplit = L + recLeftW * 0.32
  doc.line(sigSplit, subY, sigSplit, y + recH)
  doc.setFontSize(5)
  gray()
  doc.text("DATA DE RECEBIMENTO", L + 1.5, subY + 3)
  doc.text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", sigSplit + 1.5, subY + 3)
  black()
  doc.rect(R - recRightW, y, recRightW, recH)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("NF-e", R - recRightW / 2, y + 5, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(`Nº ${invoice.number}`, R - recRightW / 2, y + 9.5, { align: "center" })
  doc.text("Série 1", R - recRightW / 2, y + 13, { align: "center" })
  y += recH + 1
  doc.setLineDashPattern([1.2, 1.2], 0)
  doc.line(L, y, R, y)
  doc.setLineDashPattern([], 0)
  y += 3

  // ── 2. Cabeçalho: emitente | DANFE | código de barras ──────────────────
  const headH = 30
  const leftW = 92
  const centerW = 52
  const rightW = W - leftW - centerW
  const xCenter = L + leftW
  const xRight = xCenter + centerW
  doc.rect(L, y, W, headH)
  doc.line(xCenter, y, xCenter, y + headH)
  doc.line(xRight, y, xRight, y + headH)

  // Emitente (esquerda)
  let ey = y + 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  black()
  doc.text(emitente.legal_name, L + 2, ey, { maxWidth: leftW - 4 })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  ey += 5
  if (emitente.trade_name) {
    doc.text(emitente.trade_name, L + 2, ey, { maxWidth: leftW - 4 })
    ey += 4
  }
  const enderecoEmit = [emitente.street, emitente.number, emitente.complement]
    .filter(Boolean)
    .join(", ")
  if (enderecoEmit) {
    doc.text(enderecoEmit, L + 2, ey, { maxWidth: leftW - 4 })
    ey += 4
  }
  const cidadeEmit = [emitente.neighborhood, emitente.city, emitente.state]
    .filter(Boolean)
    .join(" - ")
  if (cidadeEmit) {
    doc.text(cidadeEmit, L + 2, ey, { maxWidth: leftW - 4 })
    ey += 4
  }
  if (emitente.cep) {
    doc.text(`CEP: ${emitente.cep}`, L + 2, ey)
    ey += 4
  }
  if (emitente.cnpj) {
    doc.text(`CNPJ: ${emitente.cnpj}`, L + 2, ey)
    ey += 4
  }
  if (emitente.phone) {
    doc.text(`Fone: ${emitente.phone}`, L + 2, ey)
    ey += 4
  }

  // DANFE (centro)
  let cy = y + 6
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("DANFE", xCenter + centerW / 2, cy, { align: "center" })
  cy += 4
  doc.setFont("helvetica", "normal")
  doc.setFontSize(5.5)
  doc.text("Documento Auxiliar da", xCenter + centerW / 2, cy, { align: "center" })
  cy += 2.6
  doc.text("Nota Fiscal Eletrônica", xCenter + centerW / 2, cy, { align: "center" })
  cy += 4
  doc.setFontSize(6)
  doc.text("1 - ENTRADA", xCenter + 3, cy)
  doc.text("2 - SAÍDA", xCenter + 3, cy + 3)
  doc.rect(xCenter + centerW - 10, cy - 3, 7, 7)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("2", xCenter + centerW - 6.5, cy + 1.8, { align: "center" })
  doc.setFont("helvetica", "normal")
  cy += 9
  doc.setFontSize(7)
  doc.text(`Nº ${invoice.number}`, xCenter + centerW / 2, cy, { align: "center" })
  cy += 3.5
  doc.text("Série 1", xCenter + centerW / 2, cy, { align: "center" })

  // Código de barras ilustrativo + aviso (direita)
  let bx = xRight + 3
  const barTop = y + 4
  const barBot = y + 16
  doc.setFillColor(0, 0, 0)
  let bi = 0
  while (bx < R - 3) {
    const wbar = bi % 3 === 0 ? 0.7 : 0.35
    doc.rect(bx, barTop, wbar, barBot - barTop, "F")
    bx += wbar + (bi % 2 === 0 ? 0.8 : 0.5)
    bi += 1
  }
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  black()
  doc.text("DOCUMENTO SEM", xRight + rightW / 2, y + 22, { align: "center" })
  doc.text("VALOR FISCAL", xRight + rightW / 2, y + 25.5, { align: "center" })
  doc.setFont("helvetica", "normal")
  y += headH

  // ── 3. Faixa fiscal: chave de acesso / natureza / IE-CNPJ ──────────────
  field(L, y, W, 8, "CHAVE DE ACESSO", groupAccessKey(buildFakeAccessKey(invoice)))
  y += 8
  field(L, y, W, 7, "NATUREZA DA OPERAÇÃO", "Venda de mercadorias")
  y += 7
  const halfW = W / 2
  field(L, y, halfW, 7, "INSCRIÇÃO ESTADUAL", emitente.state_registration || "")
  field(L + halfW, y, W - halfW, 7, "CNPJ", emitente.cnpj || "")
  y += 7

  // ── 4. Destinatário / Remetente ────────────────────────────────────────
  const d = invoice.destinatario
  const destNome = d?.name ?? invoice.client_name ?? ""
  y = sectionTitle(y + 3, "DESTINATÁRIO / REMETENTE")
  const r1NomeW = W - 50 - 28
  field(L, y, r1NomeW, 7, "NOME / RAZÃO SOCIAL", destNome)
  field(L + r1NomeW, y, 50, 7, "CNPJ / CPF", d?.document ?? "")
  field(L + r1NomeW + 50, y, 28, 7, "DATA DA EMISSÃO", formatDate(invoice.issue_date))
  y += 7
  const enderecoDest = [d?.street, d?.number, d?.complement].filter(Boolean).join(", ")
  const r2EndW = W - 45 - 28 - 28
  field(L, y, r2EndW, 7, "ENDEREÇO", enderecoDest)
  field(L + r2EndW, y, 45, 7, "BAIRRO", d?.neighborhood ?? "")
  field(L + r2EndW + 45, y, 28, 7, "CEP", d?.cep ?? "")
  field(L + r2EndW + 45 + 28, y, 28, 7, "DATA SAÍDA", formatDate(invoice.issue_date))
  y += 7
  const r3MunW = W - 16 - 45 - 35
  field(L, y, r3MunW, 7, "MUNICÍPIO", d?.city ?? "")
  field(L + r3MunW, y, 16, 7, "UF", d?.state ?? "")
  field(L + r3MunW + 16, y, 45, 7, "FONE", d?.phone ?? "")
  field(L + r3MunW + 16 + 45, y, 35, 7, "INSCRIÇÃO ESTADUAL", "ISENTO")
  y += 7

  // ── 5. Faturas / Duplicatas (parcelas — bloco da 9.0) ──────────────────
  y = sectionTitle(y + 3, "FATURA / DUPLICATAS")
  const parcelas = invoice.parcelas
  if (parcelas.length > 0) {
    const perRow = 4
    const cellW = W / perRow
    const cellH = 9
    let idx = 0
    while (idx < parcelas.length) {
      for (let c = 0; c < perRow; c += 1) {
        const cx = L + c * cellW
        doc.rect(cx, y, cellW, cellH)
        const p = parcelas[idx + c]
        if (!p) continue
        doc.setFontSize(5)
        gray()
        doc.text("NÚM.", cx + 1.5, y + 2.4)
        doc.text("VENC.", cx + cellW * 0.42, y + 2.4)
        doc.text("VALOR", cx + cellW - 1.5, y + 2.4, { align: "right" })
        doc.setFontSize(7)
        black()
        doc.text(`${invoice.number}/${p.installment_number}`, cx + 1.5, y + 7)
        doc.text(formatDate(p.due_date), cx + cellW * 0.42, y + 7)
        doc.text(moneyBR(p.amount), cx + cellW - 1.5, y + 7, { align: "right" })
      }
      idx += perRow
      y += cellH
    }
  } else {
    doc.rect(L, y, W, 9)
    y += 9
  }

  // ── 6. Cálculo do imposto (a grade do DANFE) ───────────────────────────
  const totalIcms = calcTax(invoice.subtotal, impostos.icms_percent)
  const totalIpi = calcTax(invoice.subtotal, impostos.ipi_percent)
  y = sectionTitle(y + 3, "CÁLCULO DO IMPOSTO")
  const col5 = W / 5
  const gradeH = 10
  field(L, y, col5, gradeH, "BASE DE CÁLCULO DO ICMS", moneyBR(invoice.subtotal), { align: "right" })
  field(L + col5, y, col5, gradeH, "VALOR DO ICMS", moneyBR(totalIcms), { align: "right" })
  field(L + col5 * 2, y, col5, gradeH, "BASE DE CÁLCULO ICMS ST", moneyBR(0), { align: "right" })
  field(L + col5 * 3, y, col5, gradeH, "VALOR DO ICMS ST", moneyBR(0), { align: "right" })
  field(L + col5 * 4, y, col5, gradeH, "VALOR TOTAL DOS PRODUTOS", moneyBR(invoice.subtotal), { align: "right" })
  y += gradeH
  const col6 = W / 6
  field(L, y, col6, gradeH, "VALOR DO FRETE", moneyBR(0), { align: "right" })
  field(L + col6, y, col6, gradeH, "VALOR DO SEGURO", moneyBR(0), { align: "right" })
  field(L + col6 * 2, y, col6, gradeH, "DESCONTO", moneyBR(invoice.discount_amount), { align: "right" })
  field(L + col6 * 3, y, col6, gradeH, "OUTRAS DESPESAS", moneyBR(0), { align: "right" })
  field(L + col6 * 4, y, col6, gradeH, "VALOR DO IPI", moneyBR(totalIpi), { align: "right" })
  field(L + col6 * 5, y, col6, gradeH, "VALOR TOTAL DA NOTA", moneyBR(invoice.total_amount), {
    align: "right",
    bold: true,
  })
  y += gradeH

  // ── 7. Itens / produtos ────────────────────────────────────────────────
  y = sectionTitle(y + 3, "DADOS DOS PRODUTOS / SERVIÇOS")
  const cols = [
    { key: "cod", label: "CÓD.", w: 12, align: "left" as const },
    { key: "desc", label: "DESCRIÇÃO", w: 56, align: "left" as const },
    { key: "ncm", label: "NCM", w: 16, align: "left" as const },
    { key: "cfop", label: "CFOP", w: 12, align: "left" as const },
    { key: "un", label: "UN", w: 8, align: "left" as const },
    { key: "qtd", label: "QTD", w: 14, align: "right" as const },
    { key: "vu", label: "V.UNIT", w: 18, align: "right" as const },
    { key: "vt", label: "V.TOTAL", w: 18, align: "right" as const },
    { key: "bc", label: "BC ICMS", w: 16, align: "right" as const },
    { key: "vi", label: "V.ICMS", w: 16, align: "right" as const },
    { key: "pi", label: "%ICMS", w: 8, align: "right" as const },
  ]
  const headerH = 6
  doc.setFillColor(235, 235, 235)
  doc.rect(L, y, W, headerH, "F")
  doc.rect(L, y, W, headerH)
  doc.setFontSize(5.5)
  doc.setFont("helvetica", "bold")
  black()
  let hx = L
  for (const col of cols) {
    if (hx > L) doc.line(hx, y, hx, y + headerH)
    const tx = col.align === "right" ? hx + col.w - 1.5 : hx + 1.5
    doc.text(col.label, tx, y + 4, { align: col.align })
    hx += col.w
  }
  y += headerH
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)

  for (const item of invoice.items) {
    if (y > 250) {
      doc.addPage()
      y = 15
    }
    const descLines = doc.splitTextToSize(item.description, 54) as string[]
    const rowHt = Math.max(5, descLines.length * 3.2 + 1.8)
    const icms = calcTax(item.subtotal, impostos.icms_percent)
    const vals: Record<string, string> = {
      cod: "—",
      desc: "",
      ncm: FISCAL_NCM,
      cfop: FISCAL_CFOP_VENDA,
      un: "UN",
      qtd: String(item.quantity),
      vu: moneyBR(item.unit_price),
      vt: moneyBR(item.subtotal),
      bc: moneyBR(item.subtotal),
      vi: moneyBR(icms),
      pi: `${impostos.icms_percent}`,
    }
    doc.rect(L, y, W, rowHt)
    let rx = L
    for (const col of cols) {
      if (rx > L) doc.line(rx, y, rx, y + rowHt)
      if (col.key === "desc") {
        doc.text(descLines, rx + 1.5, y + 3.4)
      } else {
        const tx = col.align === "right" ? rx + col.w - 1.5 : rx + 1.5
        doc.text(vals[col.key], tx, y + 3.4, { align: col.align })
      }
      rx += col.w
    }
    y += rowHt
  }

  // ── 8. Dados adicionais ────────────────────────────────────────────────
  if (y > 250) {
    doc.addPage()
    y = 15
  }
  y = sectionTitle(y + 3, "DADOS ADICIONAIS")
  const adInfoW = W * 0.62
  const adH = 24
  doc.rect(L, y, adInfoW, adH)
  doc.rect(L + adInfoW, y, W - adInfoW, adH)
  doc.setFontSize(5)
  gray()
  doc.text("INFORMAÇÕES COMPLEMENTARES", L + 1.5, y + 3)
  doc.text("RESERVADO AO FISCO", L + adInfoW + 1.5, y + 3)
  black()
  doc.setFontSize(7)
  if (invoice.notes) {
    const noteLines = doc.splitTextToSize(invoice.notes, adInfoW - 3) as string[]
    doc.text(noteLines, L + 1.5, y + 7)
  }

  doc.save(`${invoice.number}.pdf`)
}

async function generatePdf(
  invoice: Invoice,
  nfType: NfType,
  impostos: ImpostosTaxas,
  emitente: EmitenteData
) {
  // Só a NF de VENDA ganha o layout DANFE (Demanda 11.4); os demais tipos
  // seguem no código rico/simples original abaixo, intacto.
  if (nfType === "venda") {
    await generateDanfeVenda(invoice, impostos, emitente)
    return
  }
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
  doc.text(`${impostos.icms_percent}%`, 80, y)
  doc.text(`${impostos.ipi_percent}%`, 110, y)
  doc.text(`${impostos.pis_percent}%`, 135, y)
  doc.text(`${impostos.cofins_percent}%`, 160, y)
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
    const icms = calcTax(item.subtotal, impostos.icms_percent)
    const pisCofins = calcTax(
      item.subtotal,
      impostos.pis_percent + impostos.cofins_percent
    )
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
  if (invoice.discount_amount > 0) {
    // Desconto de cabeçalho (Demanda 9.C): Subtotal bruto → Desconto → Total líquido.
    doc.text("Subtotal:", 120, y, { align: "right" })
    doc.text(formatCurrency(invoice.subtotal), 150, y, { align: "right" })
    y += 5
    doc.setFont("helvetica", "normal")
    doc.text("Desconto:", 120, y, { align: "right" })
    doc.text(`- ${formatCurrency(invoice.discount_amount)}`, 150, y, { align: "right" })
    y += 5
    doc.text("Total líquido:", 120, y, { align: "right" })
    doc.text(formatCurrency(invoice.total_amount), 150, y, { align: "right" })
    y += 5
  } else {
    doc.text("Subtotal mercadoria:", 120, y, { align: "right" })
    doc.text(formatCurrency(invoice.total_amount), 150, y, { align: "right" })
    y += 5
  }
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

  // Bloco de cobrança / parcelas (Demanda 9.0): a venda parcelada é 1 nota +
  // N parcelas (contas a receber). Renderiza a tabela completa das parcelas
  // (nº / vencimento / valor / status) — o total cheio já saiu acima.
  if (invoice.parcelas.length > 0) {
    y += 10
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("PARCELAS", 15, y)
    y += 3
    doc.line(15, y, 195, y)
    y += 5
    doc.setFontSize(8)
    doc.text("Parcela", 15, y)
    doc.text("Vencimento", 70, y)
    doc.text("Valor", 140, y, { align: "right" })
    doc.text("Status", 195, y, { align: "right" })
    y += 2
    doc.line(15, y, 195, y)
    y += 5
    doc.setFont("helvetica", "normal")
    for (const p of invoice.parcelas) {
      doc.text(`${p.installment_number}/${p.installment_total}`, 15, y)
      doc.text(formatDate(p.due_date), 70, y)
      doc.text(formatCurrency(p.amount), 140, y, { align: "right" })
      doc.text(PARCELA_STATUS_LABELS[p.status], 195, y, { align: "right" })
      y += 5
    }
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

  // Demanda 9.0: a venda parcelada virou 1 nota + N parcelas (bloco de cobrança
  // = contas a receber). O número da nota não carrega mais "Parcela X/N"; o
  // parcelamento aparece no bloco de parcelas e num selo "Parcelada N×".
  const parcelas = invoice.parcelas
  const isParcelada = parcelas.length > 1
  const installmentTotal = parcelas[0]?.installment_total ?? parcelas.length
  const headerNumber = invoice.number

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
      // Emitente (Demanda 11.1) e alíquotas (11.2) vêm de Configurações. Se a
      // leitura falhar, usa os fallbacks-padrão para não impedir o PDF.
      let emitente = DEFAULT_EMITENTE
      let impostos = DEFAULT_IMPOSTOS
      try {
        const [emitenteData, impostosData] = await Promise.all([
          getEmitente(),
          getImpostos(),
        ])
        emitente = emitenteData
        impostos = impostosData
      } catch {
        emitente = DEFAULT_EMITENTE
        impostos = DEFAULT_IMPOSTOS
      }
      await generatePdf(invoice, nfType, impostos, emitente)
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

                {isParcelada && (
                  <Badge className="bg-purple-50 text-purple-700 border border-purple-200">
                    Parcelada {installmentTotal}×
                  </Badge>
                )}

                {invoice.sale_id && !isNfFiscal && !isParcelada && (
                  <Badge variant="outline" className="text-xs">
                    Gerada automaticamente
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
          <CardContent className="pt-0 space-y-4">
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
                {invoice.discount_amount > 0 && (
                  <>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right text-slate-600">
                        Subtotal
                      </TableCell>
                      <TableCell className="text-right text-slate-600">
                        {formatCurrency(invoice.subtotal)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right text-emerald-700">
                        Desconto
                      </TableCell>
                      <TableCell className="text-right text-emerald-700">
                        - {formatCurrency(invoice.discount_amount)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    {invoice.discount_amount > 0 ? "Total líquido" : "Total"}
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    {formatCurrency(invoice.total_amount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {/* Bloco de cobrança (Demanda 9.0): parcelas da nota (contas a
                receber). À vista normalmente tem 1 parcela; parcelada tem N. */}
            {parcelas.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  Parcelas{isParcelada ? ` (${installmentTotal}×)` : ""}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Recebido</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parcelas.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          {p.installment_number}/{p.installment_total}
                        </TableCell>
                        <TableCell>{formatDate(p.due_date)}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(p.amount)}
                        </TableCell>
                        <TableCell className="text-right text-slate-600">
                          {formatCurrency(p.amount_received)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className={PARCELA_STATUS_COLORS[p.status]}>
                            {PARCELA_STATUS_LABELS[p.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
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
