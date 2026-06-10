"use client"

import { useState } from "react"
import { FileText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Employee, PayrollEntry, PayrollPeriod } from "@/types/index"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril",
  "Maio", "Junho", "Julho", "Agosto",
  "Setembro", "Outubro", "Novembro", "Dezembro",
]

const CONTRACT_LABEL: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  temporario: "Temporário",
}

interface HoleritePDFProps {
  entry: PayrollEntry
  period: PayrollPeriod
  employee?: Employee
}

function sanitize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase()
}

export function HoleritePDF({ entry, period, employee }: HoleritePDFProps) {
  const [loading, setLoading] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    try {
      const { default: jsPDF } = await import("jspdf")
      const doc = new jsPDF()

      const monthLabel = MONTHS[period.reference_month - 1]
      const cpf = employee?.cpf ?? "—"
      const role = employee?.position_name ?? "—"

      doc.setFillColor(16, 185, 129)
      doc.roundedRect(20, 12, 16, 16, 3, 3, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.text("CF", 28, 22, { align: "center" })

      doc.setTextColor(15, 23, 42)
      doc.setFontSize(13)
      doc.text("Coffee Farm ERP", 40, 18)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      doc.text("Folha de pagamento", 40, 25)

      doc.setFont("helvetica", "bold")
      doc.setFontSize(16)
      doc.text("Holerite", 190, 18, { align: "right" })
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.text(`Competência: ${monthLabel} / ${period.reference_year}`, 190, 25, {
        align: "right",
      })

      doc.setLineWidth(0.4)
      doc.setDrawColor(203, 213, 225)
      doc.line(20, 34, 190, 34)

      doc.setFontSize(10)
      doc.setTextColor(15, 23, 42)
      doc.setFont("helvetica", "bold")
      doc.text("Funcionário", 20, 44)
      doc.text("CPF", 20, 52)
      doc.text("Cargo", 112, 44)
      doc.text("Contrato", 112, 52)
      doc.setFont("helvetica", "normal")
      doc.text(entry.employee_name, 48, 44)
      doc.text(cpf, 48, 52)
      doc.text(role, 136, 44)
      doc.text(CONTRACT_LABEL[entry.contract_type] ?? entry.contract_type, 136, 52)

      const rows =
        entry.items.length > 0
          ? entry.items
          : [
              {
                event_description: "Salário base",
                event_type: "provento",
                affects_net: true,
                amount: entry.base_salary,
              },
              {
                event_description: "Horas extras",
                event_type: "provento",
                affects_net: true,
                amount: entry.overtime_amount,
              },
              {
                event_description: "Descontos",
                event_type: "desconto",
                affects_net: true,
                amount: entry.deductions,
              },
            ]

      const xDescription = 22
      const xEarnings = 116
      const xBenefits = 153
      const xDeductions = 188

      doc.setFillColor(241, 245, 249)
      doc.rect(20, 64, 170, 10, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.text("Descrição", xDescription, 70)
      doc.text("Proventos", xEarnings, 70, { align: "right" })
      doc.text("Benefícios", xBenefits, 70, { align: "right" })
      doc.text("Descontos", xDeductions, 70, { align: "right" })

      doc.setFont("helvetica", "normal")
      let y = 82
      for (const item of rows) {
        if (item.amount <= 0) continue
        const isEarning = item.event_type === "provento" && item.affects_net
        const isDiscount = item.event_type === "desconto" && item.affects_net
        const isBenefit = item.event_type === "informativo" || !item.affects_net

        const description = doc.splitTextToSize(item.event_description, 78)
        doc.setTextColor(15, 23, 42)
        doc.text(description, xDescription, y)
        doc.setTextColor(22, 101, 52)
        doc.text(isEarning ? formatCurrency(item.amount) : "-", xEarnings, y, {
          align: "right",
        })
        doc.setTextColor(29, 78, 216)
        doc.text(isBenefit ? formatCurrency(item.amount) : "-", xBenefits, y, {
          align: "right",
        })
        doc.setTextColor(185, 28, 28)
        doc.text(isDiscount ? formatCurrency(item.amount) : "-", xDeductions, y, {
          align: "right",
        })
        y += Math.max(7, description.length * 5)
      }

      y += 2
      doc.setDrawColor(203, 213, 225)
      doc.line(20, y, 190, y)
      y += 8
      doc.setFont("helvetica", "bold")
      doc.setTextColor(15, 23, 42)
      doc.text("Subtotais", xDescription, y)
      doc.setTextColor(22, 101, 52)
      doc.text(formatCurrency(entry.total_earnings), xEarnings, y, { align: "right" })
      doc.setTextColor(29, 78, 216)
      doc.text(formatCurrency(entry.total_informative), xBenefits, y, { align: "right" })
      doc.setTextColor(185, 28, 28)
      doc.text(formatCurrency(entry.total_deductions), xDeductions, y, {
        align: "right",
      })

      y += 12
      doc.setTextColor(15, 23, 42)
      doc.setFontSize(11)
      doc.text("Total líquido (Proventos - Descontos)", xDescription, y)
      doc.text(formatCurrency(entry.total_amount), xDeductions, y, { align: "right" })
      y += 8
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.text("Total de benefícios", xDescription, y)
      doc.text(formatCurrency(entry.total_informative), xDeductions, y, {
        align: "right",
      })

      if (entry.paid_at) {
        y += 12
        doc.text(`Pago em: ${formatDateTime(entry.paid_at)}`, 20, y)
      }

      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(`Documento gerado em ${formatDate(new Date().toISOString())}`, 105, 280, {
        align: "center",
      })

      const fileName = `holerite_${sanitize(entry.employee_name)}_${period.reference_month}_${period.reference_year}.pdf`
      doc.save(fileName)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleGenerate}
      disabled={loading}
      title="Gerar holerite em PDF"
    >
      <FileText className="h-3.5 w-3.5 mr-1" />
      {loading ? "..." : "PDF"}
    </Button>
  )
}
