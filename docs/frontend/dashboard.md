# Frontend Module: Dashboard

## Overview

Tela principal com KPIs e acesso rápido aos módulos.

## Pages

- `/` ou `/dashboard` — Dashboard principal

## Components

- `KPICard` — Card individual com KPI e valor
- `SalesChart` — Gráfico de receitas × despesas
- `StockAlerts` — Lista de itens em estoque crítico
- `QuickLinks` — Acesso rápido aos módulos

## Services

- `dashboardService.getKPIs()` — Retorna faturamento, saldo, estoque crítico, ordens
- `dashboardService.getChartData()` — Retorna dados para gráficos

## Features

- KPIs atualizados em tempo real
- Gráficos com Chart.js ou Recharts
- Links diretos para módulos
- Layout responsivo

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
