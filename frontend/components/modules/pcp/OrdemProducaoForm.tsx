"use client"

import { useEffect, useState } from "react"
import { Controller, useForm, useFieldArray } from "react-hook-form"
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
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createOrdem,
  getCargosDisponiveis,
  getInsumosDisponiveis,
  getRecursosDisponiveis,
} from "@/services/pcp"
import { getFornecedores } from "@/services/compras"
import {
  CargoDisponivel,
  Plot,
  ProductionOrder,
  ResourceAvailable,
  StockItem,
  Supplier,
} from "@/types/index"

const ACTIVE_STATUSES = ["planejada", "em_producao", "em_execucao", "pausada"]

const insumoSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione um insumo"),
  quantity: z.number({ message: "Qtd > 0" }).positive("Qtd > 0"),
})

const cargoReqSchema = z.object({
  position_id: z.string().min(1, "Selecione um cargo"),
  quantity: z
    .number({ message: "Qtd > 0" })
    .int("Inteiro")
    .positive("Qtd > 0"),
  contract_type: z.enum(["clt", "pj", "temporario"]),
})

const machineSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione"),
  // Horas como texto no form; convertida para número (ou omitida) no submit.
  hours: z.string().optional(),
})

const packagingSchema = z.object({
  stock_item_id: z.string().min(1, "Selecione"),
  quantity: z.number({ message: "Qtd > 0" }).positive("Qtd > 0"),
})

const serviceSchema = z.object({
  supplier_id: z.string().min(1, "Selecione um fornecedor"),
  description: z.string().min(1, "Descrição obrigatória").max(500),
  amount: z.number({ message: "Valor > 0" }).positive("Valor > 0"),
  due_date: z.string().min(1, "Vencimento obrigatório"),
})

const schema = z.object({
  plot_id: z.string().min(1, "Selecione um talhão"),
  hectares_used: z
    .number({ message: "Informe os hectares" })
    .positive("Hectares > 0"),
  planned_date: z.string().optional(),
  start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  notes: z.string().optional(),
  inputs: z.array(insumoSchema),
  position_requirements: z.array(cargoReqSchema),
  machines: z.array(machineSchema),
  vehicles: z.array(machineSchema),
  packagings: z.array(packagingSchema),
  services: z.array(serviceSchema),
})

type FormData = z.infer<typeof schema>

const EMPTY: FormData = {
  plot_id: "",
  hectares_used: undefined as unknown as number,
  planned_date: "",
  start_date: "",
  expected_end_date: "",
  notes: "",
  inputs: [],
  position_requirements: [],
  machines: [],
  vehicles: [],
  packagings: [],
  services: [],
}

interface OrdemProducaoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plots: Plot[]
  orders: ProductionOrder[]
  onSuccess: () => void
}

