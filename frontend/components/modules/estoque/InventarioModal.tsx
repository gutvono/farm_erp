"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Inventory, StockCategory } from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

const CATEGORY_LABELS: Record<StockCategory, string> = {
  cafe: "Café",
  insumo: "Insumo",
  equipamento: "Equipamento",
  veiculo: "Veículo",
  outro: "Outro",
}

interface InventarioModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inventory: Inventory | null
  loading: boolean
}

export function InventarioModal({
  open,
  onOpenChange,
  inventory,
  loading,
}: InventarioModalProps) {
  const [exporting, setExporting] = useState(false)

  async function handleExportPdf() {
    if (!inventory) return
    setExporting(true)
    try {
      const { jsPDF } = await import("jspdf")
      const doc = new jsPDF()

      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 14
      let y = 20

      doc.setFontSize(18)
      doc.setFont("helvetica", "bold")
      doc.text("Inventário de Estoque", pageWidth / 2, y, { align: "center" })
      y += 8

      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100)
      doc.text(`Gerado em: ${formatDate(inventory.generated_at)}`, pageWidth / 2, y, {
        align: "center",
      })
      y += 10
      doc.setTextColor(0)

      const headers = ["Nome", "SKU", "Categoria", "Und.", "Qtd.", "Custo Unit.", "Valor Total"]
      const colWidths = [48, 28, 22, 14, 16, 26, 26]
      const colX: number[] = []
      let cx = margin
      for (const w of colWidths) {
        colX.push(cx)
        cx += w
      }

      doc.setFontSize(9)
      doc.setFont("helvetica", "bold")
      doc.setFillColor(240, 240, 240)
      doc.rect(margin, y, pageWidth - margin * 2, 7, "F")
      headers.forEach((h, i) => {
        const align = i >= 4 ? "right" : "left"
        const x = align === "right" ? colX[i] + colWidths[i] - 1 : colX[i] + 1
        doc.text(h, x, y + 5, { align })
      })
      y += 8

      doc.setFont("helvetica", "normal")
      for (const item of inventory.items) {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        const row = [
          item.name,
          item.sku,
          CATEGORY_LABELS[item.category],
          item.unit,
          String(item.quantity_on_hand),
          formatCurrency(item.unit_cost),
          formatCurrency(item.total_value),
        ]
        row.forEach((cell, i) => {
          const align = i >= 4 ? "right" : "left"
          const x = align === "right" ? colX[i] + colWidths[i] - 1 : colX[i] + 1
          doc.text(String(cell), x, y + 4, { align })
        })
        y += 7

        doc.setDrawColor(230, 230, 230)
        doc.line(margin, y, pageWidth - margin, y)
      }

      y += 6
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.text("Total Geral:", colX[5], y, { align: "left" })
      doc.text(formatCurrency(inventory.total_value), colX[6] + colWidths[6] - 1, y, {
        align: "right",
      })

      const dateStr = inventory.generated_at.split("T")[0]
      doc.save(`inventario_${dateStr}.pdf`)
      toast.success("PDF gerado com sucesso")
    } catch {
      toast.error("Erro ao gerar PDF")
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Inventário de Estoque</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exporting || loading || !inventory}
              className="mr-6"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? "Gerando PDF..." : "Exportar PDF"}
            </Button>
          </div>
          {inventory && (
            <p className="text-sm text-slate-500 mt-1">
              Gerado em {formatDate(inventory.generated_at)}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              Carregando inventário...
            </div>
          ) : !inventory ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              Nenhum dado disponível
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Custo Unit.</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={item.is_below_minimum ? "bg-yellow-50" : undefined}
                    >
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-slate-500 text-sm">{item.sku}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{CATEGORY_LABELS[item.category]}</Badge>
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right">{item.quantity_on_hand}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.total_value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="border-t mt-2 pt-3 px-4 pb-2 flex justify-end items-center gap-2">
                <span className="text-slate-600 font-medium">Valor Total do Inventário:</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatCurrency(inventory.total_value)}
                </span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
