"use client"

import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createFuncionario, getCargos, updateFuncionario } from "@/services/folha"
import { ContractType, Employee, JobPosition } from "@/types/index"

// ─── helpers ──────────────────────────────────────────────────────────────────

const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/
const CARGOS_PAGE_SIZE = 100

function formatCpf(digits: string): string {
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
}

function parseCurrency(v: string): number | undefined {
  if (!v || v.trim() === "") return undefined
  const n = parseFloat(v.replace(",", "."))
  return isNaN(n) ? undefined : n
}

// Converte o valor do input de salário: vazio → undefined (backend usa o do cargo);
// texto numérico → number.
function salaryFromInput(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

function terminationPlaceholder(contractType: ContractType | undefined): string {
  if (!contractType) return "Selecione o tipo de contrato primeiro"
  if (contractType === "clt") return "Padrão: 13º proporcional + FGTS + aviso prévio"
  return "Padrão: R$ 0,00 (sem encargos)"
}

// ─── schemas ──────────────────────────────────────────────────────────────────

// Kept as string so RHF input type matches the text field; converted to number in submit handler.
const terminationField = z
  .string()
  .optional()
  .refine(
    (v) => {
      if (!v || v.trim() === "") return true
      const n = parseCurrency(v)
      return n !== undefined && n >= 0
    },
    { message: "Valor deve ser >= 0" }
  )

// Salário base é OPCIONAL: quando vazio, o backend usa o salário do cargo. A
// conversão vazio→undefined / texto→número é feita via `setValueAs` no input, então
// aqui basta um número opcional (mantém input e output do schema iguais).
const baseFields = {
  name: z.string().min(1, "Nome é obrigatório"),
  position_id: z.string().min(1, "Cargo é obrigatório"),
  base_salary: z.number().min(0, "Salário deve ser >= 0").optional(),
  contract_type: z.enum(["clt", "pj", "temporario"], {
    error: "Tipo de contrato é obrigatório",
  }),
  admission_date: z.string().min(1, "Data de admissão é obrigatória"),
  termination_cost_override: terminationField,
  transport_voucher_cost: terminationField,
  meal_voucher_value: terminationField,
  pharmacy_voucher_value: terminationField,
  life_insurance_value: terminationField,
  dependents_count: z.number().int().min(0, "Dependentes deve ser >= 0"),
}

const createSchema = z.object({
  ...baseFields,
  cpf: z.string().regex(CPF_REGEX, "Formato esperado: 000.000.000-00"),
})

const editSchema = z.object(baseFields)

type CreateFormData = z.infer<typeof createSchema>
type EditFormData = z.infer<typeof editSchema>

// ─── component ────────────────────────────────────────────────────────────────

interface FuncionarioFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null
  onSuccess: () => void
}

