# Backend Module: Folha de Pagamento

## Overview

Módulo responsável pela gestão de funcionários e folha de pagamento.

## Endpoints

- `GET /api/folha/funcionarios` — Lista funcionários
- `POST /api/folha/funcionarios` — Cria funcionário
- `PUT /api/folha/funcionarios/{id}` — Atualiza funcionário
- `PUT /api/folha/funcionarios/{id}/demitir` — Registra demissão
- `GET /api/folha/folhas` — Lista folhas por competência
- `GET /api/folha/folhas/{ano}/{mes}` — Folha de um mês específico
- `PUT /api/folha/folhas/{ano}/{mes}` — Atualiza lançamentos (extras, faltas, descontos)
- `PUT /api/folha/folhas/{ano}/{mes}/fechar` — Fecha folha
- `PUT /api/folha/folhas/{ano}/{mes}/{funcionario_id}/pagar` — Paga funcionário individual
- `PUT /api/folha/folhas/{ano}/{mes}/pagar-todos` — Paga todos em lote
- `GET /api/folha/funcionarios/{id}/holerite/{ano}/{mes}/pdf` — Exporta holerite em PDF

## Integrations

- Financeiro: lança contas a pagar ao fechar folha, deduz ao pagar

## Database Schema

- `employees` table
- `payroll` table
- `payroll_items` table (extras, faltas, descontos por funcionário/mês)

## Business Rules

- Demissão com custo: CLT = maior, PJ/Temporário = menor
- Cálculo automático: salário_base + extras - faltas - descontos
- Folha status: Aberta → Fechada
- Sem alterações após fechamento (auditoria)
- Pagamento individual ou em lote, valida saldo, deduz Financeiro
- Gera movimentação financeira por funcionário pago

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
