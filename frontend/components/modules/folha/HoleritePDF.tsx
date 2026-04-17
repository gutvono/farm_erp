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
      const role = employee?.role ?? "—"

      // Cabeçalho
      doc.setFontSize(18)
      doc.setFont("helvetica", "bold")
      doc.text("Coffee Farm ERP", 105, 20, { align: "center" })
      doc.setFontSize(14)
      doc.text("Holerite", 105, 28, { align: "center" })

      doc.setLineWidth(0.5)
      doc.line(20, 32, 190, 32)

      // Período
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.text("Período:", 20, 42)
      doc.setFont("helvetica", "normal")
      doc.text(`${monthLabel} / ${period.reference_year}`, 50, 42)

      // Funcionário
      doc.setFont("helvetica", "bold")
      doc.text("Funcionário:", 20, 52)
      doc.setFont("helvetica", "normal")
      doc.text(entry.employee_name, 50, 52)

      doc.setFont("helvetica", "bold")
      doc.text("CPF:", 20, 60)
      doc.setFont("helvetica", "normal")
      doc.text(cpf, 50, 60)

      doc.setFont("helvetica", "bold")
      doc.text("Cargo:", 20, 68)
      doc.setFont("helvetica", "normal")
      doc.text(role, 50, 68)

      doc.setFont("helvetica", "bold")
      doc.text("Contrato:", 20, 76)
      doc.setFont("helvetica", "normal")
      doc.text(CONTRACT_LABEL[entry.contract_type] ?? entry.contract_type, 50, 76)

      // Tabela
      doc.line(20, 84, 190, 84)
      doc.setFont("helvetica", "bold")
      doc.text("Descrição", 22, 92)
      doc.text("Valor (R$)", 188, 92, { align: "right" })
      doc.line(20, 96, 190, 96)

      doc.setFont("helvetica", "normal")
      let y = 104
      doc.text("Salário base", 22, y)
      doc.text(formatCurrency(entry.base_salary), 188, y, { align: "right" })

      y += 8
      doc.text("Horas extras", 22, y)
      doc.text(`+ ${formatCurrency(entry.overtime_amount)}`, 188, y, { align: "right" })

      y += 8
      doc.text("Descontos", 22, y)
      doc.text(`- ${formatCurrency(entry.deductions)}`, 188, y, { align: "right" })

      y += 4
      doc.line(20, y, 190, y)
      y += 8
      doc.setFont("helvetica", "bold")
      doc.setFontSize(12)
      doc.text("Total líquido", 22, y)
      doc.text(formatCurrency(entry.total_amount), 188, y, { align: "right" })

      // Pagamento
      if (entry.paid_at) {
        y += 14
        doc.setFontSize(11)
        doc.setFont("helvetica", "normal")
        doc.text(`Pago em: ${formatDateTime(entry.paid_at)}`, 20, y)
      }

      // Rodapé
      doc.setFontSize(9)
      doc.setTextColor(120)
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
