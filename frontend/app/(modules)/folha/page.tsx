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
import { EntryRow } from "@/components/modules/folha/EntryRow"
import { FuncionarioCard } from "@/components/modules/folha/FuncionarioCard"
import { FuncionarioForm } from "@/components/modules/folha/FuncionarioForm"
import { PagarTodosButton } from "@/components/modules/folha/PagarTodosButton"
import { PeriodoSelector } from "@/components/modules/folha/PeriodoSelector"
import {
  fecharPeriodo,
  getFuncionarios,
  getPeriodo,
} from "@/services/folha"
import {
  ContractType,
  Employee,
  PayrollPeriod,
} from "@/types/index"
import { formatCurrency } from "@/lib/utils"

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril",
  "Maio", "Junho", "Julho", "Agosto",
  "Setembro", "Outubro", "Novembro", "Dezembro",
]

const CONTRACT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os contratos" },
  { value: "clt", label: "CLT" },
  { value: "pj", label: "PJ" },
  { value: "temporario", label: "Temporário" },
]

export default function FolhaPage() {
  // Período / folha
  const [period, setPeriod] = useState<PayrollPeriod | null>(null)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [fecharOpen, setFecharOpen] = useState(false)
  const [fechando, setFechando] = useState(false)

  // Funcionários
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [contractFilter, setContractFilter] = useState("all")
  const [activeOnly, setActiveOnly] = useState(true)
  const [funcFormOpen, setFuncFormOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true)
    try {
      const data = await getFuncionarios({
        is_active: activeOnly ? true : undefined,
        contract_type:
          contractFilter !== "all" ? (contractFilter as ContractType) : undefined,
      })
      setEmployees(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar funcionários")
    } finally {
      setEmployeesLoading(false)
    }
  }, [activeOnly, contractFilter])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

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

  // Mapa employee.id → Employee (para fotos/avatars/CPF na tabela de holerites)
  // Carregamos a lista bruta de funcionários ativos+inativos só uma vez para isso.
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  useEffect(() => {
    Promise.all([
      getFuncionarios({ is_active: true }),
      getFuncionarios({ is_active: false }),
    ])
      .then(([active, inactive]) => setAllEmployees([...active, ...inactive]))
      .catch(() => {})
  }, [])

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>()
    for (const emp of allEmployees) map.set(emp.id, emp)
    return map
  }, [allEmployees])

  // Resumo do período
  const summary = useMemo(() => {
    if (!period) return null
    const pending = period.entries.filter((e) => e.status === "pendente")
    const paid = period.entries.filter((e) => e.status === "pago")
    const totalPending = pending.reduce((s, e) => s + e.total_amount, 0)
    const totalPaid = paid.reduce((s, e) => s + e.total_amount, 0)
    const total = period.entries.reduce((s, e) => s + e.total_amount, 0)
    return { pending, paid, totalPending, totalPaid, total }
  }, [period])

  const activeEmployeesCount = employees.filter((e) => e.is_active).length

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
                            period.status === "aberta"
                              ? "text-green-700"
                              : "text-slate-700"
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

                {/* Tabela */}
                {periodLoading ? (
                  <div className="py-12 text-center text-slate-400">
                    Carregando...
                  </div>
                ) : period.entries.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    Nenhum holerite gerado para este período
                  </div>
                ) : (
                  <div className="rounded-md border bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Funcionário</TableHead>
                          <TableHead>Contrato</TableHead>
                          <TableHead className="text-right">Salário base</TableHead>
                          <TableHead className="text-right">Horas extras</TableHead>
                          <TableHead className="text-right">Descontos</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {period.entries.map((entry) => (
                          <EntryRow
                            key={entry.id}
                            entry={entry}
                            period={period}
                            employee={employeeById.get(entry.employee_id)}
                            onChanged={reloadPeriod}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── Aba Funcionários ── */}
          <TabsContent value="funcionarios" className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={contractFilter} onValueChange={setContractFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant={activeOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveOnly((v) => !v)}
                >
                  {activeOnly ? "Apenas ativos" : "Todos"}
                </Button>

                <span className="text-sm text-slate-500">
                  {activeEmployeesCount} funcionário
                  {activeEmployeesCount !== 1 ? "s" : ""} ativo
                  {activeEmployeesCount !== 1 ? "s" : ""}
                </span>
              </div>

              <Button size="sm" onClick={handleNewEmployee}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Funcionário
              </Button>
            </div>

            {employeesLoading ? (
              <div className="py-12 text-center text-slate-400">
                Carregando funcionários...
              </div>
            ) : employees.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                Nenhum funcionário encontrado
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employees.map((emp) => (
                  <FuncionarioCard
                    key={emp.id}
                    employee={emp}
                    onEdit={() => handleEditEmployee(emp)}
                    onDemitted={() => {
                      loadEmployees()
                      setAllEmployees((prev) =>
                        prev.map((e) =>
                          e.id === emp.id ? { ...e, is_active: false } : e
                        )
                      )
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <FuncionarioForm
        open={funcFormOpen}
        onOpenChange={setFuncFormOpen}
        employee={editingEmployee}
        onSuccess={() => {
          loadEmployees()
          // recarrega tabela de holerites também (caso novo funcionário)
          Promise.all([
            getFuncionarios({ is_active: true }),
            getFuncionarios({ is_active: false }),
          ])
            .then(([a, i]) => setAllEmployees([...a, ...i]))
            .catch(() => {})
        }}
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
