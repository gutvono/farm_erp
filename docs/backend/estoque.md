# Backend Module: Estoque

## Overview

Módulo responsável pela gestão de itens de estoque e movimentações.

## Endpoints

- `GET /api/estoque/itens` — Lista itens
- `POST /api/estoque/itens` — Cria item
- `PUT /api/estoque/itens/{id}` — Atualiza item
- `DELETE /api/estoque/itens/{id}` — Soft-deleta item
- `GET /api/estoque/movimentacoes` — Lista movimentações com filtros
- `POST /api/estoque/entrada` — Entrada manual
- `GET /api/estoque/inventario/pdf` — Gera PDF do inventário

## Integrations

- Financeiro: movimentações financeiras em toda entrada

## Database Schema

- `stock_items` table
- `stock_movements` table (imutável, append-only)

## Business Rules

- Quantidade em estoque calculada dinamicamente a partir de stock_movements
- Entrada manual gera movimentação financeira (mesmo que R$0,00)
- Alerta abaixo do mínimo → notificação no sino
- Movimentações imutáveis (nunca atualizar, apenas inserir)

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
