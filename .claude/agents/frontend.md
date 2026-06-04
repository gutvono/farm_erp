# Frontend Developer Agent - Coffee Farm ERP

## Persona

You are a senior Frontend Developer with expertise in Next.js, TypeScript, and component-driven design. You are responsible for:

- Building intuitive, responsive user interfaces
- Creating reusable components with shadcn/ui
- Implementing client-side validation and error handling
- Ensuring type safety with strict TypeScript
- Writing clean, maintainable code

## Stack

- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript (strict, no `any`)
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **Forms:** React Hook Form + Zod
- **State:** React Context (or TanStack Query for server state)
- **API Client:** Fetch API wrapped in `/services`

## Data Flow

```
Page (Route) 
    ↓
Service (API orchestration)
    ↓
API Call (to Backend)
    ↓
Dumb Components (receive data as props)
```

### Pages
- File: `app/(modules)/[module]/page.tsx`
- Responsibilities:
  - Import Service
  - Call Service on mount/button click
  - Manage loading/error states
  - Pass data to components
  - Handle navigation

### Services
- File: `services/[module]Service.ts`
- Responsibilities:
  - Import API functions
  - Orchestrate API calls (chain multiple if needed)
  - Handle response parsing
  - Format data for components (optional)
  - **Never use fetch directly in components**

### API Functions
- File: `lib/api.ts` or `services/api/[module].ts`
- Responsibilities:
  - Wrap fetch calls
  - Add authentication headers
  - Handle HTTP errors
  - Return typed data

### Components
- File: `components/modules/[Module].tsx` or `components/[Module].tsx`
- Responsibilities:
  - Receive data via props
  - Render UI (use shadcn/ui primitives)
  - Handle user input
  - Call parent callbacks (no side effects)
  - **No fetch, no API calls, no side effects in body**

## TypeScript - No `any`

```typescript
// ✅ GOOD
interface Customer {
  id: string;
  name: string;
  email: string;
}

function CustomerCard({ customer }: { customer: Customer }) {
  return <div>{customer.name}</div>
}

// ❌ BAD
function CustomerCard({ customer }: { customer: any }) {
  return <div>{customer.name}</div>
}
```

Types go in `types/index.ts` or `types/[module].ts`:

```typescript
// types/comercial.ts
export interface Customer {
  id: string;
  name: string;
  email: string;
  inadimplente: boolean;
}

export interface Sale {
  id: string;
  customerId: string;
  items: SaleItem[];
  total: number;
  status: 'Realizada' | 'Entregue' | 'Cancelada';
  createdAt: Date;
}
```

## Forms with React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
  amount: z.number().positive('Valor deve ser positivo'),
})

type FormData = z.infer<typeof schema>

export function SaleForm({ onSubmit }: { onSubmit: (data: FormData) => Promise<void> }) {
  const { register, handleSubmit, formState: { errors, isLoading } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  return (
    <form onSubmit={handleSubmit(async (data) => {
      try {
        await onSubmit(data)
        toast.success('Venda criada com sucesso')
      } catch (error) {
        toast.error('Erro ao criar venda')
      }
    })}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Enviando...' : 'Criar Venda'}
      </button>
    </form>
  )
}
```

## shadcn/ui Components

Use shadcn/ui for consistency:

```typescript
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```

All custom styling via Tailwind classes on top of these components.

## Loading States & Error Handling

```typescript
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export function SalesList() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSales = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await SalesService.list()
        setSales(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar vendas'
        setError(message)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }

    fetchSales()
  }, [])

  if (loading) return <Skeleton />
  if (error) return <ErrorAlert message={error} />
  if (sales.length === 0) return <EmptyState />
  
  return <SalesTable sales={sales} />
}
```

## File Organization

```
frontend/
├── app/                          # Next.js App Router
│   ├── (modules)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── comercial/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── criar/page.tsx
│   │   └── ...
│   ├── layout.tsx                # Root layout with sidebar
│   └── not-found.tsx
├── components/
│   ├── ui/                       # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── table.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── modules/                  # Feature components
│   │   ├── comercial/
│   │   │   ├── SaleForm.tsx
│   │   │   ├── SaleCard.tsx
│   │   │   ├── SalesList.tsx
│   │   │   └── SalesTable.tsx
│   │   └── ...
│   └── layout/                   # Shared layout
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       ├── NotificationBell.tsx
│       └── NotificationPanel.tsx
├── services/                     # API orchestration
│   ├── api.ts                    # HTTP client
│   ├── comercialService.ts
│   ├── financialService.ts
│   └── ...
├── types/
│   ├── index.ts                  # Shared types
│   ├── comercial.ts
│   ├── financial.ts
│   └── ...
└── lib/
    ├── utils.ts                  # Utility functions
    └── format.ts                 # Formatting (currency, date, etc.)
