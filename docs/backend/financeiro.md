# Backend Module: Financeiro

## Overview

Módulo responsável pela gestão da conta corrente, contas a pagar/receber e movimentações financeiras.

## Endpoints

- `GET /api/financeiro/saldo` — Retorna saldo atual
- `GET /api/financeiro/movimentacoes` — Lista movimentações
- `GET /api/financeiro/contas-receber` — Lista contas a receber
- `PUT /api/financeiro/contas-receber/{id}` — Recebe conta (parcial ou total)
- `PUT /api/financeiro/contas-receber/{id}/cancelar` — Marca como não pagável
- `GET /api/financeiro/contas-pagar` — Lista contas a pagar
- `PUT /api/financeiro/contas-pagar/{id}` — Paga conta
- `PUT /api/financeiro/contas-pagar/{id}/cancelar` — Cancela conta
- `GET /api/financeiro/fluxo-caixa` — Fluxo de caixa por período
- `GET /api/financeiro/relatorio-inadimplencia` — Relatório de inadimplência

## Integrations

- Comercial: cria contas a receber ao vender
- Compras: cria contas a pagar ao concluir compra
- Folha: cria contas a pagar ao fechar folha
- Estoque: recebe movimentações internas
- Todos os módulos: geram movimentações financeiras

## Database Schema

- `financial_movements` table (append-only)
- `accounts_receivable` table
- `accounts_payable` table

## Business Rules

- Saldo = SUM(movements WHERE type = 'entrada') - SUM(movements WHERE type = 'saída')
- Toda operação do sistema gera movimento financeiro
- Movimentos internos = tipo 'saída' com value = 0.00
- Conta a receber: status Aberta → Quitada / Parcialmente paga → Cancelada
- Conta a pagar: status Aberta → Paga → Cancelada
- Ao cancelar conta a receber por não pagamento: marca cliente como inadimplente
- Inadimplência reversível manualmente via Comercial

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
