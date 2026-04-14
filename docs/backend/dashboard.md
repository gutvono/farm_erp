# Backend Module: Dashboard

## Overview

Módulo responsável pela agregação de KPIs e dados para o dashboard principal.

## Endpoints

- `GET /api/dashboard/kpis` — Retorna KPIs: faturamento, saldo, estoque crítico, ordens abertas
- `GET /api/dashboard/chart-data` — Retorna dados para gráficos

## Integrations

- Lê dados de Financeiro (saldo)
- Lê dados de Comercial (vendas do mês)
- Lê dados de Estoque (itens abaixo do mínimo)
- Lê dados de Compras (ordens abertas)

## Database Schema

Nenhuma tabela própria. Apenas agregações de outras tabelas.

## Business Rules

- KPIs atualizados em tempo real
- Faturamento = soma de faturas Pagas do mês
- Saldo = último saldo de financial_movements
- Estoque crítico = count de itens com stock < min_stock
- Ordens abertas = count de ordens em "Em andamento"

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
