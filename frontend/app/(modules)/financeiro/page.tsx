"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { RootLayout } from "@/components/layout/RootLayout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CashFlowChart } from "@/components/modules/dashboard/CashFlowChart"
import { SaldoCard } from "@/components/modules/financeiro/SaldoCard"
import { ContaRow } from "@/components/modules/financeiro/ContaRow"
import { ContaPayableDetail } from "@/components/modules/financeiro/ContaPayableDetail"
import { ContaReceivableDetail } from "@/components/modules/financeiro/ContaReceivableDetail"
import { NovaContaForm } from "@/components/modules/financeiro/NovaContaForm"
import { MovimentacoesTable } from "@/components/modules/financeiro/MovimentacoesTable"
import {
  getContasPagar,
  getContasReceber,
  getFluxoCaixaChartData,
  getInadimplentes,
  getMovimentacoes,
  getSaldo,
} from "@/services/financeiro"
import { getOrdens, aprovarOrdem, recusarOrdem, concluirServico } from "@/services/compras"
import {
  AccountsPayable,
  AccountsReceivable,
  Balance,
  CashFlowPoint,
  DefaulterItem,
  FinancialMovement,
  PayableStatus,
  PurchaseOrder,
  ReceivableStatus,
} from "@/types/index"
import { formatCurrency, formatDate } from "@/lib/utils"

const PAYABLE_STATUSES: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "em_aberto", label: "Em aberto" },
  { value: "paga", label: "Paga" },
  { value: "cancelada", label: "Cancelada" },
]

const RECEIVABLE_STATUSES: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "em_aberto", label: "Em aberto" },
  { value: "parcialmente_pago", label: "Parcialmente pago" },
  { value: "quitado", label: "Quitado" },
  { value: "cancelada", label: "Cancelada" },
]

