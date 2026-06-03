"use client"

import { useEffect, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Trash2 } from "lucide-react"
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
import { createOrdem, getFuncionariosEmProducao } from "@/services/pcp"
import { getFuncionarios } from "@/services/folha"
import { getFornecedores } from "@/services/compras"
import {
  Employee,
  Plot,
  ResourceAvailability,
  StockItem,
  Supplier,
} from "@/types/index"

const inputSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um insumo"),
  quantity: z.number().positive("Qtd > 0"),
})

const workerSchema = z.object({
  employee_id: z.string().min(1, "Selecione um funcionário"),
  is_responsible: z.boolean(),
})

const serviceSchema = z.object({
  supplier_id: z.string().min(1, "Selecione um fornecedor"),
  description: z.string().min(1, "Descrição obrigatória").max(500),
  amount: z.number().positive("Valor deve ser maior que zero"),
  due_date: z.string().min(1, "Data de vencimento obrigatória"),
})

const equipmentSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um equipamento"),
  quantity: z
    .number()
    .int("Apenas inteiros")
    .positive("Qtd > 0"),
})

const vehicleSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um veículo"),
  quantity: z
    .number()
    .int("Apenas inteiros")
    .positive("Qtd > 0"),
})

const packagingSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione uma embalagem"),
  quantity: z
    .number()
    .int("Apenas inteiros")
    .positive("Qtd > 0"),
})

const schema = z
  .object({
    plot_id: z.string().min(1, "Selecione um talhão"),
    planned_date: z.string().optional(),
    start_date: z.string().optional(),
    expected_end_date: z.string().optional(),
    notes: z.string().optional(),
    inputs: z.array(inputSchema).min(1, "Adicione pelo menos 1 insumo"),
    workers: z.array(workerSchema),
    services: z.array(serviceSchema),
    equipments: z.array(equipmentSchema),
    vehicles: z.array(vehicleSchema),
    packagings: z.array(packagingSchema),
  })
  .refine(
    (data) => data.workers.filter((w) => w.is_responsible).length <= 1,
    { message: "Apenas um funcionário pode ser o responsável", path: ["workers"] }
  )

type FormData = z.infer<typeof schema>

interface OrdemProducaoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plots: Plot[]
  insumos: StockItem[]
  equipamentos: StockItem[]
  veiculos: StockItem[]
  embalagens: StockItem[]
  equipamentosEmUso: ResourceAvailability[]
  veiculosEmUso: ResourceAvailability[]
  onSuccess: () => void
}

