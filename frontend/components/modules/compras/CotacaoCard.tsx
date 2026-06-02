"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Lock, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CotacaoDetalheModal } from "@/components/modules/compras/CotacaoDetalheModal"
import { RealizeOrderModal } from "@/components/modules/compras/RealizeOrderModal"
import { cancelarCotacao } from "@/services/compras"
import { Quotation, QuotationStatus, Supplier } from "@/types/index"
import { formatDate } from "@/lib/utils"

const STATUS_LABELS: Record<QuotationStatus, string> = {
  em_andamento: "Em andamento",
  aguardando_aprovacao_financeiro: "Aguardando aprovação",
  aprovado_financeiro: "Aprovado pelo financeiro",
  concluida: "Concluída",
  cancelada: "Cancelada",
}

const STATUS_COLORS: Record<QuotationStatus, string> = {
  em_andamento: "bg-blue-100 text-blue-800",
  aguardando_aprovacao_financeiro: "bg-yellow-100 text-yellow-800",
  aprovado_financeiro: "bg-emerald-100 text-emerald-700",
  concluida: "bg-green-700 text-white",
  cancelada: "bg-slate-100 text-slate-600",
}

interface CotacaoCardProps {
  quotation: Quotation
  suppliers: Supplier[]
  onChanged: () => void
}

export function CotacaoCard({ quotation, suppliers, onChanged }: CotacaoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [realizeOpen, setRealizeOpen] = useState(false)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelNote, setCancelNote] = useState("")
  const [cancelling, setCancelling] = useState(false)

  const isService = quotation.order_type === "servico"

  async function handleCancel() {
    if (!cancelNote.trim()) return
    setCancelling(true)
    try {
      await cancelarCotacao(quotation.id, cancelNote.trim())
      toast.success("Cotação cancelada")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar cotação")
    } finally {
      setCancelling(false)
      setCancelOpen(false)
      setCancelNote("")
    }
  }

  const shortOrderId = quotation.purchase_order_id
    ? quotation.purchase_order_id.slice(0, 8)
    : ""

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={
                    isService
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-blue-100 text-blue-800"
                  }
                >
                  {isService ? "Serviço" : "Produto"}
                </Badge>
                <Badge className={STATUS_COLORS[quotation.status]}>
                  {STATUS_LABELS[quotation.status]}
                </Badge>
                {quotation.status === "aprovado_financeiro" && (
                  <Badge className="bg-emerald-100 text-emerald-700">
                    Aprovado pelo financeiro
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {formatDate(quotation.created_at)}
                {!isService && (
                  <>
                    {" · "}
                    {quotation.items.length} item
                    {quotation.items.length !== 1 ? "s" : ""}
                  </>
                )}
                {" · "}
                {quotation.proposals.length} proposta
                {quotation.proposals.length !== 1 ? "s" : ""}
              </p>
              {quotation.notes && (
                <p className="text-sm text-slate-500 mt-1 italic">{quotation.notes}</p>
              )}

              {quotation.status === "aguardando_aprovacao_financeiro" && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Aguardando aprovação do financeiro
                </p>
              )}

              {quotation.status === "concluida" && quotation.purchase_order_id && (
                <p className="text-xs text-green-700 mt-1">
                  Ordem #{shortOrderId} criada
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {quotation.status === "em_andamento" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setDetailOpen(true)}>
                    Gerenciar Propostas
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Cancelar cotação"
                    onClick={() => setCancelOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </>
              )}

              {quotation.status === "aguardando_aprovacao_financeiro" && (
                <div
                  className="p-2 text-yellow-600"
                  title="Aguardando aprovação do financeiro"
                >
                  <Lock className="h-4 w-4" />
                </div>
              )}

              {quotation.status === "aprovado_financeiro" && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => setRealizeOpen(true)}
                >
                  Realizar Pedido
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
          <CardContent className="pt-0 space-y-3">
            {isService ? (
              quotation.service_description && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Descrição do serviço</p>
                  <p className="text-sm text-slate-700">
                    {quotation.service_description}
                  </p>
                </div>
              )
            ) : (
              <div>
                <p className="text-xs text-slate-500 mb-1">Itens solicitados</p>
                <ul className="space-y-0.5">
                  {quotation.items.map((item) => (
                    <li key={item.id} className="text-sm text-slate-700">
                      {item.stock_item_name} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-slate-500">
              {quotation.proposals.length} fornecedor
              {quotation.proposals.length !== 1 ? "es" : ""} cotara
              {quotation.proposals.length !== 1 ? "m" : ""}
            </p>

            {quotation.status === "cancelada" && quotation.cancellation_note && (
              <p className="text-sm text-slate-500">
                Motivo do cancelamento: {quotation.cancellation_note}
              </p>
            )}
          </CardContent>
        )}
      </Card>

      <CotacaoDetalheModal
        quotation_id={quotation.id}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        suppliers={suppliers}
        onChanged={onChanged}
      />

      <RealizeOrderModal
        open={realizeOpen}
        onOpenChange={setRealizeOpen}
        quotation={quotation}
        onSuccess={onChanged}
      />

      {/* AlertDialog: cancelar cotação (com motivo) */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cotação?</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo do cancelamento. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-note">Motivo *</Label>
            <Input
              id="cancel-note"
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              placeholder="Descreva o motivo..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelNote("")}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleCancel()
              }}
              disabled={cancelling || !cancelNote.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
