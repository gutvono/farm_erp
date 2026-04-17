# Frontend Module: PCP (Planejamento e Controle de Produção)

## Overview

Módulo de gestão de talhões, atividades agrícolas e ordens de produção de safra. Ao produzir uma safra, baixa insumos do estoque, simula qualidades (Especial/Superior/Tradicional) e insere o café produzido no estoque.

## Page

- `/pcp` — 3 abas: Ordens de Produção, Talhões, Atividades.

## Components

### `TalhaoForm`
Dialog de criação/edição de talhão. Campos: nome, variedade, capacidade (sacas), localização, observações. Detecta modo edição por prop `plot`.

**Props:** `open`, `onOpenChange`, `plot?: Plot | null`, `onSuccess`

### `TalhaoCard`
Card com nome, variedade, capacidade, localização. Botões editar (callback) e excluir (AlertDialog). Botão "Ver Atividades" abre Sheet lateral e carrega `getAtividades(plot.id)`.

**Props:** `plot: Plot`, `onEdit: () => void`, `onDeleted: () => void`

### `AtividadeForm`
Dialog de registro de atividade. Campos: talhão (Select), tipo de atividade (plantio/adubacao/poda/colheita/irrigacao/outra), data, mão de obra (interna/externa), custo, detalhes. Zod v4: `z.enum([...], { error: "..." })`.

**Props:** `open`, `onOpenChange`, `plots: Plot[]`, `defaultPlotId?: string`, `onSuccess`

### `OrdemProducaoForm`
Dialog de criação de ordem. Campos: talhão (Select), data planejada, observações. Insumos dinâmicos via `useFieldArray` (stock_item_id + quantity). Exibe estoque disponível por insumo.

**Props:** `open`, `onOpenChange`, `plots: Plot[]`, `insumos: StockItem[]`, `onSuccess`

> Nota: `insumos` é filtrado na página pai com `getItens({ category: "insumo" })`.

### `OrdemProducaoCard`
Card expansível por ordem. Header: nome do talhão, badge de status colorido (amarelo/azul/verde/cinza), data planejada. Expandido: lista de insumos, resultado de produção com cards de qualidade e barra proporcional (quando concluída). Botão "🌱 Produzir Safra" visível apenas se `planejada`, com AlertDialog de confirmação. Botão excluir apenas se `planejada`. Após produção, exibe `ResultadoSafraDialog`.

**Toast de sucesso:** `"Safra produzida! X sacas totais (Especial: A, Superior: B, Tradicional: C)"`

**Props:** `order: ProductionOrder`, `onDeleted: () => void`, `onProduced: () => void`

### `ResultadoSafraDialog`
Dialog com resultado visual: total em destaque, 3 cards de qualidade (amber/green/slate), barra proporcional colorida, lista de insumos consumidos, alerta vermelho se algum item ficou abaixo do mínimo.

**Props:** `open`, `onOpenChange`, `result: ProductionResult | null`

## Service (`services/pcp.ts`)

```typescript
getTalhoes(): Promise<Plot[]>
createTalhao(data: { name; location?; variety; capacity_sacas; notes? }): Promise<Plot>
updateTalhao(id, data): Promise<Plot>
deleteTalhao(id): Promise<void>

getAtividades(plot_id?: string): Promise<PlotActivity[]>
createAtividade(data: { plot_id; activity_type; activity_date; labor_type; cost; details? }): Promise<PlotActivity>

getOrdens(status?: string): Promise<ProductionOrder[]>
createOrdem(data: { plot_id; planned_date; notes?; inputs: [{ stock_item_id; quantity }] }): Promise<ProductionOrder>
produzirSafra(id: string): Promise<ProductionResult>
deleteOrdem(id: string): Promise<void>
```

Campos Decimal convertidos via `toNumber()` em Raw interfaces.

## Types (`types/index.ts`)

```typescript
type ActivityType = "plantio" | "adubacao" | "poda" | "colheita" | "irrigacao" | "outra"
type LaborType = "interna" | "externa"
type ProductionOrderStatus = "planejada" | "em_producao" | "concluida" | "cancelada"

interface Plot {
  id: string; name: string; location: string | null
  variety: string; capacity_sacas: number; notes: string | null
  created_at: string; updated_at: string
}

interface PlotActivity {
  id: string; plot_id: string; plot_name?: string
  activity_type: ActivityType; activity_date: string
  labor_type: LaborType; cost: number; details: string | null
  created_at: string; updated_at: string
}

interface ProductionInput {
  id: string; stock_item_id: string; stock_item_name: string
  unit: string; quantity: number; unit_cost: number; subtotal: number
}

interface ProductionOrder {
  id: string; plot_id: string; plot_name: string
  status: ProductionOrderStatus; planned_date: string | null
  executed_at: string | null
  total_sacas: number; especial_sacas: number
  superior_sacas: number; tradicional_sacas: number
  total_cost: number; notes: string | null
  inputs: ProductionInput[]
  created_at: string; updated_at: string
}

interface ProductionResult {
  order_id: string
  total_sacas: number; especial_sacas: number
  superior_sacas: number; tradicional_sacas: number
  inputs_consumed: ProductionInput[]
  items_below_minimum: string[]
  executed_at: string
}
```

## Status Flow (Ordens)

```
planejada → concluida (via "Produzir Safra")
planejada → cancelada (via backend)
```

Excluir: apenas se `planejada`.

## Features

- CRUD completo de talhões com Sheet de histórico de atividades
- Registro de atividades com tipo, mão de obra, custo e detalhes
- Filtro de atividades por talhão
- Ordens de produção com insumos dinâmicos
- Produção de safra com distribuição aleatória de qualidades
- Dialog visual de resultado com barra de proporção
- Alerta se insumo ficar abaixo do mínimo após produção
- Insumos carregados com `category: "insumo"` do módulo Estoque