export function OrdemProducaoForm({
  open,
  onOpenChange,
  plots,
  insumos,
  equipamentos,
  veiculos,
  embalagens,
  equipamentosEmUso,
  veiculosEmUso,
  onSuccess,
}: OrdemProducaoFormProps) {
  const [loading, setLoading] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [employeesInProduction, setEmployeesInProduction] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      plot_id: "",
      planned_date: "",
      start_date: "",
      expected_end_date: "",
      notes: "",
      inputs: [{ stock_item_id: "", quantity: 0 }],
      workers: [],
      services: [],
      equipments: [],
      vehicles: [],
      packagings: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: "inputs" })
  const {
    fields: workerFields,
    append: appendWorker,
    remove: removeWorker,
  } = useFieldArray({ control, name: "workers" })
  const {
    fields: serviceFields,
    append: appendService,
    remove: removeService,
  } = useFieldArray({ control, name: "services" })
  const {
    fields: equipFields,
    append: appendEquip,
    remove: removeEquip,
  } = useFieldArray({ control, name: "equipments" })
  const {
    fields: vehFields,
    append: appendVeh,
    remove: removeVeh,
  } = useFieldArray({ control, name: "vehicles" })
  const {
    fields: pkgFields,
    append: appendPkg,
    remove: removePkg,
  } = useFieldArray({ control, name: "packagings" })

  const plotId = watch("plot_id")
  const watchedInputs = watch("inputs")

  useEffect(() => {
    if (open) {
      reset({
        plot_id: "",
        planned_date: "",
        start_date: "",
        expected_end_date: "",
        notes: "",
        inputs: [{ stock_item_id: "", quantity: 0 }],
        workers: [],
        services: [],
        equipments: [],
        vehicles: [],
        packagings: [],
      })
      getFuncionarios({ is_active: true }).then(setEmployees).catch(() => {})
      getFornecedores().then(setSuppliers).catch(() => {})
      getFuncionariosEmProducao().then(setEmployeesInProduction).catch(() => {})
    }
  }, [open, reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await createOrdem({
        plot_id: data.plot_id,
        planned_date: data.planned_date || undefined,
        start_date: data.start_date || undefined,
        expected_end_date: data.expected_end_date || undefined,
        notes: data.notes || undefined,
        inputs: data.inputs.map((inp) => ({
          stock_item_id: inp.stock_item_id,
          quantity: inp.quantity,
        })),
        workers: data.workers.map((w) => ({
          employee_id: w.employee_id,
          is_responsible: w.is_responsible,
        })),
        services: data.services.map((s) => ({
          supplier_id: s.supplier_id,
          description: s.description,
          amount: s.amount,
          due_date: s.due_date,
        })),
        equipments: data.equipments.map((eq) => ({
          stock_item_id: eq.stock_item_id,
          quantity: eq.quantity,
        })),
        vehicles: data.vehicles.map((vh) => ({
          stock_item_id: vh.stock_item_id,
          quantity: vh.quantity,
        })),
        packagings: data.packagings.map((pk) => ({
          stock_item_id: pk.stock_item_id,
          quantity: pk.quantity,
        })),
      })
      toast.success("Ordem de produção criada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar ordem de produção")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Produção</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Talhão */}
          <div className="space-y-1">
            <Label>Talhão *</Label>
            <Select value={plotId} onValueChange={(v) => setValue("plot_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o talhão" />
              </SelectTrigger>
              <SelectContent>
                {plots.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.capacity_sacas} sacas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.plot_id && (
              <p className="text-xs text-red-500">{errors.plot_id.message}</p>
            )}
          </div>

          {/* Datas */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="planned_date">Data Planejada</Label>
              <Input id="planned_date" type="date" {...register("planned_date")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="start_date">Data de Início</Label>
              <Input id="start_date" type="date" {...register("start_date")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expected_end_date">Término Previsto</Label>
              <Input id="expected_end_date" type="date" {...register("expected_end_date")} />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" {...register("notes")} placeholder="Observações sobre a safra..." />
          </div>

          {/* Insumos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Insumos *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ stock_item_id: "", quantity: 0 })}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar insumo
              </Button>
            </div>

            {errors.inputs && typeof errors.inputs.message === "string" && (
              <p className="text-xs text-red-500">{errors.inputs.message}</p>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-8 space-y-1">
                    {idx === 0 && <Label className="text-xs">Insumo</Label>}
                    <Select
                      value={watchedInputs[idx]?.stock_item_id ?? ""}
                      onValueChange={(v) => setValue(`inputs.${idx}.stock_item_id`, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o insumo" />
                      </SelectTrigger>
                      <SelectContent>
                        {insumos.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.quantity_on_hand} {s.unit} disp.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.inputs?.[idx]?.stock_item_id && (
                      <p className="text-xs text-red-500">
                        {errors.inputs[idx]?.stock_item_id?.message}
                      </p>
                    )}
                  </div>

                  <div className="col-span-3 space-y-1">
                    {idx === 0 && <Label className="text-xs">Quantidade</Label>}
                    <Input
                      type="number"
                      step="0.001"
                      {...register(`inputs.${idx}.quantity`, { valueAsNumber: true })}
                    />
                  </div>

                  <div className="col-span-1">
                    {idx === 0 && <div className="text-xs invisible">X</div>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length === 1}
                      onClick={() => remove(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Embalagens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Embalagens (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendPkg({ stock_item_id: "", quantity: 1 })}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar embalagem
              </Button>
            </div>

            <div className="space-y-2">
              {pkgFields.map((field, idx) => {
                const watchedPkgs = watch("packagings")
                const selectedInOtherRows = watchedPkgs
                  .filter((_, i) => i !== idx)
                  .map((p) => p.stock_item_id)
                  .filter(Boolean)
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-8 space-y-1">
                      {idx === 0 && <Label className="text-xs">Embalagem</Label>}
                      <Select
                        value={watchedPkgs[idx]?.stock_item_id ?? ""}
                        onValueChange={(v) =>
                          setValue(`packagings.${idx}.stock_item_id`, v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a embalagem" />
                        </SelectTrigger>
                        <SelectContent>
                          {embalagens.map((s) => {
                            const duplicated = selectedInOtherRows.includes(s.id)
                            return (
                              <SelectItem
                                key={s.id}
                                value={s.id}
                                disabled={duplicated}
                                className={duplicated ? "opacity-40 cursor-not-allowed" : ""}
                              >
                                {s.name} ({s.quantity_on_hand} {s.unit} disp.)
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      {errors.packagings?.[idx]?.stock_item_id && (
                        <p className="text-xs text-red-500">
                          {errors.packagings[idx]?.stock_item_id?.message}
                        </p>
                      )}
                    </div>

                    <div className="col-span-3 space-y-1">
                      {idx === 0 && <Label className="text-xs">Quantidade</Label>}
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        {...register(`packagings.${idx}.quantity`, { valueAsNumber: true })}
                      />
                      {errors.packagings?.[idx]?.quantity && (
                        <p className="text-xs text-red-500">
                          {errors.packagings[idx]?.quantity?.message}
                        </p>
                      )}
                    </div>

                    <div className="col-span-1">
                      {idx === 0 && <div className="text-xs invisible">X</div>}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePkg(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Equipamentos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Equipamentos (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendEquip({ stock_item_id: "", quantity: 1 })}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar equipamento
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Equipamentos são reservados (não consomem estoque) e ficam indisponíveis
              em outras ordens enquanto esta estiver ativa.
            </p>

            <div className="space-y-2">
              {equipFields.map((field, idx) => {
                const watchedEqs = watch("equipments")
                const selectedInOtherRows = watchedEqs
                  .filter((_, i) => i !== idx)
                  .map((e) => e.stock_item_id)
                  .filter(Boolean)
                const selectedId = watchedEqs[idx]?.stock_item_id
                const availability = selectedId
                  ? equipamentosEmUso.find((r) => r.stock_item_id === selectedId)
                  : undefined
                const requested = watchedEqs[idx]?.quantity ?? 0
                const exceedsAvailable =
                  availability && requested > availability.available
                const stockError = errors.equipments?.[idx]?.stock_item_id
                const quantityError = errors.equipments?.[idx]?.quantity

                return (
                  <div key={field.id} className="space-y-1">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-8 space-y-1">
                        {idx === 0 && <Label className="text-xs">Equipamento</Label>}
                        <Select
                          value={watchedEqs[idx]?.stock_item_id ?? ""}
                          onValueChange={(v) =>
                            setValue(`equipments.${idx}.stock_item_id`, v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o equipamento" />
                          </SelectTrigger>
                          <SelectContent>
                            {equipamentos.map((s) => {
                              const avail = equipamentosEmUso.find(
                                (r) => r.stock_item_id === s.id
                              )
                              const available = avail
                                ? avail.available
                                : Number(s.quantity_on_hand)
                              const total = avail ? avail.total : Number(s.quantity_on_hand)
                              const duplicated = selectedInOtherRows.includes(s.id)
                              const blocked = duplicated || available <= 0
                              return (
                                <SelectItem
                                  key={s.id}
                                  value={s.id}
                                  disabled={blocked}
                                  className={blocked ? "opacity-40 cursor-not-allowed" : ""}
                                >
                                  {s.name} ({available}/{total} disp.)
                                  {available === 0 && " — totalmente em uso"}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-3 space-y-1">
                        {idx === 0 && <Label className="text-xs">Quantidade</Label>}
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          {...register(`equipments.${idx}.quantity`, { valueAsNumber: true })}
                        />
                      </div>

                      <div className="col-span-1">
                        {idx === 0 && <div className="text-xs invisible">X</div>}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEquip(idx)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {(stockError || quantityError || exceedsAvailable) && (
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-8 space-y-1">
                          {stockError && (
                            <p className="text-xs text-red-500">{stockError.message}</p>
                          )}
                          {exceedsAvailable && (
                            <p className="text-xs text-red-500">
                              Apenas {availability!.available} disp., {availability!.committed} em uso em outras ordens
                            </p>
                          )}
                        </div>
                        <div className="col-span-3 space-y-1">
                          {quantityError && (
                            <p className="text-xs text-red-500">{quantityError.message}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Veículos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Veículos (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendVeh({ stock_item_id: "", quantity: 1 })}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar veículo
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Veículos são reservados (não consomem estoque) e ficam indisponíveis
              em outras ordens enquanto esta estiver ativa.
            </p>

            <div className="space-y-2">
              {vehFields.map((field, idx) => {
                const watchedVehs = watch("vehicles")
                const selectedInOtherRows = watchedVehs
                  .filter((_, i) => i !== idx)
                  .map((v) => v.stock_item_id)
                  .filter(Boolean)
                const selectedId = watchedVehs[idx]?.stock_item_id
                const availability = selectedId
                  ? veiculosEmUso.find((r) => r.stock_item_id === selectedId)
                  : undefined
                const requested = watchedVehs[idx]?.quantity ?? 0
                const exceedsAvailable =
                  availability && requested > availability.available
                const stockError = errors.vehicles?.[idx]?.stock_item_id
                const quantityError = errors.vehicles?.[idx]?.quantity

                return (
                  <div key={field.id} className="space-y-1">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-8 space-y-1">
                        {idx === 0 && <Label className="text-xs">Veículo</Label>}
                        <Select
                          value={watchedVehs[idx]?.stock_item_id ?? ""}
                          onValueChange={(v) =>
                            setValue(`vehicles.${idx}.stock_item_id`, v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o veículo" />
                          </SelectTrigger>
                          <SelectContent>
                            {veiculos.map((s) => {
                              const avail = veiculosEmUso.find(
                                (r) => r.stock_item_id === s.id
                              )
                              const available = avail
                                ? avail.available
                                : Number(s.quantity_on_hand)
                              const total = avail ? avail.total : Number(s.quantity_on_hand)
                              const duplicated = selectedInOtherRows.includes(s.id)
                              const blocked = duplicated || available <= 0
                              return (
                                <SelectItem
                                  key={s.id}
                                  value={s.id}
                                  disabled={blocked}
                                  className={blocked ? "opacity-40 cursor-not-allowed" : ""}
                                >
                                  {s.name} ({available}/{total} disp.)
                                  {available === 0 && " — totalmente em uso"}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-3 space-y-1">
                        {idx === 0 && <Label className="text-xs">Quantidade</Label>}
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          {...register(`vehicles.${idx}.quantity`, { valueAsNumber: true })}
                        />
                      </div>

                      <div className="col-span-1">
                        {idx === 0 && <div className="text-xs invisible">X</div>}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeVeh(idx)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {(stockError || quantityError || exceedsAvailable) && (
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-8 space-y-1">
                          {stockError && (
                            <p className="text-xs text-red-500">{stockError.message}</p>
                          )}
                          {exceedsAvailable && (
                            <p className="text-xs text-red-500">
                              Apenas {availability!.available} disp., {availability!.committed} em uso em outras ordens
                            </p>
                          )}
                        </div>
                        <div className="col-span-3 space-y-1">
                          {quantityError && (
                            <p className="text-xs text-red-500">{quantityError.message}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Equipe */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Equipe (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendWorker({ employee_id: "", is_responsible: false })}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar funcionário
              </Button>
            </div>

            {workerFields.map((field, idx) => {
              const watchedWorkers = watch("workers")
              // IDs já selecionados em outras linhas (para evitar duplicata)
              const selectedInOtherRows = watchedWorkers
                .filter((_, i) => i !== idx)
                .map((w) => w.employee_id)
                .filter(Boolean)

              return (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7">
                    <Select
                      value={watchedWorkers[idx]?.employee_id ?? ""}
                      onValueChange={(v) => setValue(`workers.${idx}.employee_id`, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o funcionário" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => {
                          const blocked =
                            employeesInProduction.includes(e.id) ||
                            selectedInOtherRows.includes(e.id)
                          return (
                            <SelectItem
                              key={e.id}
                              value={e.id}
                              disabled={blocked}
                              className={blocked ? "opacity-40 cursor-not-allowed" : ""}
                            >
                              {e.name}
                              {employeesInProduction.includes(e.id) && " (em produção)"}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {errors.workers?.[idx]?.employee_id && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.workers[idx]?.employee_id?.message}
                      </p>
                    )}
                  </div>

                  <div className="col-span-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`responsible-${idx}`}
                      checked={watchedWorkers[idx]?.is_responsible ?? false}
                      onChange={(e) => {
                        // Se marcar este como responsável, desmarca os outros
                        if (e.target.checked) {
                          workerFields.forEach((_, i) => {
                            if (i !== idx) setValue(`workers.${i}.is_responsible`, false)
                          })
                        }
                        setValue(`workers.${idx}.is_responsible`, e.target.checked)
                      }}
                      className="h-4 w-4"
                    />
                    <label htmlFor={`responsible-${idx}`} className="text-xs text-slate-600">
                      Responsável
                    </label>
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeWorker(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              )
            })}
            {errors.workers && typeof errors.workers.message === "string" && (
              <p className="text-xs text-red-500">{errors.workers.message}</p>
            )}
          </div>

          {/* Serviços Externos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Serviços Externos (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendService({ supplier_id: "", description: "", amount: 0, due_date: "" })
                }
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar serviço
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              A conta a pagar será gerada quando a produção for iniciada.
            </p>

            {serviceFields.map((field, idx) => {
              const watchedServices = watch("services")
              return (
                <div key={field.id} className="rounded-md border border-slate-200 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">Serviço {idx + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeService(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>

                  {/* Fornecedor */}
                  <div className="space-y-1">
                    <Label className="text-xs">Fornecedor *</Label>
                    <Select
                      value={watchedServices[idx]?.supplier_id ?? ""}
                      onValueChange={(v) => setValue(`services.${idx}.supplier_id`, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o fornecedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.services?.[idx]?.supplier_id && (
                      <p className="text-xs text-red-500">{errors.services[idx]?.supplier_id?.message}</p>
                    )}
                  </div>

                  {/* Descrição */}
                  <div className="space-y-1">
                    <Label className="text-xs">Descrição *</Label>
                    <Input
                      placeholder="Ex: Colheita manual — equipe externa"
                      {...register(`services.${idx}.description`)}
                    />
                    {errors.services?.[idx]?.description && (
                      <p className="text-xs text-red-500">{errors.services[idx]?.description?.message}</p>
                    )}
                  </div>

                  {/* Valor e Vencimento */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Valor (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        {...register(`services.${idx}.amount`, { valueAsNumber: true })}
                      />
                      {errors.services?.[idx]?.amount && (
                        <p className="text-xs text-red-500">{errors.services[idx]?.amount?.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vencimento *</Label>
                      <Input type="date" {...register(`services.${idx}.due_date`)} />
                      {errors.services?.[idx]?.due_date && (
                        <p className="text-xs text-red-500">{errors.services[idx]?.due_date?.message}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar ordem"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
