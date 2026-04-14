# Frontend Module: Compras

## Overview

Módulo responsável pela interface de fornecedores e ordens de compra.

## Pages

- `/compras` — Lista de ordens
- `/compras/criar` — Criar nova ordem
- `/compras/[id]` — Detalhes da ordem
- `/compras/fornecedores` — Lista de fornecedores
- `/compras/fornecedores/criar` — Criar novo fornecedor
- `/compras/fornecedores/[id]` — Detalhes do fornecedor

## Components

- `PurchaseForm` — Formulário de criação de ordem (fornecedor, itens)
- `PurchaseCard` — Card com resumo da ordem
- `PurchasesList` — Tabela de ordens com filtros
- `PurchaseDetail` — Detalhes de ordem com dropdown de status
- `SupplierForm` — Formulário de fornecedor
- `SupplierCard` — Card de fornecedor
- `SuppliersList` — Tabela de fornecedores
- `SupplierDetail` — Detalhes do fornecedor

## Services

- `comprasService.getPurchases()` — Lista ordens
- `comprasService.createPurchase(data)` — Cria ordem
- `comprasService.updatePurchaseStatus(id, status)` — Atualiza status
- `comprasService.getSuppliers()` — Lista fornecedores
- `comprasService.createSupplier(data)` — Cria fornecedor
- `comprasService.updateSupplier(id, data)` — Atualiza fornecedor

## Features

- CRUD de fornecedores
- Criação de ordem com seleção de itens
- Atualização de status via dropdown
- Loading states e toasts
- Filtros e busca

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
