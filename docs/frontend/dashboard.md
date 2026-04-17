# Frontend Module: Dashboard

## Visão Geral

Página principal do sistema que exibe KPIs consolidados e gráfico de fluxo de caixa. Busca dados via `getDashboard()` ao montar e oferece botão de atualização manual.

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/dashboard/page.tsx` | Page | Página principal do dashboard |
| `components/modules/dashboard/KPICard.tsx` | Componente | Card reutilizável de KPI |
| `components/modules/dashboard/CashFlowChart.tsx` | Componente | Gráfico de barras de fluxo de caixa |
| `services/dashboard.ts` | Service | Orquestra chamada à API do dashboard |
| `types/index.ts` | Tipos | `DashboardKPIs`, `CashFlowPoint`, `DashboardData` |

## Componentes

### KPICard

Props:

| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| `title` | `string` | ✅ | Título do KPI |
| `value` | `string \| number` | ✅ | Valor exibido |
| `icon` | `LucideIcon` | ✅ | Ícone Lucide |
| `description` | `string` | — | Texto auxiliar abaixo do valor |
| `variant` | `"default" \| "warning" \| "danger"` | — | Cor da borda (padrão: `default`) |

Formatação automática: se `value` é `number` e `title` contém "Saldo", "Receita" ou "Despesa", aplica `formatCurrency`.

### CashFlowChart

Props:

| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| `data` | `CashFlowPoint[]` | ✅ | Array de pontos mensais |

Renderiza `BarChart` do recharts com duas barras (Receitas em verde, Despesas em vermelho). Tooltip customizado com `formatCurrency`. `ResponsiveContainer` width 100%, height 300px.

## Fluxo de Dados

```
DashboardPage (useEffect ao montar)
    ↓
getDashboard() — services/dashboard.ts
    ↓
apiFetch<ApiResponse<DashboardData>>("/api/dashboard/")
    ↓
Backend GET /api/dashboard/
```

## Estados da Página

| Estado | Comportamento |
|--------|---------------|
| `loading=true` | Grid de 8 skeleton cards + skeleton do gráfico |
| `error!=null` | Mensagem de erro + botão "Tentar novamente" |
| `data!=null` | 8 KPI cards + gráfico + rodapé com timestamp |

## KPIs Exibidos

| KPI | Valor | Ícone | Variant |
|-----|-------|-------|---------|
| Saldo Atual | `formatCurrency(kpis.balance)` | DollarSign | default |
| Receita do Mês | `formatCurrency(kpis.monthly_revenue)` | TrendingUp | default |
| Despesas do Mês | `formatCurrency(kpis.monthly_expenses)` | TrendingDown | default |
| Contas a Pagar | `N pendentes` | AlertCircle | warning se > 0 |
| Contas a Receber | `N pendentes` | Clock | default |
| Estoque Crítico | `N itens` | Package | danger se > 0 |
| Ordens em Aberto | `N ordens` | Factory | default |
| Clientes Inadimplentes | `N clientes` | UserX | danger se > 0 |

## Dependências

- `recharts` — gráfico de barras
- `lucide-react` — ícones dos KPIs
- `shadcn/ui` — Card, Button, Skeleton
