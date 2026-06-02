"use client"

import { useCallback, useEffect, useState } from "react"
import { Pencil, Plus, Trash2, Trophy } from "lucide-react"
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
import { PropostaForm } from "@/components/modules/compras/PropostaForm"
import {
  deleteProposta,
  getCotacao,
  selecionarVencedor,
} from "@/services/compras"
import { Quotation, QuotationProposal, QuotationStatus, Supplier } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

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

function proposalTotal(quotation: Quotation, proposal: QuotationProposal): number {
  if (quotation.order_type === "servico") return proposal.total_price ?? 0
  return quotation.items.reduce((acc, item) => {
    const pi = proposal.proposal_items.find((x) => x.quotation_item_id === item.id)
    return acc + item.quantity * (pi ? pi.unit_price : 0)
  }, 0)
}

interface CotacaoDetalheModalProps {
  quotation_id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: Supplier[]
  onChanged: () => void
}

export function CotacaoDetalheModal({
  quotation_id,
  open,
  onOpenChange,
  suppliers,
  onChanged,
}: CotacaoDetalheModalProps) {
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(false)

  const [propostaFormOpen, setPropostaFormOpen] = useState(false)
  const [editingProposal, setEditingProposal] = useState<QuotationProposal | undefined>(
    undefined
  )

  const [selectTarget, setSelectTarget] = useState<QuotationProposal | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<QuotationProposal | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCotacao(quotation_id)
      setQuotation(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar cotação")
    } finally {
      setLoading(false)
    }
  }, [quotation_id])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  function handleOpenChange(next: boolean) {
    if (!next) onChanged()
    onOpenChange(next)
  }

  async function refresh() {
    await load()
    onChanged()
  }

  function openAddProposta() {
    setEditingProposal(undefined)
    setPropostaFormOpen(true)
  }

  function openEditProposta(proposal: QuotationProposal) {
    setEditingProposal(proposal)
    setPropostaFormOpen(true)
  }

  async function confirmSelect() {
    if (!selectTarget || !quotation) return
    setSelecting(true)
    try {
      await selecionarVencedor(quotation.id, selectTarget.id)
      toast.success("Proposta vencedora selecionada — enviada para aprovação do financeiro")
      setSelectTarget(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao selecionar vencedor")
    } finally {
      setSelecting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !quotation) return
    setDeleting(true)
    try {
      await deleteProposta(quotation.id, deleteTarget.id)
      toast.success("Proposta removida")
      setDeleteTarget(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover proposta")
    } finally {
      setDeleting(false)
    }
  }

  const isEditable = quotation?.status === "em_andamento"
  const isService = quotation?.order_type === "servico"

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhe da Cotação</DialogTitle>
          </DialogHeader>

          {loading || !quotation ? (
            <div className="py-12 text-center text-slate-400">Carregando...</div>
          ) : (
            <div className="space-y-6">
              {/* Info */}
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
                {quotation.notes && (
                  <span className="text-sm text-slate-500 italic">{quotation.notes}</span>
                )}
              </div>

              {/* Itens solicitados / Serviço */}
              {isService ? (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Descrição do serviço</p>
                  <p className="text-sm text-slate-700">
                    {quotation.service_description}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Itens solicitados
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotation.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.stock_item_name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Propostas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700">Propostas</p>
                  {isEditable && (
                    <Button size="sm" variant="outline" onClick={openAddProposta}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar Proposta
                    </Button>
                  )}
                </div>

                {quotation.proposals.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Nenhuma proposta cadastrada
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fornecedor</TableHead>
                        {isService ? (
                          <TableHead className="text-right">Preço Total</TableHead>
                        ) : (
                          <>
                            {quotation.items.map((item) => (
                              <TableHead key={item.id} className="text-right">
                                Preço {item.stock_item_name}
                              </TableHead>
                            ))}
                            <TableHead className="text-right">Total Estimado</TableHead>
                          </>
                        )}
                        <TableHead>Notes</TableHead>
                        {isEditable && <TableHead className="text-right">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotation.proposals.map((proposal) => {
                        const isWinner = proposal.id === quotation.winning_proposal_id
                        return (
                          <TableRow
                            key={proposal.id}
                            className={isWinner ? "bg-green-50" : undefined}
                          >
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-1.5">
                                {isWinner && (
                                  <Trophy className="h-4 w-4 text-green-600" />
                                )}
                                {proposal.supplier_name}
                              </span>
                            </TableCell>
                            {isService ? (
                              <TableCell className="text-right">
                                {formatCurrency(proposal.total_price ?? 0)}
                              </TableCell>
                            ) : (
                              <>
                                {quotation.items.map((item) => {
                                  const pi = proposal.proposal_items.find(
                                    (x) => x.quotation_item_id === item.id
                                  )
                                  return (
                                    <TableCell key={item.id} className="text-right">
                                      {formatCurrency(pi ? pi.unit_price : 0)}
                                    </TableCell>
                                  )
                                })}
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(proposalTotal(quotation, proposal))}
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-sm text-slate-500">
                              {proposal.notes || "—"}
                            </TableCell>
                            {isEditable && (
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectTarget(proposal)}
                                  >
                                    Selecionar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditProposta(proposal)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDeleteTarget(proposal)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {quotation && (
        <PropostaForm
          open={propostaFormOpen}
          onOpenChange={setPropostaFormOpen}
          quotation={quotation}
          proposal={editingProposal}
          suppliers={suppliers}
          onSuccess={refresh}
        />
      )}

      {/* AlertDialog: selecionar vencedor */}
      <AlertDialog
        open={selectTarget !== null}
        onOpenChange={(o) => !o && setSelectTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selecionar proposta vencedora?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja selecionar <strong>{selectTarget?.supplier_name}</strong> como
              vencedor? A cotação será enviada para aprovação do financeiro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSelect} disabled={selecting}>
              {selecting ? "Selecionando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: remover proposta */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              A proposta de <strong>{deleteTarget?.supplier_name}</strong> será removida
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
