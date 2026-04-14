# Frontend Module: Comercial

## Overview

Módulo responsável pela interface de clientes e vendas.

## Pages

- `/comercial` — Lista de vendas
- `/comercial/criar` — Criar nova venda
- `/comercial/[id]` — Detalhes da venda
- `/comercial/clientes` — Lista de clientes
- `/comercial/clientes/criar` — Criar novo cliente
- `/comercial/clientes/[id]` — Detalhes do cliente

## Components

- `SaleForm` — Formulário de criação de venda (cliente, itens)
- `SaleCard` — Card com resumo da venda
- `SalesList` — Tabela de vendas com filtros
- `SalesDetail` — Detalhes de venda com dropdown de status
- `CustomerForm` — Formulário de cliente
- `CustomerCard` — Card de cliente
- `CustomersList` — Tabela de clientes
- `CustomerDetail` — Detalhes com botão de revertir inadimplência

## Services

- `comercialService.getSales()` — Lista vendas
- `comercialService.createSale(data)` — Cria venda
- `comercialService.updateSaleStatus(id, status)` — Atualiza status
- `comercialService.getCustomers()` — Lista clientes
- `comercialService.createCustomer(data)` — Cria cliente
- `comercialService.updateCustomer(id, data)` — Atualiza cliente
- `comercialService.revertAdimplencia(customerId)` — Reverte inadimplência

## Features

- CRUD de clientes com validação
- Criação de venda com seleção de itens
- Atualização de status via dropdown
- Exibição de campo inadimplente e botão reverter
- Loading states e toasts
- Filtros e busca

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
