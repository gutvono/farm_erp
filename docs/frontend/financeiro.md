# Frontend Module: Financeiro

## Overview

Módulo responsável pela interface de conta corrente, contas a pagar/receber e movimentações.

## Pages

- `/financeiro` — Dashboard com saldo e resumo
- `/financeiro/saldo` — Saldo atual e movimentações
- `/financeiro/contas-receber` — Contas a receber
- `/financeiro/contas-receber/[id]` — Detalhes da conta a receber
- `/financeiro/contas-pagar` — Contas a pagar
- `/financeiro/contas-pagar/[id]` — Detalhes da conta a pagar
- `/financeiro/fluxo-caixa` — Fluxo de caixa por período
- `/financeiro/relatorio-inadimplencia` — Relatório de inadimplência

## Components

- `BalanceCard` — Card com saldo atual
- `AccountReceivablesList` — Tabela de contas a receber com filtros
- `AccountReceivableDetail` — Card de conta com botões Recebido, Não vai pagar
- `ReceivePaymentForm` — Formulário para receber conta (parcial ou total)
- `AccountPayablesList` — Tabela de contas a pagar com filtros
- `AccountPayableDetail` — Card de conta com botões Pagar, Cancelar
- `CashFlowChart` — Gráfico de receitas × despesas
- `AdimplenciaReport` — Tabela de clientes inadimplentes

## Services

- `financeiroService.getBalance()` — Retorna saldo atual
- `financeiroService.getMovements()` — Lista movimentações
- `financeiroService.getAccountsReceivable()` — Lista contas a receber
- `financeiroService.receivePayment(id, amount)` — Recebe conta
- `financeiroService.cancelAccountReceivable(id)` — Cancela conta
- `financeiroService.getAccountsPayable()` — Lista contas a pagar
- `financeiroService.payAccount(id)` — Paga conta
- `financeiroService.cancelAccountPayable(id)` — Cancela conta
- `financeiroService.getCashFlow(period)` — Fluxo de caixa
- `financeiroService.getAdimplenciaReport()` — Relatório de inadimplência

## Features

- Saldo em tempo real
- Contas a receber com recebimento parcial
- Contas a pagar com validação de saldo
- Fluxo de caixa com gráfico
- Relatório de inadimplência
- Loading states e toasts
- Filtros e busca

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