export default function FinanceiroPage() {
  const [balance, setBalance] = useState<Balance | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [cashFlow, setCashFlow] = useState<CashFlowPoint[]>([])
  const [defaulters, setDefaulters] = useState<DefaulterItem[]>([])

  const [payables, setPayables] = useState<AccountsPayable[]>([])
  const [payableStatus, setPayableStatus] = useState<string>("all")
  const [payablesLoading, setPayablesLoading] = useState(false)
  const [selectedPayable, setSelectedPayable] =
    useState<AccountsPayable | null>(null)
  const [payableSheetOpen, setPayableSheetOpen] = useState(false)

  const [receivables, setReceivables] = useState<AccountsReceivable[]>([])
  const [receivableStatus, setReceivableStatus] = useState<string>("all")
  const [receivablesLoading, setReceivablesLoading] = useState(false)
  const [selectedReceivable, setSelectedReceivable] =
    useState<AccountsReceivable | null>(null)
  const [receivableSheetOpen, setReceivableSheetOpen] = useState(false)

  const [movements, setMovements] = useState<FinancialMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)

  // Aprovações
  const [pendingOrders, setPendingOrders] = useState<PurchaseOrder[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [approveTarget, setApproveTarget] = useState<PurchaseOrder | null>(null)
  const [approving, setApproving] = useState(false)
  const [approvePaymentMethod, setApprovePaymentMethod] = useState<string>("a_vista")
  const [approveInstallments, setApproveInstallments] = useState(2)
  const [approveFirstDueDate, setApproveFirstDueDate] = useState("")
  const [approveIntervalDays, setApproveIntervalDays] = useState(30)
  const [rejectTarget, setRejectTarget] = useState<PurchaseOrder | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [rejecting, setRejecting] = useState(false)

  const loadOverview = useCallback(async () => {
    setBalanceLoading(true)
    try {
      const [bal, flow, def] = await Promise.all([
        getSaldo(),
        getFluxoCaixaChartData(6),
        getInadimplentes(),
      ])
      setBalance(bal)
      setCashFlow(flow)
      setDefaulters(def)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar dados"
      toast.error(message)
    } finally {
      setBalanceLoading(false)
    }
  }, [])

  const loadPayables = useCallback(async () => {
    setPayablesLoading(true)
    try {
      const status =
        payableStatus === "all" ? undefined : (payableStatus as PayableStatus)
      const data = await getContasPagar(status)
      setPayables(data)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar contas a pagar"
      toast.error(message)
    } finally {
      setPayablesLoading(false)
    }
  }, [payableStatus])

  const loadReceivables = useCallback(async () => {
    setReceivablesLoading(true)
    try {
      const status =
        receivableStatus === "all"
          ? undefined
          : (receivableStatus as ReceivableStatus)
      const data = await getContasReceber(status)
      setReceivables(data)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao carregar contas a receber"
      toast.error(message)
    } finally {
      setReceivablesLoading(false)
    }
  }, [receivableStatus])

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true)
    try {
      const data = await getMovimentacoes()
      setMovements(data)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar movimentações"
      toast.error(message)
    } finally {
      setMovementsLoading(false)
    }
  }, [])

  const loadPendingOrders = useCallback(async () => {
    setPendingLoading(true)
    try {
      const data = await getOrdens("aguardando_aprovacao_financeiro")
      setPendingOrders(data)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar aprovações pendentes"
      toast.error(message)
    } finally {
      setPendingLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOverview()
    loadMovements()
  }, [loadOverview, loadMovements])

  useEffect(() => { loadPayables() }, [loadPayables])
  useEffect(() => { loadReceivables() }, [loadReceivables])
  useEffect(() => { loadPendingOrders() }, [loadPendingOrders])

  function handlePayableClick(conta: AccountsPayable) {
    setSelectedPayable(conta)
    setPayableSheetOpen(true)
  }

  function handleReceivableClick(conta: AccountsReceivable) {
    setSelectedReceivable(conta)
    setReceivableSheetOpen(true)
  }

  async function refreshAfterPayableChange() {
    await Promise.all([loadPayables(), loadOverview(), loadMovements()])
  }

  async function refreshAfterReceivableChange() {
    await Promise.all([loadReceivables(), loadOverview(), loadMovements()])
  }

  function calcApproveInstallmentPreview() {
    if (approvePaymentMethod !== "parcelado" || approveInstallments < 2 || !approveFirstDueDate)
      return []
    const total = approveTarget?.total_amount ?? 0
    const base = Math.round((total / approveInstallments) * 100) / 100
    const [y, m, d] = approveFirstDueDate.split("-").map(Number)
    return Array.from({ length: approveInstallments }, (_, i) => {
      const dt = new Date(y, m - 1, d)
      dt.setDate(dt.getDate() + i * approveIntervalDays)
      const amount =
        i === approveInstallments - 1
          ? Math.round((total - base * (approveInstallments - 1)) * 100) / 100
          : base
      return { label: `${i + 1}/${approveInstallments}`, due: dt.toLocaleDateString("pt-BR"), amount }
    })
  }

  async function handleConfirmApprove() {
    if (!approveTarget) return
    setApproving(true)
    try {
      const isServico = approveTarget.order_type === "servico"
      const orderId = approveTarget.id
      const supplierName = approveTarget.supplier_name

      const data: Parameters<typeof aprovarOrdem>[1] = {
        payment_method: approvePaymentMethod as Parameters<typeof aprovarOrdem>[1]["payment_method"],
      }
      if (approvePaymentMethod === "parcelado") {
        data.installments = approveInstallments
        data.first_due_date = approveFirstDueDate
        data.installment_interval_days = approveIntervalDays
      }
      await aprovarOrdem(orderId, data)

      if (isServico) {
        await concluirServico(orderId)
        toast.success(`Serviço de ${supplierName} aprovado e enviado para pagamento`)
        setApproveTarget(null)
        await Promise.all([loadPendingOrders(), loadPayables()])
      } else {
        toast.success(`Ordem de ${supplierName} aprovada`)
        setApproveTarget(null)
        await loadPendingOrders()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar ordem")
    } finally {
      setApproving(false)
    }
  }

  async function handleConfirmReject() {
    if (!rejectTarget || !rejectNote.trim()) return
    setRejecting(true)
    try {
      await recusarOrdem(rejectTarget.id, rejectNote.trim())
      toast.success(`Ordem de ${rejectTarget.supplier_name} recusada`)
      setRejectTarget(null)
      setRejectNote("")
      await loadPendingOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao recusar ordem")
    } finally {
      setRejecting(false)
    }
  }

  return (
    <RootLayout title="Financeiro">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Financeiro</h2>
          <p className="text-sm text-slate-500">
            Conta corrente, contas a pagar, contas a receber e movimentações
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="approvals" className="relative">
              Aprovações
              {pendingOrders.length > 0 && (
                <span className="ml-1.5 rounded-full bg-yellow-500 text-white text-xs px-1.5 py-0.5 leading-none">
                  {pendingOrders.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
            <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
            <TabsTrigger value="movements">Movimentações</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <SaldoCard
              balance={balance}
              loading={balanceLoading}
              onRefresh={loadOverview}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-700">
                  Fluxo de Caixa — Últimos 6 Meses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cashFlow.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Sem movimentações no período.
                  </p>
                ) : (
                  <CashFlowChart data={cashFlow} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-700">
                  Clientes Inadimplentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {defaulters.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhum cliente inadimplente
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Vencimento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {defaulters.map((d) => (
                        <TableRow key={d.receivable_id}>
                          <TableCell className="font-medium">
                            {d.client_name}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-slate-500">
                            {d.receivable_number}
                          </TableCell>
                          <TableCell>{formatCurrency(d.amount)}</TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {formatDate(d.due_date)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Aba Aprovações ── */}
          <TabsContent value="approvals" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Ordens de compra aguardando aprovação financeira
              </p>
            </div>

            {pendingLoading ? (
              <p className="text-sm text-slate-500">Carregando...</p>
            ) : pendingOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                Nenhuma ordem aguardando aprovação
              </div>
            ) : (
              <div className="space-y-3">
                {pendingOrders.map((order) => (
                  <Card key={order.id} className="border-yellow-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">
                              {order.supplier_name}
                            </span>
                            <Badge className="bg-yellow-100 text-yellow-800">
                              Aguardando aprovação
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {formatDate(order.ordered_at)} ·{" "}
                            {order.order_type === "servico" ? "Serviço" : `${order.items.length} item${order.items.length !== 1 ? "s" : ""}`} ·{" "}
                            <span className="font-medium text-slate-700">
                              {formatCurrency(order.total_amount)}
                            </span>
                          </p>
                          {order.notes && (
                            <p className="text-sm text-slate-500 mt-1 italic">{order.notes}</p>
                          )}
                          {order.order_type === "servico" && order.service_description && (
                            <p className="text-xs text-slate-500 mt-1">{order.service_description}</p>
                          )}
                          {order.order_type !== "servico" && (
                            <div className="mt-2 space-y-0.5">
                              {order.items.map((item) => (
                                <p key={item.id} className="text-xs text-slate-500">
                                  {item.stock_item_name} × {item.quantity} —{" "}
                                  {formatCurrency(item.subtotal)}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => setApproveTarget(order)}
                          >
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setRejectNote("")
                              setRejectTarget(order)
                            }}
                          >
                            Recusar
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payables" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="w-52">
                <Select
                  value={payableStatus}
                  onValueChange={setPayableStatus}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYABLE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NovaContaForm
                type="pagar"
                onSuccess={refreshAfterPayableChange}
                trigger={
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Nova conta a pagar
                  </Button>
                }
              />
            </div>

            {payablesLoading && (
              <p className="text-sm text-slate-500">Carregando...</p>
            )}
            {!payablesLoading && payables.length === 0 && (
              <p className="text-sm text-slate-500">
                Nenhuma conta encontrada
              </p>
            )}
            <div className="space-y-2">
              {payables.map((conta) => (
                <ContaRow
                  key={conta.id}
                  conta={conta}
                  onClick={() => handlePayableClick(conta)}
                />
              ))}
            </div>

            <ContaPayableDetail
              conta={selectedPayable}
              open={payableSheetOpen}
              onOpenChange={setPayableSheetOpen}
              onChanged={refreshAfterPayableChange}
            />
          </TabsContent>

          <TabsContent value="receivables" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="w-52">
                <Select
                  value={receivableStatus}
                  onValueChange={setReceivableStatus}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECEIVABLE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NovaContaForm
                type="receber"
                onSuccess={refreshAfterReceivableChange}
                trigger={
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Nova conta a receber
                  </Button>
                }
              />
            </div>

            {receivablesLoading && (
              <p className="text-sm text-slate-500">Carregando...</p>
            )}
            {!receivablesLoading && receivables.length === 0 && (
              <p className="text-sm text-slate-500">
                Nenhuma conta encontrada
              </p>
            )}
            <div className="space-y-2">
              {receivables.map((conta) => (
                <ContaRow
                  key={conta.id}
                  conta={conta}
                  onClick={() => handleReceivableClick(conta)}
                />
              ))}
            </div>

            <ContaReceivableDetail
              conta={selectedReceivable}
              open={receivableSheetOpen}
              onOpenChange={setReceivableSheetOpen}
              onChanged={refreshAfterReceivableChange}
            />
          </TabsContent>

          <TabsContent value="movements">
            <MovimentacoesTable
              movements={movements}
              loading={movementsLoading}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog: aprovar ordem (coleta condições de pagamento) */}
      <Dialog
        open={approveTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setApproveTarget(null)
            setApprovePaymentMethod("a_vista")
            setApproveInstallments(2)
            setApproveFirstDueDate("")
            setApproveIntervalDays(30)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar Ordem de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-slate-600">
              Fornecedor: <strong>{approveTarget?.supplier_name}</strong> ·{" "}
              {formatCurrency(approveTarget?.total_amount ?? 0)}
            </p>

            <div className="space-y-1">
              <Label>Forma de Pagamento *</Label>
              <Select value={approvePaymentMethod} onValueChange={(v) => { setApprovePaymentMethod(v); setApproveInstallments(2) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_vista">À Vista</SelectItem>
                  <SelectItem value="parcelado">Parcelado</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {approvePaymentMethod === "parcelado" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Parcelas</Label>
                    <Select value={String(approveInstallments)} onValueChange={(v) => setApproveInstallments(parseInt(v, 10))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">1ª Parcela</Label>
                    <Input
                      type="date"
                      value={approveFirstDueDate}
                      onChange={(e) => setApproveFirstDueDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Intervalo (dias)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={approveIntervalDays}
                      onChange={(e) => setApproveIntervalDays(parseInt(e.target.value, 10) || 30)}
                    />
                  </div>
                </div>
                {calcApproveInstallmentPreview().length > 0 && (
                  <div className="overflow-hidden rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium">Parcela</th>
                          <th className="px-3 py-1.5 text-left font-medium">Vencimento</th>
                          <th className="px-3 py-1.5 text-right font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcApproveInstallmentPreview().map((row, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5">{row.label}</td>
                            <td className="px-3 py-1.5">{row.due}</td>
                            <td className="px-3 py-1.5 text-right">{formatCurrency(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setApproveTarget(null)}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmApprove}
                disabled={approving || (approvePaymentMethod === "parcelado" && !approveFirstDueDate)}
                className="bg-green-600 hover:bg-green-700"
              >
                {approving ? "Aprovando..." : "Confirmar aprovação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: recusar ordem */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar ordem de compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-600">
              Fornecedor: <strong>{rejectTarget?.supplier_name}</strong> ·{" "}
              {formatCurrency(rejectTarget?.total_amount ?? 0)}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reject-note">Motivo da recusa *</Label>
              <Input
                id="reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Descreva o motivo..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>
                Cancelar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                disabled={!rejectNote.trim() || rejecting}
                onClick={handleConfirmReject}
              >
                {rejecting ? "Recusando..." : "Confirmar recusa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </RootLayout>
  )
}
