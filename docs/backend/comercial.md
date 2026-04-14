# Backend Module: Comercial

## Overview

Módulo responsável pela gestão de clientes e vendas diretas.

## Endpoints

- `GET /api/comercial/clientes` — Lista clientes
- `POST /api/comercial/clientes` — Cria cliente
- `PUT /api/comercial/clientes/{id}` — Atualiza cliente
- `DELETE /api/comercial/clientes/{id}` — Soft-deleta cliente
- `PUT /api/comercial/clientes/{id}/inadimplente` — Reverte inadimplência
- `GET /api/comercial/vendas` — Lista vendas
- `POST /api/comercial/vendas` — Cria venda
- `PUT /api/comercial/vendas/{id}` — Atualiza status da venda

## Integrations

- Estoque: baixa itens ao criar venda
- Faturamento: cria fatura automaticamente
- Financeiro: lança conta a receber + movimentação

## Database Schema

- `customers` table
- `sales` table
- `sale_items` table

## Business Rules

- Venda cria automaticamente: baixa estoque, fatura, conta a receber, movimentação financeira
- Status Realizada → Entregue → Cancelada (final)
- Cancelada e Entregue são irreversíveis
- Cliente marcado como inadimplente quando conta a receber é cancelada por não pagamento
- Inadimplência reversível manualmente

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
