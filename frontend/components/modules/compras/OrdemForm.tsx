"use client"

import { useEffect, useRef, useState } from "react"
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
import {
  createOrdem,
  getCatalogoFornecedor,
  getFornecedoresDoProduto,
} from "@/services/compras"
import { StockItem, Supplier, SupplierForStockItem } from "@/types/index"
import { formatCurrency } from "@/lib/utils"

/** Itens avariados não têm fornecedor — ficam fora dos dropdowns (decisão #1). */
function isAvariado(item: StockItem): boolean {
  return item.sku.endsWith("-AVARIADO")
}

interface ProdLine {
  key: string
  stockItemId: string
  /** Fornecedores que vendem o produto (preenchido enquanto o fornecedor da ordem não está fixado). */
  supplierOptions: SupplierForStockItem[]
  loadingSuppliers: boolean
  quantity: string
  unitPrice: string
}

interface OrdemFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: Supplier[]
  stockItems: StockItem[]
  onSuccess: () => void
}

export function OrdemForm({
  open,
  onOpenChange,
  suppliers,
  stockItems,
  onSuccess,
}: OrdemFormProps) {
  const lineCounter = useRef(0)
  const newLine = (): ProdLine => ({
    key: `line-${lineCounter.current++}`,
    stockItemId: "",
    supplierOptions: [],
    loadingSuppliers: false,
    quantity: "",
    unitPrice: "",
  })

  const [loading, setLoading] = useState(false)
  const [orderType, setOrderType] = useState<"produto" | "servico">("produto")
  const [notes, setNotes] = useState("")

  // Fornecedor da ordem (único). Em produto é fixado pelo 1º produto→fornecedor;
  // em serviço é escolhido diretamente.
  const [supplierId, setSupplierId] = useState("")
  const [supplierName, setSupplierName] = useState("")

  // Catálogo ativo do fornecedor fixado (restringe os produtos das demais linhas
  // e fornece o preço sugerido).
  const [catalogProductIds, setCatalogProductIds] = useState<Set<string>>(new Set())
  const [catalogPriceByProduct, setCatalogPriceByProduct] = useState<Map<string, number>>(
    new Map()
  )

  // Produto
  const [lines, setLines] = useState<ProdLine[]>([newLine()])
  const [shippingCost, setShippingCost] = useState("")

  // Serviço
  const [serviceDescription, setServiceDescription] = useState("")
  const [totalAmount, setTotalAmount] = useState("")

  useEffect(() => {
    if (open) {
      lineCounter.current = 0
      setOrderType("produto")
      setNotes("")
      setSupplierId("")
      setSupplierName("")
      setCatalogProductIds(new Set())
      setCatalogPriceByProduct(new Map())
      setLines([newLine()])
      setShippingCost("")
      setServiceDescription("")
      setTotalAmount("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const supplierFixed = supplierId !== "" && orderType === "produto"

  /** Carrega o catálogo ATIVO do fornecedor e devolve (ids, preços). */
  async function loadCatalog(
    supId: string
  ): Promise<{ ids: Set<string>; prices: Map<string, number> }> {
    const page = await getCatalogoFornecedor(supId, { page: 1, page_size: 100 })
    const active = page.items.filter((i) => i.is_active)
    const ids = new Set(active.map((i) => i.stock_item_id))
    const prices = new Map(active.map((i) => [i.stock_item_id, i.unit_price]))
    setCatalogProductIds(ids)
    setCatalogPriceByProduct(prices)
    return { ids, prices }
  }

  function updateLine(key: string, patch: Partial<ProdLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  async function handleProductChange(key: string, productId: string) {
    if (supplierFixed) {
      // Fornecedor já definido: produto vem do catálogo; preço sugerido editável.
      const suggested = catalogPriceByProduct.get(productId)
      updateLine(key, {
        stockItemId: productId,
        unitPrice: suggested !== undefined ? String(suggested) : "",
        supplierOptions: [],
      })
      return
    }
    // Fornecedor ainda não fixado: produto primeiro → carrega quem o vende.
    updateLine(key, {
      stockItemId: productId,
      unitPrice: "",
      loadingSuppliers: true,
      supplierOptions: [],
    })
    try {
      const options = await getFornecedoresDoProduto(productId)
      updateLine(key, { supplierOptions: options, loadingSuppliers: false })
      if (options.length === 0) {
        toast.error("Nenhum fornecedor cadastrado vende este item")
      }
    } catch (err) {
      updateLine(key, { loadingSuppliers: false })
      toast.error(err instanceof Error ? err.message : "Erro ao buscar fornecedores")
    }
  }

  async function handleSupplierSelect(key: string, option: SupplierForStockItem) {
    setSupplierId(option.supplier_id)
    setSupplierName(option.supplier_name)
    let catalog: { ids: Set<string>; prices: Map<string, number> }
    try {
      catalog = await loadCatalog(option.supplier_id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar catálogo do fornecedor")
      // Reverte o fornecedor para não travar o usuário num estado inconsistente.
      setSupplierId("")
      setSupplierName("")
      return
    }

    // Revalida todas as linhas contra o catálogo do fornecedor escolhido.
    let removed = 0
    setLines((prev) =>
      prev.map((l) => {
        if (l.key === key) {
          // Linha que fixou o fornecedor: preço sugerido = preço do catálogo.
          return { ...l, unitPrice: String(option.unit_price), supplierOptions: [] }
        }
        if (l.stockItemId && !catalog.ids.has(l.stockItemId)) {
          removed++
          return { ...l, stockItemId: "", unitPrice: "", supplierOptions: [] }
        }
        if (l.stockItemId && catalog.prices.has(l.stockItemId)) {
          return {
            ...l,
            unitPrice: String(catalog.prices.get(l.stockItemId)),
            supplierOptions: [],
          }
        }
        return { ...l, supplierOptions: [] }
      })
    )
    if (removed > 0) {
      toast.warning(
        `${removed} item(ns) removido(s) por não fazerem parte do catálogo de ${option.supplier_name}`
      )
    }
  }

  async function handleChangeSupplier() {
    // "Trocar fornecedor": libera os selects de fornecedor por linha de novo,
    // mantendo os produtos já escolhidos (serão revalidados ao escolher o novo).
    setSupplierId("")
    setSupplierName("")
    setCatalogProductIds(new Set())
    setCatalogPriceByProduct(new Map())
    // Recarrega as opções de fornecedor de cada linha que tem produto.
    const current = lines
    setLines((prev) =>
      prev.map((l) => (l.stockItemId ? { ...l, loadingSuppliers: true } : l))
    )
    await Promise.all(
      current.map(async (l) => {
        if (!l.stockItemId) return
        try {
          const options = await getFornecedoresDoProduto(l.stockItemId)
          updateLine(l.key, { supplierOptions: options, loadingSuppliers: false })
        } catch {
          updateLine(l.key, { loadingSuppliers: false })
        }
      })
    )
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  // Produtos disponíveis no dropdown de cada linha.
  const productOptions = stockItems.filter((s) => {
    if (isAvariado(s)) return false
    if (supplierFixed) return catalogProductIds.has(s.id)
    return true
  })

  const shipping = orderType === "produto" ? Number(shippingCost) || 0 : 0
  const itemsTotal = lines.reduce((acc, l) => {
    const q = Number(l.quantity) || 0
    const p = Number(l.unitPrice) || 0
    return acc + q * p
  }, 0)
  const total =
    orderType === "produto" ? itemsTotal + shipping : Number(totalAmount) || 0

  async function handleSubmit() {
    if (orderType === "servico") {
      if (!supplierId) {
        toast.error("Selecione um fornecedor")
        return
      }
      if (!serviceDescription.trim()) {
        toast.error("Descreva o serviço")
        return
      }
      const amount = Number(totalAmount)
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Informe o valor do serviço")
        return
      }
      setLoading(true)
      try {
        await createOrdem({
          supplier_id: supplierId,
          notes: notes || undefined,
          order_type: "servico",
          service_description: serviceDescription,
          total_amount: amount,
          items: [],
        })
        toast.success("Ordem de compra criada com sucesso")
        onSuccess()
        onOpenChange(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar ordem de compra")
      } finally {
        setLoading(false)
      }
      return
    }

    // Produto
    if (!supplierId) {
      toast.error("Escolha um produto e o fornecedor que o vende")
      return
    }
    const filled = lines.filter((l) => l.stockItemId)
    if (filled.length === 0) {
      toast.error("Adicione pelo menos 1 item")
      return
    }
    for (const l of filled) {
      const q = Number(l.quantity)
      if (!Number.isFinite(q) || q <= 0) {
        toast.error("Informe a quantidade de todos os itens")
        return
      }
      const p = Number(l.unitPrice)
      if (!Number.isFinite(p) || p < 0) {
        toast.error("Informe o preço de todos os itens")
        return
      }
    }
    setLoading(true)
    try {
      await createOrdem({
        supplier_id: supplierId,
        notes: notes || undefined,
        order_type: "produto",
        shipping_cost: shipping > 0 ? shipping : undefined,
        items: filled.map((l) => ({
          stock_item_id: l.stockItemId,
          quantity: Number(l.quantity),
          unit_price: Number(l.unitPrice),
        })),
      })
      toast.success("Ordem de compra criada com sucesso")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar ordem de compra")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Tipo de Ordem */}
          <div className="space-y-2">
            <Label>Tipo de Ordem</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderType("produto")
                  setSupplierId("")
                  setSupplierName("")
                  setLines([newLine()])
                }}
                className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  orderType === "produto"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Produto
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrderType("servico")
                  setSupplierId("")
                  setSupplierName("")
                  setShippingCost("")
                }}
                className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  orderType === "servico"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Serviço
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {orderType === "servico"
                ? "As condições de pagamento serão definidas na aprovação financeira."
                : "Escolha o produto primeiro; depois o fornecedor que o vende. A ordem tem um único fornecedor."}
            </p>
          </div>

          {orderType === "servico" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Fornecedor *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="service_description">Descrição do Serviço *</Label>
                <textarea
                  id="service_description"
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  rows={3}
                  placeholder="Descreva o serviço a ser realizado..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="total_amount">Valor do Serviço (R$) *</Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes-servico">Observações</Label>
                <Input
                  id="notes-servico"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informações adicionais..."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Itens *</Label>
                  {supplierFixed && (
                    <p className="text-xs text-slate-500">
                      Fornecedor: <strong>{supplierName}</strong>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {supplierFixed && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleChangeSupplier}
                    >
                      Trocar fornecedor
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar item
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {lines.map((line, idx) => {
                  const qty = Number(line.quantity) || 0
                  const price = Number(line.unitPrice) || 0
                  const lineTotal = qty * price
                  return (
                    <div key={line.key} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3 space-y-1">
                        {idx === 0 && <Label className="text-xs">Produto</Label>}
                        <Select
                          value={line.stockItemId}
                          onValueChange={(v) => handleProductChange(line.key, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {productOptions.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-3 space-y-1">
                        {idx === 0 && <Label className="text-xs">Fornecedor</Label>}
                        {supplierFixed ? (
                          <div className="h-9 flex items-center px-2 rounded-md border bg-slate-50 text-sm text-slate-600 truncate">
                            {supplierName}
                          </div>
                        ) : (
                          <Select
                            value=""
                            disabled={!line.stockItemId || line.loadingSuppliers}
                            onValueChange={(v) => {
                              const opt = line.supplierOptions.find(
                                (o) => o.supplier_id === v
                              )
                              if (opt) handleSupplierSelect(line.key, opt)
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  !line.stockItemId
                                    ? "Escolha o produto"
                                    : line.loadingSuppliers
                                      ? "Carregando..."
                                      : "Selecione"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {line.supplierOptions.map((o) => (
                                <SelectItem key={o.supplier_id} value={o.supplier_id}>
                                  {o.supplier_name} — {formatCurrency(o.unit_price)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div className="col-span-2 space-y-1">
                        {idx === 0 && <Label className="text-xs">Quantidade</Label>}
                        <Input
                          type="number"
                          step="0.001"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.key, { quantity: e.target.value })
                          }
                        />
                      </div>

                      <div className="col-span-2 space-y-1">
                        {idx === 0 && <Label className="text-xs">Preço Unit.</Label>}
                        <Input
                          type="number"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.key, { unitPrice: e.target.value })
                          }
                        />
                      </div>

                      <div className="col-span-1 space-y-1">
                        {idx === 0 && <Label className="text-xs">Subtotal</Label>}
                        <div className="h-9 flex items-center px-1 rounded-md border bg-slate-50 text-xs font-medium">
                          {formatCurrency(lineTotal)}
                        </div>
                      </div>

                      <div className="col-span-1">
                        {idx === 0 && <div className="text-xs invisible">X</div>}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={lines.length === 1}
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-1 pt-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="shipping_cost">Valor do Transporte (R$)</Label>
                  <span className="text-xs text-slate-500">
                    Gera uma NF de transporte separada
                  </span>
                </div>
                <Input
                  id="shipping_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes-produto">Observações</Label>
                <Input
                  id="notes-produto"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informações adicionais..."
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm font-semibold text-slate-700">
              Total:{" "}
              <span className="text-lg font-bold text-slate-900">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={loading}>
                {loading ? "Criando..." : "Criar ordem"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