export function OrdemProducaoForm({
  open,
  onOpenChange,
  plots,
  orders,
  onSuccess,
}: OrdemProducaoFormProps) {
  const [loading, setLoading] = useState(false)
  const [insumos, setInsumos] = useState<StockItem[]>([])
  const [machines, setMachines] = useState<ResourceAvailable[]>([])
  const [vehicles, setVehicles] = useState<ResourceAvailable[]>([])
  const [packagings, setPackagings] = useState<ResourceAvailable[]>([])
  const [cargos, setCargos] = useState<CargoDisponivel[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: EMPTY })

  const inputsFA = useFieldArray({ control, name: "inputs" })
  const reqsFA = useFieldArray({ control, name: "position_requirements" })
  const machinesFA = useFieldArray({ control, name: "machines" })
  const vehiclesFA = useFieldArray({ control, name: "vehicles" })
  const packagingsFA = useFieldArray({ control, name: "packagings" })
  const servicesFA = useFieldArray({ control, name: "services" })

  const plotId = watch("plot_id")

  useEffect(() => {
    if (!open) return
    reset(EMPTY)
    getInsumosDisponiveis().then(setInsumos).catch(() => {})
    getRecursosDisponiveis("maquina").then(setMachines).catch(() => {})
    getRecursosDisponiveis("veiculo").then(setVehicles).catch(() => {})
    getRecursosDisponiveis("embalagem").then(setPackagings).catch(() => {})
    getCargosDisponiveis().then(setCargos).catch(() => {})
    getFornecedores().then(setSuppliers).catch(() => {})
  }, [open, reset])

  const selectedPlot = plots.find((p) => p.id === plotId)
  const usedByActive = orders
    .filter(
      (o) => o.plot_id === plotId && ACTIVE_STATUSES.includes(o.status)
    )
    .reduce((sum, o) => sum + o.hectares_used, 0)
  const availableHectares = selectedPlot
    ? selectedPlot.total_hectares - usedByActive
    : 0

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await createOrdem({
        plot_id: data.plot_id,
        hectares_used: data.hectares_used,
        planned_date: data.planned_date || undefined,
        start_date: data.start_date || undefined,
        expected_end_date: data.expected_end_date || undefined,
        notes: data.notes || undefined,
        inputs: data.inputs.map((i) => ({
          stock_item_id: i.stock_item_id,
          quantity: i.quantity,
        })),
        position_requirements: data.position_requirements.map((r) => ({
          position_id: r.position_id,
          quantity: r.quantity,
          contract_type: r.contract_type,
        })),
        resources: [
          ...data.machines.map((m) => ({
            stock_item_id: m.stock_item_id,
            resource_role: "maquina" as const,
            hours: m.hours && m.hours.trim() ? Number(m.hours) : undefined,
          })),
          ...data.vehicles.map((v) => ({
            stock_item_id: v.stock_item_id,
            resource_role: "veiculo" as const,
            hours: v.hours && v.hours.trim() ? Number(v.hours) : undefined,
          })),
          ...data.packagings.map((p) => ({
            stock_item_id: p.stock_item_id,
            resource_role: "embalagem" as const,
            quantity: p.quantity,
          })),
        ],
        services: data.services.map((s) => ({
          supplier_id: s.supplier_id,
          description: s.description,
          amount: s.amount,
          due_date: s.due_date,
        })),
      })
      toast.success("Ordem de produção criada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao criar ordem de produção"
      )
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
          {/* Talhão + hectares */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Talhão *</Label>
              <Select value={plotId} onValueChange={(v) => setValue("plot_id", v)}>
                <SelectTrigger aria-label="Talhão">
                  <SelectValue placeholder="Selecione o talhão" />
                </SelectTrigger>
                <SelectContent>
                  {plots.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.total_hectares} ha
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.plot_id && (
                <p className="text-xs text-red-500">{errors.plot_id.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="hectares_used">Hectares usados *</Label>
              <Input
                id="hectares_used"
                type="number"
                step="0.01"
                min="0.01"
                {...register("hectares_used", { valueAsNumber: true })}
              />
              {selectedPlot && (
                <p className="text-xs text-slate-500">
                  Disponível no talhão: {availableHectares.toFixed(2)} ha de{" "}
                  {selectedPlot.total_hectares} ha
                </p>
              )}
              {errors.hectares_used && (
                <p className="text-xs text-red-500">{errors.hectares_used.message}</p>
              )}
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="planned_date">Data Planejada</Label>
              <Controller
                control={control}
                name="planned_date"
                render={({ field }) => (
                  <DatePicker
                    id="planned_date"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="start_date">Data de Início</Label>
              <Controller
                control={control}
                name="start_date"
                render={({ field }) => (
                  <DatePicker
                    id="start_date"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expected_end_date">Término Previsto</Label>
              <Controller
                control={control}
                name="expected_end_date"
                render={({ field }) => (
                  <DatePicker
                    id="expected_end_date"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" {...register("notes")} placeholder="Observações sobre a safra..." />
          </div>

          {/* Insumos */}
          <Section
            title="Insumos"
            addLabel="Adicionar insumo"
            onAdd={() => inputsFA.append({ stock_item_id: "", quantity: 0 })}
          >
            {inputsFA.fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-8 space-y-1">
                  <Select
                    value={watch(`inputs.${idx}.stock_item_id`) ?? ""}
                    onValueChange={(v) => setValue(`inputs.${idx}.stock_item_id`, v)}
                  >
                    <SelectTrigger aria-label={`Insumo ${idx + 1}`}>
                      <SelectValue placeholder="Selecione o insumo" />
                    </SelectTrigger>
                    <SelectContent>
                      {insumos.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.sku} — {s.name} ({s.quantity_on_hand} {s.unit})
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
                  <Input
                    type="number"
                    step="0.001"
                    placeholder="Qtd"
                    {...register(`inputs.${idx}.quantity`, { valueAsNumber: true })}
                  />
                  {errors.inputs?.[idx]?.quantity && (
                    <p className="text-xs text-red-500">
                      {errors.inputs[idx]?.quantity?.message}
                    </p>
                  )}
                </div>
                <RemoveBtn onClick={() => inputsFA.remove(idx)} />
              </div>
            ))}
          </Section>

          {/* Equipe — requisitos por cargo */}
          <Section
            title="Equipe — requisitos por cargo"
            addLabel="Adicionar cargo"
            onAdd={() =>
              reqsFA.append({ position_id: "", quantity: 1, contract_type: "clt" })
            }
          >
            {reqsFA.fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-5 space-y-1">
                  <Select
                    value={watch(`position_requirements.${idx}.position_id`) ?? ""}
                    onValueChange={(v) =>
                      setValue(`position_requirements.${idx}.position_id`, v)
                    }
                  >
                    <SelectTrigger aria-label={`Cargo ${idx + 1}`}>
                      <SelectValue placeholder="Cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      {cargos.map((c) => (
                        <SelectItem key={c.position_id} value={c.position_id}>
                          {c.position_name} — {c.available_quantity} disponíve
                          {c.available_quantity === 1 ? "l" : "is"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.position_requirements?.[idx]?.position_id && (
                    <p className="text-xs text-red-500">
                      {errors.position_requirements[idx]?.position_id?.message}
                    </p>
                  )}
                </div>
                <div className="col-span-3 space-y-1">
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="Qtd"
                    {...register(`position_requirements.${idx}.quantity`, {
                      valueAsNumber: true,
                    })}
                  />
                  {errors.position_requirements?.[idx]?.quantity && (
                    <p className="text-xs text-red-500">
                      {errors.position_requirements[idx]?.quantity?.message}
                    </p>
                  )}
                  {(() => {
                    const c = cargos.find(
                      (x) =>
                        x.position_id ===
                        watch(`position_requirements.${idx}.position_id`)
                    )
                    const qty = watch(`position_requirements.${idx}.quantity`)
                    if (c && typeof qty === "number" && qty > c.available_quantity) {
                      return (
                        <p className="text-xs text-amber-600">
                          Planejado {qty}; há {c.available_quantity} disponíve
                          {c.available_quantity === 1 ? "l" : "is"} hoje — será
                          validado ao iniciar
                        </p>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="col-span-3 space-y-1">
                  <Select
                    value={watch(`position_requirements.${idx}.contract_type`) ?? "clt"}
                    onValueChange={(v) =>
                      setValue(
                        `position_requirements.${idx}.contract_type`,
                        v as FormData["position_requirements"][number]["contract_type"]
                      )
                    }
                  >
                    <SelectTrigger aria-label={`Vínculo ${idx + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clt">CLT</SelectItem>
                      <SelectItem value="pj">PJ</SelectItem>
                      <SelectItem value="temporario">Temporário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <RemoveBtn onClick={() => reqsFA.remove(idx)} />
              </div>
            ))}
          </Section>

          {/* Máquinas */}
          <Section
            title="Máquinas"
            addLabel="Adicionar máquina"
            onAdd={() => machinesFA.append({ stock_item_id: "", hours: "" })}
          >
            {machines.length === 0 && machinesFA.fields.length === 0 && (
              <p className="text-xs text-slate-400">Nenhuma máquina cadastrada</p>
            )}
            {machinesFA.fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-8 space-y-1">
                  <Select
                    value={watch(`machines.${idx}.stock_item_id`) ?? ""}
                    onValueChange={(v) => setValue(`machines.${idx}.stock_item_id`, v)}
                  >
                    <SelectTrigger aria-label={`Máquina ${idx + 1}`}>
                      <SelectValue placeholder="Selecione a máquina" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.sku} — {s.name} — {s.available_quantity} disponíve
                          {s.available_quantity === 1 ? "l" : "is"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.machines?.[idx]?.stock_item_id && (
                    <p className="text-xs text-red-500">
                      {errors.machines[idx]?.stock_item_id?.message}
                    </p>
                  )}
                  {(() => {
                    const m = machines.find(
                      (x) => x.id === watch(`machines.${idx}.stock_item_id`)
                    )
                    if (m && m.available_quantity < 1) {
                      return (
                        <p className="text-xs text-amber-600">
                          {m.available_quantity} disponíveis hoje — será validado ao iniciar
                        </p>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="col-span-3 space-y-1">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Horas (opcional)"
                    {...register(`machines.${idx}.hours`)}
                  />
                </div>
                <RemoveBtn onClick={() => machinesFA.remove(idx)} />
              </div>
            ))}
          </Section>

          {/* Veículos */}
          <Section
            title="Veículos"
            addLabel="Adicionar veículo"
            onAdd={() => vehiclesFA.append({ stock_item_id: "", hours: "" })}
          >
            {vehicles.length === 0 && vehiclesFA.fields.length === 0 && (
              <p className="text-xs text-slate-400">Nenhum veículo cadastrado</p>
            )}
            {vehiclesFA.fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-8 space-y-1">
                  <Select
                    value={watch(`vehicles.${idx}.stock_item_id`) ?? ""}
                    onValueChange={(v) => setValue(`vehicles.${idx}.stock_item_id`, v)}
                  >
                    <SelectTrigger aria-label={`Veículo ${idx + 1}`}>
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.sku} — {s.name} — {s.available_quantity} disponíve
                          {s.available_quantity === 1 ? "l" : "is"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.vehicles?.[idx]?.stock_item_id && (
                    <p className="text-xs text-red-500">
                      {errors.vehicles[idx]?.stock_item_id?.message}
                    </p>
                  )}
                  {(() => {
                    const v = vehicles.find(
                      (x) => x.id === watch(`vehicles.${idx}.stock_item_id`)
                    )
                    if (v && v.available_quantity < 1) {
                      return (
                        <p className="text-xs text-amber-600">
                          {v.available_quantity} disponíveis hoje — será validado ao iniciar
                        </p>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="col-span-3 space-y-1">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Horas (opcional)"
                    {...register(`vehicles.${idx}.hours`)}
                  />
                </div>
                <RemoveBtn onClick={() => vehiclesFA.remove(idx)} />
              </div>
            ))}
          </Section>

          {/* Embalagens */}
          <Section
            title="Embalagens"
            addLabel="Adicionar embalagem"
            onAdd={() => packagingsFA.append({ stock_item_id: "", quantity: 0 })}
          >
            {packagings.length === 0 && packagingsFA.fields.length === 0 && (
              <p className="text-xs text-slate-400">Nenhuma embalagem cadastrada</p>
            )}
            {packagingsFA.fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-8 space-y-1">
                  <Select
                    value={watch(`packagings.${idx}.stock_item_id`) ?? ""}
                    onValueChange={(v) => setValue(`packagings.${idx}.stock_item_id`, v)}
                  >
                    <SelectTrigger aria-label={`Embalagem ${idx + 1}`}>
                      <SelectValue placeholder="Selecione a embalagem" />
                    </SelectTrigger>
                    <SelectContent>
                      {packagings.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.sku} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.packagings?.[idx]?.stock_item_id && (
                    <p className="text-xs text-red-500">
                      {errors.packagings[idx]?.stock_item_id?.message}
                    </p>
                  )}
                </div>
                <div className="col-span-3 space-y-1">
                  <Input
                    type="number"
                    step="1"
                    placeholder="Qtd"
                    {...register(`packagings.${idx}.quantity`, { valueAsNumber: true })}
                  />
                  {errors.packagings?.[idx]?.quantity && (
                    <p className="text-xs text-red-500">
                      {errors.packagings[idx]?.quantity?.message}
                    </p>
                  )}
                </div>
                <RemoveBtn onClick={() => packagingsFA.remove(idx)} />
              </div>
            ))}
          </Section>

          {/* Serviços Externos */}
          <Section
            title="Serviços Externos"
            addLabel="Adicionar serviço"
            onAdd={() =>
              servicesFA.append({
                supplier_id: "",
                description: "",
                amount: 0,
                due_date: "",
              })
            }
          >
            <p className="text-xs text-slate-500">
              A conta a pagar será gerada quando a produção for iniciada.
            </p>
            {servicesFA.fields.map((field, idx) => (
              <div key={field.id} className="rounded-md border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Serviço {idx + 1}</span>
                  <RemoveBtn onClick={() => servicesFA.remove(idx)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fornecedor *</Label>
                  <Select
                    value={watch(`services.${idx}.supplier_id`) ?? ""}
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
                    <p className="text-xs text-red-500">
                      {errors.services[idx]?.supplier_id?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição *</Label>
                  <Input
                    placeholder="Ex: Colheita manual — equipe externa"
                    {...register(`services.${idx}.description`)}
                  />
                  {errors.services?.[idx]?.description && (
                    <p className="text-xs text-red-500">
                      {errors.services[idx]?.description?.message}
                    </p>
                  )}
                </div>
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
                      <p className="text-xs text-red-500">
                        {errors.services[idx]?.amount?.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vencimento *</Label>
                    <Controller
                      control={control}
                      name={`services.${idx}.due_date`}
                      render={({ field }) => (
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                    {errors.services?.[idx]?.due_date && (
                      <p className="text-xs text-red-500">
                        {errors.services[idx]?.due_date?.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </Section>

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

function Section({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string
  addLabel: string
  onAdd: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3 w-3 mr-1" /> {addLabel}
        </Button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <div className="col-span-1 flex justify-end">
      <Button type="button" variant="ghost" size="icon" onClick={onClick}>
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>
    </div>
  )
}
