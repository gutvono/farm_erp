"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { RootLayout } from "@/components/layout/RootLayout"
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
import {
  AccountsPayable,
  AccountsReceivable,
  Balance,
  CashFlowPoint,
  DefaulterItem,
  FinancialMovement,
  PayableStatus,
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

  useEffect(() => {
    loadOverview()
    loadMovements()
  }, [loadOverview, loadMovements])

  useEffect(() => {
    loadPayables()
  }, [loadPayables])

  useEffect(() => {
    loadReceivables()
  }, [loadReceivables])

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
    </RootLayout>
  )
}