export function FuncionarioForm({
  open,
  onOpenChange,
  employee,
  onSuccess,
}: FuncionarioFormProps) {
  const isEdit = !!employee
  const [loading, setLoading] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [cargos, setCargos] = useState<JobPosition[]>([])

  // Controlled display value for CPF (shows raw digits while typing, masked on blur)
  const [cpfDisplay, setCpfDisplay] = useState("")

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
  })

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  })

  const contractTypeCreate = createForm.watch("contract_type")
  const contractTypeEdit = editForm.watch("contract_type")
  const positionCreate = createForm.watch("position_id")
  const positionEdit = editForm.watch("position_id")

  // Carrega os cargos disponíveis para o dropdown ao abrir o formulário. Busca uma
  // página grande (a listagem já exclui cargos removidos via soft delete).
  useEffect(() => {
    if (!open) return
    getCargos({ page: 1, page_size: CARGOS_PAGE_SIZE, order_by: "name", order_dir: "asc" })
      .then((res) => setCargos(res.items))
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    setPhotoFile(null)
    setPhotoError(null)
    if (employee) {
      editForm.reset({
        name: employee.name,
        position_id: employee.position_id,
        base_salary: employee.base_salary,
        contract_type: employee.contract_type,
        admission_date: employee.admission_date,
        termination_cost_override:
          employee.termination_cost_override != null
            ? String(employee.termination_cost_override)
            : "",
        transport_voucher_cost:
          employee.transport_voucher_cost != null
            ? String(employee.transport_voucher_cost)
            : "",
        meal_voucher_value:
          employee.meal_voucher_value != null
            ? String(employee.meal_voucher_value)
            : "",
        pharmacy_voucher_value:
          employee.pharmacy_voucher_value != null
            ? String(employee.pharmacy_voucher_value)
            : "",
        life_insurance_value:
          employee.life_insurance_value != null
            ? String(employee.life_insurance_value)
            : "",
        dependents_count: employee.dependents_count ?? 0,
      })
    } else {
      setCpfDisplay("")
      createForm.reset({
        name: "",
        cpf: "",
        position_id: "",
        base_salary: undefined,
        contract_type: undefined,
        admission_date: "",
        termination_cost_override: "",
        transport_voucher_cost: "",
        meal_voucher_value: "",
        pharmacy_voucher_value: "",
        life_insurance_value: "",
        dependents_count: 0,
      })
    }
  }, [open, employee, createForm, editForm])

  // Ao escolher um cargo, prefilla o salário base com o sugerido pelo cargo. O
  // campo permanece editável — o usuário pode sobrescrever.
  function handleSelectCargoCreate(positionId: string) {
    createForm.setValue("position_id", positionId, { shouldValidate: true })
    const cargo = cargos.find((c) => c.id === positionId)
    if (cargo) createForm.setValue("base_salary", cargo.base_salary)
  }

  function handleSelectCargoEdit(positionId: string) {
    editForm.setValue("position_id", positionId, { shouldValidate: true })
    const cargo = cargos.find((c) => c.id === positionId)
    if (cargo) editForm.setValue("base_salary", cargo.base_salary)
  }

  // ── CPF handlers ────────────────────────────────────────────────────────────

  const { ref: cpfRef, ...cpfFieldProps } = createForm.register("cpf")

  function handleCpfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 11)
    setCpfDisplay(digits)
    createForm.setValue("cpf", digits, { shouldValidate: false })
  }

  function handleCpfBlur() {
    if (cpfDisplay.replace(/\D/g, "").length === 11) {
      const formatted = formatCpf(cpfDisplay.replace(/\D/g, ""))
      setCpfDisplay(formatted)
      createForm.setValue("cpf", formatted, { shouldValidate: true })
    } else {
      createForm.setValue("cpf", cpfDisplay, { shouldValidate: true })
    }
  }

  // ── photo handler ───────────────────────────────────────────────────────────

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setPhotoError(null)
    if (file && !["image/jpeg", "image/png"].includes(file.type)) {
      setPhotoError("Apenas JPEG ou PNG são aceitos")
      setPhotoFile(null)
      e.target.value = ""
      return
    }
    setPhotoFile(file)
  }

  // ── submit handlers ─────────────────────────────────────────────────────────

  async function submitCreate(data: CreateFormData) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("name", data.name)
      formData.append("cpf", data.cpf)
      formData.append("position_id", data.position_id)
      // base_salary é opcional: só anexamos quando informado (senão o backend usa
      // o salário do cargo).
      if (data.base_salary !== undefined) {
        formData.append("base_salary", String(data.base_salary))
      }
      formData.append("contract_type", data.contract_type)
      formData.append("admission_date", data.admission_date)
      const terminationCost = parseCurrency(data.termination_cost_override ?? "")
      if (terminationCost !== undefined) {
        formData.append("termination_cost_override", String(terminationCost))
      }
      const transportVoucherCost = parseCurrency(data.transport_voucher_cost ?? "")
      if (transportVoucherCost !== undefined) {
        formData.append("transport_voucher_cost", String(transportVoucherCost))
      }
      const mealVoucherValue = parseCurrency(data.meal_voucher_value ?? "")
      if (mealVoucherValue !== undefined) {
        formData.append("meal_voucher_value", String(mealVoucherValue))
      }
      const pharmacyVoucherValue = parseCurrency(data.pharmacy_voucher_value ?? "")
      if (pharmacyVoucherValue !== undefined) {
        formData.append("pharmacy_voucher_value", String(pharmacyVoucherValue))
      }
      const lifeInsuranceValue = parseCurrency(data.life_insurance_value ?? "")
      if (lifeInsuranceValue !== undefined) {
        formData.append("life_insurance_value", String(lifeInsuranceValue))
      }
      formData.append("dependents_count", String(data.dependents_count))
      if (photoFile) {
        formData.append("photo_file", photoFile)
      }

      await createFuncionario(formData)
      toast.success("Funcionário cadastrado com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar funcionário")
    } finally {
      setLoading(false)
    }
  }

  async function submitEdit(data: EditFormData) {
    if (!employee) return
    setLoading(true)
    try {
      await updateFuncionario(employee.id, {
        name: data.name,
        position_id: data.position_id,
        base_salary: data.base_salary,
        contract_type: data.contract_type,
        admission_date: data.admission_date,
        termination_cost_override: parseCurrency(data.termination_cost_override ?? ""),
        transport_voucher_cost: parseCurrency(data.transport_voucher_cost ?? ""),
        meal_voucher_value: parseCurrency(data.meal_voucher_value ?? ""),
        pharmacy_voucher_value: parseCurrency(data.pharmacy_voucher_value ?? ""),
        life_insurance_value: parseCurrency(data.life_insurance_value ?? ""),
        dependents_count: data.dependents_count,
      })
      toast.success("Funcionário atualizado com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar funcionário")
    } finally {
      setLoading(false)
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar Funcionário" : "Novo Funcionário"}
          </DialogTitle>
        </DialogHeader>

        {isEdit ? (
          <form onSubmit={editForm.handleSubmit(submitEdit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input id="edit-name" {...editForm.register("name")} />
              {editForm.formState.errors.name && (
                <p className="text-xs text-red-500">
                  {editForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Cargo *</Label>
                <Select value={positionEdit ?? ""} onValueChange={handleSelectCargoEdit}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editForm.formState.errors.position_id && (
                  <p className="text-xs text-red-500">
                    {editForm.formState.errors.position_id.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-base_salary">Salário base</Label>
                <Input
                  id="edit-base_salary"
                  type="number"
                  step="0.01"
                  {...editForm.register("base_salary", { setValueAs: salaryFromInput })}
                />
                {editForm.formState.errors.base_salary && (
                  <p className="text-xs text-red-500">
                    {editForm.formState.errors.base_salary.message}
                  </p>
                )}
                <p className="text-xs text-slate-400">Sugerido pelo cargo; pode ajustar</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo de contrato *</Label>
                <Select
                  value={contractTypeEdit}
                  onValueChange={(v) =>
                    editForm.setValue("contract_type", v as ContractType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">CLT</SelectItem>
                    <SelectItem value="pj">PJ</SelectItem>
                    <SelectItem value="temporario">Temporário</SelectItem>
                  </SelectContent>
                </Select>
                {editForm.formState.errors.contract_type && (
                  <p className="text-xs text-red-500">
                    {editForm.formState.errors.contract_type.message}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-admission_date">Data de admissão *</Label>
                <Controller
                  control={editForm.control}
                  name="admission_date"
                  render={({ field }) => (
                    <DatePicker
                      id="edit-admission_date"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {editForm.formState.errors.admission_date && (
                  <p className="text-xs text-red-500">
                    {editForm.formState.errors.admission_date.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-termination_cost_override">
                Custo de demissão{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
              </Label>
              <Input
                id="edit-termination_cost_override"
                type="text"
                inputMode="decimal"
                placeholder={terminationPlaceholder(contractTypeEdit)}
                {...editForm.register("termination_cost_override")}
              />
              <p className="text-xs text-slate-400">
                Sobrescreve o padrão do contrato
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-transport_voucher_cost">Vale transporte</Label>
                <Input
                  id="edit-transport_voucher_cost"
                  type="text"
                  inputMode="decimal"
                  placeholder="Custo mensal real"
                  {...editForm.register("transport_voucher_cost")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-meal_voucher_value">Vale refeição</Label>
                <Input
                  id="edit-meal_voucher_value"
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor mensal"
                  {...editForm.register("meal_voucher_value")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-pharmacy_voucher_value">Vale farmácia</Label>
                <Input
                  id="edit-pharmacy_voucher_value"
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor mensal"
                  {...editForm.register("pharmacy_voucher_value")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-life_insurance_value">Seguro de vida</Label>
                <Input
                  id="edit-life_insurance_value"
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor mensal"
                  {...editForm.register("life_insurance_value")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-dependents_count">Dependentes</Label>
                <Input
                  id="edit-dependents_count"
                  type="number"
                  min="0"
                  step="1"
                  {...editForm.register("dependents_count", { valueAsNumber: true })}
                />
                {editForm.formState.errors.dependents_count && (
                  <p className="text-xs text-red-500">
                    {editForm.formState.errors.dependents_count.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={createForm.handleSubmit(submitCreate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" {...createForm.register("name")} />
                {createForm.formState.errors.name && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  ref={cpfRef}
                  value={cpfDisplay}
                  onChange={handleCpfChange}
                  onBlur={handleCpfBlur}
                  placeholder="00000000000"
                  inputMode="numeric"
                  maxLength={14}
                  autoComplete="off"
                  {...{ name: cpfFieldProps.name }}
                />
                {createForm.formState.errors.cpf && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.cpf.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Cargo *</Label>
                <Select value={positionCreate ?? ""} onValueChange={handleSelectCargoCreate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createForm.formState.errors.position_id && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.position_id.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="base_salary">Salário base</Label>
                <Input
                  id="base_salary"
                  type="number"
                  step="0.01"
                  placeholder="Sugerido pelo cargo"
                  {...createForm.register("base_salary", { setValueAs: salaryFromInput })}
                />
                {createForm.formState.errors.base_salary && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.base_salary.message}
                  </p>
                )}
                <p className="text-xs text-slate-400">
                  Preenchido pelo cargo; pode sobrescrever
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo de contrato *</Label>
                <Select
                  value={contractTypeCreate}
                  onValueChange={(v) =>
                    createForm.setValue("contract_type", v as ContractType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">CLT</SelectItem>
                    <SelectItem value="pj">PJ</SelectItem>
                    <SelectItem value="temporario">Temporário</SelectItem>
                  </SelectContent>
                </Select>
                {createForm.formState.errors.contract_type && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.contract_type.message}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="admission_date">Data de admissão *</Label>
                <Controller
                  control={createForm.control}
                  name="admission_date"
                  render={({ field }) => (
                    <DatePicker
                      id="admission_date"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {createForm.formState.errors.admission_date && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.admission_date.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="termination_cost_override">
                Custo de demissão{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
              </Label>
              <Input
                id="termination_cost_override"
                type="text"
                inputMode="decimal"
                placeholder={terminationPlaceholder(contractTypeCreate)}
                {...createForm.register("termination_cost_override")}
              />
              <p className="text-xs text-slate-400">
                Sobrescreve o padrão do contrato
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="transport_voucher_cost">Vale transporte</Label>
                <Input
                  id="transport_voucher_cost"
                  type="text"
                  inputMode="decimal"
                  placeholder="Custo mensal real"
                  {...createForm.register("transport_voucher_cost")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="meal_voucher_value">Vale refeição</Label>
                <Input
                  id="meal_voucher_value"
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor mensal"
                  {...createForm.register("meal_voucher_value")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pharmacy_voucher_value">Vale farmácia</Label>
                <Input
                  id="pharmacy_voucher_value"
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor mensal"
                  {...createForm.register("pharmacy_voucher_value")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="life_insurance_value">Seguro de vida</Label>
                <Input
                  id="life_insurance_value"
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor mensal"
                  {...createForm.register("life_insurance_value")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dependents_count">Dependentes</Label>
                <Input
                  id="dependents_count"
                  type="number"
                  min="0"
                  step="1"
                  {...createForm.register("dependents_count", { valueAsNumber: true })}
                />
                {createForm.formState.errors.dependents_count && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.dependents_count.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="photo_file">Foto (opcional)</Label>
              <Input
                id="photo_file"
                type="file"
                accept="image/jpeg,image/png"
                onChange={handlePhotoChange}
              />
              {photoError && <p className="text-xs text-red-500">{photoError}</p>}
              {photoFile && (
                <p className="text-xs text-slate-500">
                  Selecionada: {photoFile.name}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Cadastrando..." : "Cadastrar funcionário"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
