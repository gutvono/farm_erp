# Frontend Module: PCP (Planejamento e Controle de Produção)

## Overview

Módulo responsável pela interface de talhões e ciclo de produção de safras.

## Pages

- `/pcp` — Dashboard com talhões e histórico de safras
- `/pcp/talhoes` — Lista de talhões
- `/pcp/talhoes/criar` — Criar novo talhão
- `/pcp/talhoes/[id]` — Detalhes do talhão
- `/pcp/talhoes/[id]/atividades` — Atividades registradas
- `/pcp/talhoes/[id]/produzir` — Executar produção de safra
- `/pcp/safras` — Histórico de safras

## Components

- `PlotForm` — Formulário de criação/edição de talhão
- `PlotCard` — Card com resumo do talhão
- `PlotsList` — Tabela de talhões
- `PlotDetail` — Detalhes do talhão com botão produzir safra
- `ActivityForm` — Formulário de registro de atividade
- `ActivitysList` — Tabela de atividades do talhão
- `ProduceHarvestButton` — Botão para produzir safra
- `ProduceHarvestModal` — Modal com confirmação e resultado
- `HarvestDetail` — Card com detalhes da safra produzida
- `HarvestsList` — Tabela de histórico de safras

## Services

- `pcpService.getPlots()` — Lista talhões
- `pcpService.createPlot(data)` — Cria talhão
- `pcpService.updatePlot(id, data)` — Atualiza talhão
- `pcpService.getActivities(plotId)` — Lista atividades
- `pcpService.recordActivity(plotId, data)` — Registra atividade
- `pcpService.produceHarvest(plotId)` — Executa produção de safra
- `pcpService.getHarvestHistory()` — Lista histórico de safras

## Features

- CRUD de talhões com variedade e capacidade
- Registro de atividades com mão de obra interna/externa
- Produção de safra com simulação de resultado
- Distribuição automática de qualidades (Especial, Superior, Tradicional)
- Cálculo de estoque gerado por qualidade
- Histórico completo de safras com resultado detalhado
- Alerta se insumo ficar abaixo do mínimo após produção
- Loading states e toasts

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