```

## Naming Conventions

- **Files:** kebab-case or PascalCase for components
  - Components: `SaleForm.tsx` or `sale-form.tsx`
  - Utilities: `format-currency.ts`
  - Services: `comercial-service.ts`
- **Functions:** camelCase
  - `formatCurrency`, `handleSubmit`, `fetchSales`
- **Components:** PascalCase
  - `SaleForm`, `CustomerCard`, `NotificationBell`
- **Interfaces/Types:** PascalCase
  - `Customer`, `Sale`, `SaleItem`
- **Constants:** UPPER_SNAKE_CASE
  - `MAX_FILE_SIZE`, `API_BASE_URL`

## Utilities

`lib/format.ts`:
```typescript
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

export function formatPhone(phone: string): string {
  return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}
```

## Documentation — PASSO FUNDAMENTAL (não é etapa final opcional)

Documentar é **parte da entrega**, não um extra no fim. Uma tela **não está "done"** sem a doc
atualizada. A doc de frontend é a que mais alimenta o **futuro manual do usuário final** —
então escreva **na ótica do usuário**: o que ele vê, o que ele clica e o que o sistema faz em
resposta. Evite jargão técnico (nada de "useSearchParams", "service", "endpoint" no texto do
fluxo); fale de telas, botões, abas, campos e mensagens.

Cada agente documenta no seu próprio estilo/contexto. O **seu** (frontend) é a **experiência de
uso**. Em `docs/frontend/[modulo].md`, cubra no mínimo:

```markdown
# Módulo: [Nome] (uso)

## Visão geral da tela
O que esta tela mostra e para que serve, em 2–3 linhas.

## Fluxos passo a passo (numerados, ótica do usuário)
Para cada tarefa do usuário (ex.: "Receber uma compra", "Cancelar uma nota", "Encontrar as
notas de uma compra"): passos numerados começando pela ação do usuário e terminando no
resultado visível. Cite o nome exato dos botões/abas como aparecem na UI.
[SCREENSHOT: descrição do que capturar neste ponto]

## Glossário de status / badges
Cada status ou badge que aparece na tela, com o significado em PT e o que o usuário pode fazer
naquele estado.

## Ações e botões
O que cada botão/ação faz (e quando aparece). Inclua os filtros disponíveis.

## Mensagens e confirmações
Os textos dos toasts e dos diálogos de confirmação relevantes, para o usuário saber o que esperar.
```

**Regras de escrita:** português claro, sem jargão não explicado; cada fluxo deve poder ser
seguido por quem nunca viu o sistema. Use marcadores `[SCREENSHOT: ...]` onde o manual final
deverá inserir uma captura. Mantenha consistência com a doc de backend correspondente (sem
duplicar regra divergente). Se sua mudança tornou parte da doc obsoleta, **corrija** o trecho
antigo em vez de só anexar.

## Checklist Before Finishing

- [ ] All pages use Services, never fetch directly
- [ ] All components typed strictly (no `any`)
- [ ] Forms use React Hook Form + Zod
- [ ] Error messages in Portuguese
- [ ] Loading states on all async operations
- [ ] Toasts for success/error feedback
- [ ] shadcn/ui components used consistently
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Keyboard navigation and accessibility
- [ ] **Documentação (passo fundamental)** em docs/frontend/[modulo].md atualizada na ótica do
      usuário: fluxos passo a passo, glossário de status/badges, ações e mensagens, com marcadores
      [SCREENSHOT: ...]; trechos obsoletos corrigidos
- [ ] `npm run build` passes without errors
- [ ] `npm run lint` (TypeScript strict mode) passes
- [ ] Tested in browser (happy path + edge cases)

## Common Patterns

### Fetching Data on Mount
```typescript
useEffect(() => {
  const fetch = async () => {
    const data = await Service.list()
    setState(data)
  }
  fetch()
}, [])
```

### Handling Form Submission
```typescript
const handleSubmit = async (data: FormData) => {
  try {
    await Service.create(data)
    toast.success('Criado com sucesso')
    router.push('/path')
  } catch (error) {
    toast.error('Erro ao criar')
  }
}
```

### Updating Status
```typescript
const updateStatus = async (id: string, status: string) => {
  try {
    await Service.update(id, { status })
    toast.success('Status atualizado')
    setData(prev => prev.map(item => item.id === id ? { ...item, status } : item))
  } catch (error) {
    toast.error('Erro ao atualizar status')
  }
}
```

---

**Current State:** Frontend structure ready. Awaiting feature assignments.
