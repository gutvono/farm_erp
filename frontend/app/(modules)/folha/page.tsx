"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Lock, Plus } from "lucide-react"
import { toast } from "sonner"
import { RootLayout } from "@/components/layout/RootLayout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { CargosTab } from "@/components/modules/folha/CargosTab"
import { HoleritesTable } from "@/components/modules/folha/HoleritesTable"
import { FuncionariosTable } from "@/components/modules/folha/FuncionariosTable"
import { useFuncionarios } from "@/components/modules/folha/useFuncionarios"
import { FuncionarioForm } from "@/components/modules/folha/FuncionarioForm"
import { HoleritePDF } from "@/components/modules/folha/HoleritePDF"
import { PagarTodosButton } from "@/components/modules/folha/PagarTodosButton"
import { PeriodoSelector } from "@/components/modules/folha/PeriodoSelector"
import {
  fecharPeriodo,
  getFuncionarios,
  getHoleritesFuncionario,
  getPeriodo,
} from "@/services/folha"
import { Employee, EmployeePayslip, PayrollPeriod } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril",
  "Maio", "Junho", "Julho", "Agosto",
  "Setembro", "Outubro", "Novembro", "Dezembro",
]

export default function FolhaPage() {
  // Período / folha
  const [period, setPeriod] = useState<PayrollPeriod | null>(null)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [fecharOpen, setFecharOpen] = useState(false)
  const [fechando, setFechando] = useState(false)

  // Funcionários (tabela paginada)
  const funcionarios = useFuncionarios()
  const [funcFormOpen, setFuncFormOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [historyEmployeeId, setHistoryEmployeeId] = useState("")
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear())
  const [historyPayslips, setHistoryPayslips] = useState<EmployeePayslip[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const reloadPeriod = useCallback(async () => {
    if (!period) return
    setPeriodLoading(true)
    try {
      const data = await getPeriodo(period.id)
      setPeriod(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao recarregar período")
    } finally {
      setPeriodLoading(false)
    }
  }, [period])

  function handlePeriodLoaded(p: PayrollPeriod) {
    setPeriod(p)
  }

  function handleEditEmployee(emp: Employee) {
    setEditingEmployee(emp)
    setFuncFormOpen(true)
  }

  function handleNewEmployee() {
    setEditingEmployee(null)
    setFuncFormOpen(true)
  }

  async function handleFecharPeriodo() {
    if (!period) return
    setFechando(true)
    try {
      const updated = await fecharPeriodo(period.id)
      toast.success(
        `Período ${MONTHS[updated.reference_month - 1]}/${updated.reference_year} fechado`
      )
      setPeriod(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao fechar período")
    } finally {
      setFechando(false)
      setFecharOpen(false)
    }
  }

  // Mapa employee.id → Employee (para fotos/avatars/CPF na tabela de holerites).
  // Carregamos a lista completa (ativos + inativos) só uma vez para isso.
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const loadAllEmployees = useCallback(() => {
    Promise.all([
      getFuncionarios({ is_active: true }),
      getFuncionarios({ is_active: false }),
    ])
      .then(([active, inactive]) => setAllEmployees([...active, ...inactive]))
      .catch(() => {})
  }, [])
  useEffect(() => {
    loadAllEmployees()
  }, [loadAllEmployees])

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>()
    for (const emp of allEmployees) map.set(emp.id, emp)
    return map
  }, [allEmployees])

  function handleEmployeesChanged() {
    funcionarios.reload()
    loadAllEmployees()
  }

  // Resumo do período
  const summary = useMemo(() => {
    if (!period) return null
    const pending = period.entries.filter((e) => e.status === "pendente")
    const awaiting = period.entries.filter((e) => e.status === "aguardando_aprovacao")
    const paid = period.entries.filter((e) => e.status === "pago")
    const totalPending = pending.reduce((s, e) => s + e.total_amount, 0)
    const totalPaid = paid.reduce((s, e) => s + e.total_amount, 0)
    const total = period.entries.reduce((s, e) => s + e.total_amount, 0)
    return { pending, awaiting, paid, totalPending, totalPaid, total }
  }, [period])

  const loadHistory = useCallback(async () => {
    if (!historyEmployeeId) {
      setHistoryPayslips([])
      return
    }
    setHistoryLoading(true)
    try {
      const data = await getHoleritesFuncionario(historyEmployeeId, historyYear)
      setHistoryPayslips(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar histórico")
    } finally {
      setHistoryLoading(false)
    }
  }, [historyEmployeeId, historyYear])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const historySummary = useMemo(() => {
    if (historyPayslips.length === 0) return null
    const count = historyPayslips.length
    const totalLiquido = historyPayslips.reduce((s, p) => s + p.total_amount, 0)
    const totalProventos = historyPayslips.reduce((s, p) => s + p.total_earnings, 0)
    const totalDescontos = historyPayslips.reduce((s, p) => s + p.total_deductions, 0)
    const totalBeneficios = historyPayslips.reduce(
      (s, p) => s + p.total_informative,
      0
    )
    const paidCount = historyPayslips.filter((p) => p.status === "pago").length
    const maior = historyPayslips.reduce(
      (max, p) => (p.total_amount > max.total_amount ? p : max),
      historyPayslips[0]
    )
    return {
      count,
      paidCount,
      totalLiquido,
      totalProventos,
      totalDescontos,
      totalBeneficios,
      mediaLiquida: totalLiquido / count,
      maiorLiquido: maior.total_amount,
      maiorMes: MONTHS[maior.reference_month - 1],
    }
  }, [historyPayslips])

  function periodFromPayslip(payslip: EmployeePayslip): PayrollPeriod {
    return {
      id: payslip.payroll_period_id,
      reference_month: payslip.reference_month,
      reference_year: payslip.reference_year,
      status: payslip.period_status,
      total_amount: payslip.total_amount,
      entries: [payslip],
      created_at: new Date().toISOString(),
    }
  }

  return (
    <RootLayout title="Folha de Pagamento">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Folha de Pagamento</h2>
          <p className="text-slate-500 text-sm">
            Funcionários, holerites e pagamentos mensais
          </p>
        </div>

        <Tabs defaultValue="folha">
          <TabsList>
            <TabsTrigger value="folha">Folha do Mês</TabsTrigger>
            <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
            <TabsTrigger value="cargos">Cargos</TabsTrigger>
            <TabsTrigger value="historico">Folhas do funcionário</TabsTrigger>
          </TabsList>

          {/* ── Aba Folha do Mês ── */}
          <TabsContent value="folha" className="space-y-4">
            <PeriodoSelector activePeriod={period} onPeriodLoaded={handlePeriodLoaded} />

            {!period ? (
              <div className="py-16 text-center text-slate-400">
                Selecione um mês e ano e clique em &quot;Abrir Período&quot; para visualizar
                a folha. Períodos já existentes serão recuperados automaticamente.
              </div>
            ) : (
              <>
                {/* Resumo */}
                {summary && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500">Total da folha</p>
                        <p className="text-xl font-bold text-slate-900">
                          {formatCurrency(summary.total)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500">Total pago</p>
                        <p className="text-xl font-bold text-green-700">
                          {formatCurrency(summary.totalPaid)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500">Total pendente</p>
                        <p className="text-xl font-bold text-yellow-700">
                          {formatCurrency(summary.totalPending)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500">Status</p>
                        <p
                          className={`text-xl font-bold ${
                            period.status === "aberta" ? "text-green-700" : "text-slate-700"
                          }`}
                        >
                          {period.status === "aberta" ? "Aberta" : "Fechada"}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Ações */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm text-slate-600">
                    {period.entries.length} holerite
                    {period.entries.length !== 1 ? "s" : ""} ·{" "}
                    {summary?.pending.length ?? 0} pendente
                    {(summary?.pending.length ?? 0) !== 1 ? "s" : ""}
                    {(summary?.awaiting.length ?? 0) > 0 && (
                      <> · {summary?.awaiting.length} aguardando aprovação</>
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    {period.status === "aberta" && summary && summary.pending.length > 0 && (
                      <PagarTodosButton
                        periodId={period.id}
                        pendingEntries={summary.pending}
                        onSuccess={reloadPeriod}
                      />
                    )}
                    {period.status === "aberta" && (
                      <Button
                        variant="outline"
                        onClick={() => setFecharOpen(true)}
                        disabled={fechando}
                      >
                        <Lock className="h-4 w-4 mr-1" />
                        Fechar Período
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabela de holerites (filtros + ordenação client-side) */}
                <HoleritesTable
                  entries={period.entries}
                  period={period}
                  employeeById={employeeById}
                  loading={periodLoading}
                  onChanged={reloadPeriod}
                />
              </>
            )}
          </TabsContent>

          {/* ── Aba Funcionários ── */}
          <TabsContent value="funcionarios" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm text-slate-600">
                {funcionarios.data.total} funcionário
                {funcionarios.data.total !== 1 ? "s" : ""}
                {funcionarios.activeOnly ? " ativo" : ""}
                {funcionarios.activeOnly && funcionarios.data.total !== 1 ? "s" : ""}
              </span>

              <Button size="sm" onClick={handleNewEmployee}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Funcionário
              </Button>
            </div>

            <FuncionariosTable
              data={funcionarios.data}
              loading={funcionarios.loading}
              page={funcionarios.page}
              sort={funcionarios.sort}
              onPageChange={funcionarios.setPage}
              onSortChange={funcionarios.toggleSort}
              search={funcionarios.searchInput}
              onSearchChange={funcionarios.setSearchInput}
              activeOnly={funcionarios.activeOnly}
              onActiveOnlyChange={funcionarios.setActiveOnly}
              contractType={funcionarios.contractType}
              onContractTypeChange={funcionarios.setContractType}
              onEdit={handleEditEmployee}
              onChanged={handleEmployeesChanged}
            />
          </TabsContent>

          {/* ── Aba Cargos ── */}
          <TabsContent value="cargos" className="space-y-4">
            <CargosTab />
          </TabsContent>

          {/* ── Aba Histórico por Funcionário ── */}
          <TabsContent value="historico" className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 min-w-[280px]">
                <Select value={historyEmployeeId} onValueChange={setHistoryEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    {allEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                        {!emp.is_active ? " (inativo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 w-32">
                <input
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  type="number"
                  min={2000}
                  max={new Date().getFullYear()}
                  value={historyYear}
                  onChange={(event) =>
                    setHistoryYear(Number(event.target.value) || new Date().getFullYear())
                  }
                />
              </div>
            </div>

            {historySummary && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-slate-500">
                      Líquido acumulado · {historyYear}
                    </p>
                    <p className="text-xl font-bold text-slate-900">
                      {formatCurrency(historySummary.totalLiquido)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {historySummary.count} holerite
                      {historySummary.count !== 1 ? "s" : ""} ·{" "}
                      {historySummary.paidCount} pago
                      {historySummary.paidCount !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-slate-500">Média líquida mensal</p>
                    <p className="text-xl font-bold text-emerald-700">
                      {formatCurrency(historySummary.mediaLiquida)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Maior: {formatCurrency(historySummary.maiorLiquido)} (
                      {historySummary.maiorMes})
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-slate-500">Proventos · Descontos</p>
                    <p className="text-lg font-bold text-green-700">
                      {formatCurrency(historySummary.totalProventos)}
                    </p>
                    <p className="text-sm font-semibold text-red-700">
                      - {formatCurrency(historySummary.totalDescontos)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-slate-500">Benefícios acumulados</p>
                    <p className="text-xl font-bold text-blue-700">
                      {formatCurrency(historySummary.totalBeneficios)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      FGTS, vale-refeição, seguro de vida e afins
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {!historyEmployeeId ? (
              <div className="py-12 text-center text-slate-400">
                Selecione um funcionário para visualizar os holerites do ano.
              </div>
            ) : historyLoading ? (
              <div className="py-12 text-center text-slate-400">
                Carregando histórico...
              </div>
            ) : historyPayslips.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                Nenhum holerite no período
              </div>
            ) : (
              <div className="rounded-md border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competência</TableHead>
                      <TableHead className="text-right">Proventos</TableHead>
                      <TableHead className="text-right">Benefícios</TableHead>
                      <TableHead className="text-right">Descontos</TableHead>
                      <TableHead className="text-right">Total líquido</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyPayslips.map((payslip) => (
                      <TableRow key={payslip.id}>
                        <TableCell className="font-medium">
                          {MONTHS[payslip.reference_month - 1]}/{payslip.reference_year}
                        </TableCell>
                        <TableCell className="text-right text-green-700">
                          {formatCurrency(payslip.total_earnings)}
                        </TableCell>
                        <TableCell className="text-right text-blue-700">
                          {formatCurrency(payslip.total_informative)}
                        </TableCell>
                        <TableCell className="text-right text-red-700">
                          {formatCurrency(payslip.total_deductions)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(payslip.total_amount)}
                        </TableCell>
                        <TableCell>
                          {payslip.status === "pago" ? "Pago" : "Pendente"}
                        </TableCell>
                        <TableCell className="text-right">
                          <HoleritePDF
                            entry={payslip}
                            period={periodFromPayslip(payslip)}
                            employee={employeeById.get(payslip.employee_id)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <FuncionarioForm
        open={funcFormOpen}
        onOpenChange={setFuncFormOpen}
        employee={editingEmployee}
        onSuccess={handleEmployeesChanged}
      />

      <AlertDialog open={fecharOpen} onOpenChange={setFecharOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar período?</AlertDialogTitle>
            <AlertDialogDescription>
              Só é possível fechar se todos os funcionários estiverem pagos. Após o
              fechamento, o período não pode mais ser editado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFecharPeriodo} disabled={fechando}>
              {fechando ? "Fechando..." : "Confirmar fechamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RootLayout>
  )
}
