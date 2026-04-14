# Backend Module: PCP (Planejamento e Controle de Produção)

## Overview

Módulo responsável pela gestão de talhões e ciclo de produção de safras.

## Endpoints

- `GET /api/pcp/talhoes` — Lista talhões
- `POST /api/pcp/talhoes` — Cria talhão
- `PUT /api/pcp/talhoes/{id}` — Atualiza talhão
- `GET /api/pcp/atividades` — Lista atividades por talhão
- `POST /api/pcp/atividades` — Registra atividade
- `POST /api/pcp/safras/{talhao_id}/produzir` — Produz safra (instantaneous)
- `GET /api/pcp/safras` — Lista histórico de safras

## Integrations

- Estoque: baixa insumos, insere café produzido
- Financeiro: gera movimentações (entrada e saída de insumos)
- Notificações: alerta se insumo ficar abaixo do mínimo

## Database Schema

- `plots` table (talhões)
- `activities` table
- `harvests` table

## Business Rules

Produção de Safra (instantaneous):
1. Baixa insumos necessários do Estoque
2. Gera movimentação Financeiro (entrada/saída de insumos)
3. Simula resultado: distribui sacas entre qualidades
   - Especial: ~20% ±10%
   - Superior: ~50% ±10%
   - Tradicional: ~30% ±10%
4. Insere entradas de estoque (uma por qualidade)
5. Gera movimentação Financeiro (entrada de café)
6. Verifica se algum insumo ficou abaixo do mínimo → notificação

- Atividade com mão de obra interna gera movimentação com value R$0,00
- Histórico completo de safras com resultado detalhado

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
