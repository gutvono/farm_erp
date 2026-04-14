# Frontend Module: Faturamento

## Overview

Módulo responsável pela interface de gerenciamento de faturas.

## Pages

- `/faturamento` — Lista de faturas
- `/faturamento/criar` — Criar fatura manual
- `/faturamento/[id]` — Detalhes da fatura
- `/faturamento/[id]/pdf` — Visualizar/exportar PDF

## Components

- `InvoiceForm` — Formulário de criação de fatura manual
- `InvoiceCard` — Card com resumo da fatura
- `InvoicesList` — Tabela de faturas com filtros
- `InvoiceDetail` — Detalhes da fatura com dropdown de status
- `InvoicePdfExport` — Botão para exportar PDF

## Services

- `faturamentoService.getInvoices()` — Lista faturas
- `faturamentoService.createInvoice(data)` — Cria fatura manual
- `faturamentoService.updateInvoiceStatus(id, status)` — Atualiza status
- `faturamentoService.exportPdf(id)` — Exporta fatura em PDF

## Features

- Listagem de faturas com filtros por cliente e status
- Criação manual de fatura avulsa
- Atualização de status via dropdown
- Exportação de fatura em PDF
- Loading states e toasts
- Integração com Comercial (faturas geradas automaticamente)

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
