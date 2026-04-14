# Frontend Module: Folha de Pagamento

## Overview

Módulo responsável pela interface de funcionários e folha de pagamento.

## Pages

- `/folha` — Dashboard com status da folha
- `/folha/funcionarios` — Lista de funcionários
- `/folha/funcionarios/criar` — Criar novo funcionário
- `/folha/funcionarios/[id]` — Detalhes do funcionário
- `/folha/[ano]/[mes]` — Folha de um mês específico
- `/folha/[ano]/[mes]/lancamentos` — Lançamentos (extras, faltas, descontos)
- `/folha/[ano]/[mes]/holerite/[funcionario_id]` — Holerite individual
- `/folha/[ano]/[mes]/pagamento` — Tela de pagamento individual/lote

## Components

- `EmployeeForm` — Formulário de criação/edição de funcionário
- `EmployeeCard` — Card com foto e resumo do funcionário
- `EmployeesList` — Tabela de funcionários com filtros
- `EmployeeDetail` — Detalhes com botão de demitir
- `PayrollSummary` — Resumo da folha do mês
- `PayrollEntries` — Tabela de lançamentos (extras, faltas, descontos)
- `PayrollEntry` — Formulário para adicionar extra/falta/desconto
- `HoleriteCard` — Card do holerite com resumo
- `HoleritePdf` — Botão para exportar holerite em PDF
- `PaymentButton` — Botão pagar individual
- `PayAllButton` — Botão pagar todos em lote
- `StatusFolha` — Indicador de status (Aberta/Fechada)

## Services

- `folhaService.getEmployees()` — Lista funcionários
- `folhaService.createEmployee(data)` — Cria funcionário
- `folhaService.updateEmployee(id, data)` — Atualiza funcionário
- `folhaService.dismissEmployee(id)` — Registra demissão
- `folhaService.getPayroll(ano, mes)` — Retorna folha do mês
- `folhaService.addPayrollEntry(ano, mes, data)` — Adiciona extra/falta/desconto
- `folhaService.closePayroll(ano, mes)` — Fecha folha
- `folhaService.payEmployee(ano, mes, funcionarioId)` — Paga funcionário
- `folhaService.payAll(ano, mes)` — Paga todos em lote
- `folhaService.getHolerite(funcionarioId, ano, mes)` — Retorna holerite
- `folhaService.exportHoleritePdf(funcionarioId, ano, mes)` — Exporta PDF

## Features

- CRUD de funcionários com foto
- Lançamento de extras, faltas e descontos por mês
- Cálculo automático de folha
- Visualização de holerite individual
- Exportação de holerite em PDF
- Fechamento de folha (sem alterações após)
- Pagamento individual ou em lote com validação de saldo
- Loading states e toasts

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
