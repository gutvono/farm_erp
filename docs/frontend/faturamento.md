# Frontend Module: Faturamento

## Overview

Módulo de gerenciamento de faturas. Exibe faturas geradas automaticamente por vendas e permite criação manual de faturas avulsas. Permite atualizar status com confirmação via AlertDialog.

## Page

- `/faturamento` — Página única (sem Tabs). Filtro por status, contador "X faturas · total R$ Y", lista de FaturaCard, botão "Nova Fatura Manual".

## Components

### `FaturaCard`
Card expansível por fatura. Header: número, badge de status, nome do cliente, datas de emissão/vencimento, total. Expandido: tabela de itens com subtotal por linha. Status alterável via Select (disabled se paga/cancelada). Confirmação de pagamento e cancelamento via AlertDialog separados.

**Props:** `invoice: Invoice`, `onChanged: () => void`

### `FaturaManualForm`
Dialog com React Hook Form + Zod. Campos: cliente (Select), vencimento (date), observações. Items dinâmicos via `useFieldArray`: descrição, quantidade, preço unitário, subtotal calculado em tempo real. Total exibido no rodapé.

**Props:** `open`, `onOpenChange`, `clients: Client[]`, `onSuccess`

## Service (`services/faturamento.ts`)

```typescript
getFaturas(params?: { status?: InvoiceStatus; client_id?: string }): Promise<Invoice[]>
createFatura(data: { client_id; notes?; due_date?; items: [...] }): Promise<Invoice>
getFatura(id: string): Promise<Invoice>
updateFaturaStatus(id: string, status: InvoiceStatus): Promise<Invoice>
```

Campos Decimal do backend chegam como string — convertidos via `toNumber()` em Raw interfaces.

## Types (`types/index.ts`)

```typescript
type InvoiceStatus = "emitida" | "paga" | "cancelada"

interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  subtotal: number
}

interface Invoice {
  id: string
  number: string
  sale_id: string | null       // null = fatura manual
  client_id: string
  client_name: string
  status: InvoiceStatus
  total_amount: number
  issue_date: string
  due_date: string | null
  notes: string | null
  items: InvoiceItem[]
  created_at: string
  updated_at: string
}
```

## Status Flow

```
emitida → paga (irreversível, gera movimentação financeira)
emitida → cancelada (irreversível)
```

## Features

- Listagem com filtro por status (emitida/paga/cancelada)
- Badge de "Gerada automaticamente" quando `sale_id != null`
- Criação manual com itens dinâmicos e total em tempo real
- Atualização de status com AlertDialog de confirmação por transição
- Toast informativo na transição para "paga"
- Loading states em todas as ações assíncronas
