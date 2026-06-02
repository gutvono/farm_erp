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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { addProposta, updateProposta } from "@/services/compras"
import { Quotation, QuotationProposal, Supplier } from "@/types/index"

const proposalItemSchema = z.object({
  quotation_item_id: z.string(),
  unit_price: z.number({ error: "Informe o preço" }).min(0, "Preço >= 0"),
})

const schema = z
  .object({
    supplier_id: z.string().min(1, "Selecione um fornecedor"),
    notes: z.string().optional(),
    total_price: z.number().optional(),
    proposal_items: z.array(proposalItemSchema),
  })

type FormData = z.infer<typeof schema>

interface PropostaFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quotation: Quotation
  proposal?: QuotationProposal
  suppliers: Supplier[]
  onSuccess: () => void
}

export function PropostaForm({
  open,
  onOpenChange,
  quotation,
  proposal,
  suppliers,
  onSuccess,
}: PropostaFormProps) {
  const [loading, setLoading] = useState(false)
  const isEdit = Boolean(proposal)
  const isService = quotation.order_type === "servico"

  // Fornecedores disponíveis: em criação, remove os que já têm proposta
  const availableSuppliers = isEdit
    ? suppliers
    : suppliers.filter(
        (s) => !quotation.proposals.some((p) => p.supplier_id === s.id)
      )

  function buildDefaults(): FormData {
    return {
      supplier_id: proposal?.supplier_id ?? "",
      notes: proposal?.notes ?? "",
      total_price: proposal?.total_price ?? undefined,
      proposal_items: quotation.items.map((item) => {
        const existing = proposal?.proposal_items.find(
          (pi) => pi.quotation_item_id === item.id
        )
        return {
          quotation_item_id: item.id,
          unit_price: existing ? existing.unit_price : 0,
        }
      }),
    }
  }

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(),
  })

  const supplierId = watch("supplier_id")

  useEffect(() => {
    if (open) {
      reset(buildDefaults())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposal, quotation])

  async function onSubmit(data: FormData) {
    if (isService && (!data.total_price || data.total_price <= 0)) {
      toast.error("Informe o preço total do serviço")
      return
    }
    setLoading(true)
    try {
      if (isEdit && proposal) {
        await updateProposta(quotation.id, proposal.id, {
          notes: data.notes || undefined,
          total_price: isService ? data.total_price : undefined,
          proposal_items: isService
            ? undefined
            : data.proposal_items.map((pi) => ({
                quotation_item_id: pi.quotation_item_id,
                unit_price: pi.unit_price,
              })),
        })
        toast.success("Proposta atualizada com sucesso")
      } else {
        await addProposta(quotation.id, {
          supplier_id: data.supplier_id,
          notes: data.notes || undefined,
          total_price: isService ? data.total_price : undefined,
          proposal_items: isService
            ? []
            : data.proposal_items.map((pi) => ({
                quotation_item_id: pi.quotation_item_id,
                unit_price: pi.unit_price,
              })),
        })
        toast.success("Proposta adicionada com sucesso")
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar proposta")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Proposta" : "Adicionar Proposta"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1">
            <Label>Fornecedor *</Label>
            <Select
              value={supplierId}
              onValueChange={(v) => setValue("supplier_id", v)}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(isEdit && proposal
                  ? suppliers.filter((s) => s.id === proposal.supplier_id)
                  : availableSuppliers
                ).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.supplier_id && (
              <p className="text-xs text-red-500">{errors.supplier_id.message}</p>
            )}
          </div>

          {isService ? (
            <div className="space-y-1">
              <Label htmlFor="total_price">Preço Total (R$) *</Label>
              <Input
                id="total_price"
                type="number"
                step="0.01"
                min="0.01"
                {...register("total_price", { valueAsNumber: true })}
                placeholder="0.00"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Preços por item</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qtd Solicitada</TableHead>
                    <TableHead className="text-right">Preço Unit. (R$)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotation.items.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.stock_item_name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="text-right"
                          {...register(`proposal_items.${idx}.unit_price`, {
                            valueAsNumber: true,
                          })}
                        />
                        {errors.proposal_items?.[idx]?.unit_price && (
                          <p className="text-xs text-red-500 mt-1">
                            {errors.proposal_items[idx]?.unit_price?.message}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="proposta-notes">Observações</Label>
            <Input
              id="proposta-notes"
              {...register("notes")}
              placeholder="Informações adicionais..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : isEdit ? "Salvar alterações" : "Adicionar proposta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
