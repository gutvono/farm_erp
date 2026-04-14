# Backend Module: Faturamento

## Overview

Módulo responsável pela gestão de faturas.

## Endpoints

- `GET /api/faturamento/faturas` — Lista faturas
- `POST /api/faturamento/faturas` — Cria fatura manual
- `PUT /api/faturamento/faturas/{id}` — Atualiza status
- `GET /api/faturamento/faturas/{id}/pdf` — Exporta PDF

## Integrations

- Comercial: faturas geradas automaticamente ao vender

## Database Schema

- `invoices` table

## Business Rules

- Fatura gerada automaticamente ao criar venda (Comercial)
- Criação manual para faturas avulsas
- Status Emitida → Paga → Cancelada (final)
- Paga quando conta a receber correspondente é quitada (atualizado pelo Financeiro)
- PDF exportável com dados da fatura

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
