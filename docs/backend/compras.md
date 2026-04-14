# Backend Module: Compras

## Overview

Módulo responsável pela gestão de fornecedores e ordens de compra.

## Endpoints

- `GET /api/compras/fornecedores` — Lista fornecedores
- `POST /api/compras/fornecedores` — Cria fornecedor
- `PUT /api/compras/fornecedores/{id}` — Atualiza fornecedor
- `DELETE /api/compras/fornecedores/{id}` — Soft-deleta fornecedor
- `GET /api/compras/ordens` — Lista ordens
- `POST /api/compras/ordens` — Cria ordem
- `PUT /api/compras/ordens/{id}` — Atualiza status da ordem

## Integrations

- Estoque: entrada ao concluir ordem
- Financeiro: lança conta a pagar + movimentação

## Database Schema

- `suppliers` table
- `purchases` table
- `purchase_items` table

## Business Rules

- Ordem ao mudar para Concluída: entrada estoque, conta a pagar, movimentação financeira
- Status Em andamento → Concluída → Cancelada (final)
- Concluída e Cancelada são irreversíveis
- Entrada de estoque só ocorre quando status = Concluída

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
