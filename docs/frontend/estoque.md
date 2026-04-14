# Frontend Module: Estoque

## Overview

Módulo responsável pela interface de itens de estoque e movimentações.

## Pages

- `/estoque` — Lista de itens
- `/estoque/criar` — Criar novo item
- `/estoque/[id]` — Detalhes do item
- `/estoque/movimentacoes` — Histórico de movimentações
- `/estoque/entrada` — Entrada manual de estoque
- `/estoque/inventario` — Gerar e baixar PDF do inventário

## Components

- `StockItemForm` — Formulário de criação/edição de item
- `StockItemCard` — Card com resumo do item
- `StockItemsList` — Tabela de itens com filtros
- `StockItemDetail` — Detalhes do item com quantidade e alertas
- `StockMovementsList` — Tabela de movimentações com filtros
- `StockEntryForm` — Formulário de entrada manual
- `InventoryButton` — Botão para gerar PDF do inventário
- `StockAlert` — Alerta visual para itens abaixo do mínimo

## Services

- `estoqueService.getItems()` — Lista itens
- `estoqueService.createItem(data)` — Cria item
- `estoqueService.updateItem(id, data)` — Atualiza item
- `estoqueService.getMovements()` — Lista movimentações com filtros
- `estoqueService.recordEntry(data)` — Registra entrada manual
- `estoqueService.generateInventoryPdf()` — Gera PDF do inventário

## Features

- CRUD de itens com unidades
- Entrada manual com geração de movimentação financeira
- Listagem de movimentações com filtros e ordenação
- Alerta visual para estoque abaixo do mínimo
- Geração de PDF do inventário
- Loading states e toasts

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
