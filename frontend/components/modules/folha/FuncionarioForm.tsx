"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createFuncionario, updateFuncionario } from "@/services/folha"
import { ContractType, Employee } from "@/types/index"

// ─── helpers ──────────────────────────────────────────────────────────────────

const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/

function formatCpf(digits: string): string {
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
}

function parseCurrency(v: string): number | undefined {
  if (!v || v.trim() === "") return undefined
  const n = parseFloat(v.replace(",", "."))
  return isNaN(n) ? undefined : n
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

const baseFields = {
  name: z.string().min(1, "Nome é obrigatório"),
  role: z.string().min(1, "Cargo é obrigatório"),
  base_salary: z.number().positive("Salário deve ser > 0"),
  contract_type: z.enum(["clt", "pj", "temporario"], {
    error: "Tipo de contrato é obrigatório",
  }),
  admission_date: z.string().min(1, "Data de admissão é obrigatória"),
  termination_cost_override: terminationField,
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

  useEffect(() => {
    if (!open) return
    setPhotoFile(null)
    setPhotoError(null)
    if (employee) {
      editForm.reset({
        name: employee.name,
        role: employee.role,
        base_salary: employee.base_salary,
        contract_type: employee.contract_type,
        admission_date: employee.admission_date,
        termination_cost_override:
          employee.termination_cost_override != null
            ? String(employee.termination_cost_override)
            : "",
      })
    } else {
      setCpfDisplay("")
      createForm.reset({
        name: "",
        cpf: "",
        role: "",
        base_salary: 0,
        contract_type: undefined,
        admission_date: "",
        termination_cost_override: "",
      })
    }
  }, [open, employee, createForm, editForm])

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
      formData.append("role", data.role)
      formData.append("base_salary", String(data.base_salary))
      formData.append("contract_type", data.contract_type)
      formData.append("admission_date", data.admission_date)
      const terminationCost = parseCurrency(data.termination_cost_override ?? "")
      if (terminationCost !== undefined) {
        formData.append("termination_cost_override", String(terminationCost))
      }
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
        role: data.role,
        base_salary: data.base_salary,
        contract_type: data.contract_type,
        admission_date: data.admission_date,
        termination_cost_override: parseCurrency(data.termination_cost_override ?? ""),
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
                <Label htmlFor="edit-role">Cargo *</Label>
                <Input id="edit-role" {...editForm.register("role")} />
                {editForm.formState.errors.role && (
                  <p className="text-xs text-red-500">
                    {editForm.formState.errors.role.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-base_salary">Salário base *</Label>
                <Input
                  id="edit-base_salary"
                  type="number"
                  step="0.01"
                  {...editForm.register("base_salary", { valueAsNumber: true })}
                />
                {editForm.formState.errors.base_salary && (
                  <p className="text-xs text-red-500">
                    {editForm.formState.errors.base_salary.message}
                  </p>
                )}
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
                <Input
                  id="edit-admission_date"
                  type="date"
                  {...editForm.register("admission_date")}
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
                <Label htmlFor="role">Cargo *</Label>
                <Input id="role" {...createForm.register("role")} />
                {createForm.formState.errors.role && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.role.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="base_salary">Salário base *</Label>
                <Input
                  id="base_salary"
                  type="number"
                  step="0.01"
                  {...createForm.register("base_salary", { valueAsNumber: true })}
                />
                {createForm.formState.errors.base_salary && (
                  <p className="text-xs text-red-500">
                    {createForm.formState.errors.base_salary.message}
                  </p>
                )}
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
                <Input
                  id="admission_date"
                  type="date"
                  {...createForm.register("admission_date")}
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
