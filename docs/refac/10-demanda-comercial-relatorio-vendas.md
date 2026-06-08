# Demanda 10 — Comercial: Relatório/Dashboard de Vendas por período

> **Status: ESCOPO TRAVADO, prompts a escrever quando priorizar.** Definida em 2026-06-08 para dar a
> "robustez final" ao módulo Comercial. Padrão DBA(leve) → BACKEND (agregações) → FRONTEND (telas).
> Sequência: **após a D9** (refac de dinheiro/notas) — assim a fatia de recebíveis nasce sobre o modelo
> final (1 NF + N parcelas), SEM retrabalho. Ver `9-demanda-faturamento-fluxo-dinheiro-notas.md`.

## Contexto
O dashboard global hoje é um snapshot cross-módulo fixo (saldo, contas em aberto, contagens, fluxo de
caixa de 6 meses) — não faz análise de vendas por período. O PCP já tem relatório próprio
(`RelatoriosPCP.tsx`); o Comercial não tem nenhum. Esta demanda preenche essa lacuna.

## Decisões de produto (TRAVADAS)
- **Onde mora (os dois):**
  1. **Headline no dashboard global** — alguns KPIs de vendas do mês corrente como visão rápida.
  2. **Tela "Relatórios de Vendas" no Comercial** — filtro de período + detalhe (espelha o
     `RelatoriosPCP`).
- **Escopo v1 = operacional + recebíveis.**
  - 🟢 **Operacional (terreno estável — `sales`/`sale_items`, intocado pelo refac):** faturamento bruto
    no período, nº de vendas, ticket médio, vendas por status, mix à vista×parcelado, evolução temporal
    (dia/semana/mês), top produtos (qtd e R$), top clientes. Período via `sold_at` (já há
    `idx_sales_sold_at`). Vendas canceladas excluídas dos totais (ou destacadas à parte).
  - 🟡 **Recebíveis (terreno que o refac vai mexer):** recebido × a receber no período, inadimplência em
    R$ (aging básico). **REGRA DE ARQUITETURA TRAVADA:** ler as contas a receber **através do service do
    Financeiro** (`financeiro/service.py`), NUNCA consultando `invoices` direto. Assim o refac de
    dinheiro/notas troca a implementação por baixo sem reescrever o relatório (consumidor, não
    reimplementador). A `accounts_receivable` deve sobreviver ao refac; o que muda é a relação com as
    notas.
- **Headline do dashboard global (mês corrente):** faturamento de vendas no mês, nº de vendas, ticket
  médio.

## Critérios de aceite (rascunho — detalhar nos prompts)
- [ ] Endpoint(s) de agregação de vendas por período (faturamento, contagem, ticket, por status, mix,
      série temporal, top produtos, top clientes) — backend, via Service, com filtro de período.
- [ ] Fatia de recebíveis lida via service do Financeiro (não via `invoices`).
- [ ] Dashboard global ganha os KPIs headline de vendas do mês.
- [ ] Tela "Relatórios de Vendas" no Comercial com filtro de período e os gráficos/tabelas.
- [ ] Smoke com SELECT no container provando os números das agregações contra dados de seed.

## Timing vs. refac de dinheiro/notas (RESOLVIDO)
Decidido em 2026-06-08: o refac de dinheiro/notas foi promovido a **D9** e roda **antes** desta demanda
(D10). Logo a fatia de recebíveis é construída **uma vez** sobre o modelo final (1 NF + N parcelas),
**sem retrabalho**. A regra de arquitetura acima (recebíveis via service do Financeiro) continua valendo
como boa prática de camadas.

> Prompts (DBA/BACK/FRONT) a escrever quando priorizar. Antes de escrever, RELER o que o módulo
> `dashboard` já calcula (não duplicar) e o `RelatoriosPCP` como gabarito de tela.
</content>
