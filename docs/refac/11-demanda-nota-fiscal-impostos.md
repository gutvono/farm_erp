# Demanda 11 — Nota fiscal profissional + impostos configuráveis

> **Status: ESCOPO A DEFINIR (anotada 2026-06-09).** Surgiu durante a D9. Sequência sugerida: **após o
> D10**; mas se o visual da NF importar para a apresentação do TCC, pode ser priorizada antes. Depende
> de a D9 (1 NF + N parcelas + desconto) estar fechada, pois a NF "de verdade" mostra subtotal/desconto/
> impostos/total.

## Motivação
Duas dores levantadas pelo usuário:
1. **"Dar um talento na nota fiscal"** — hoje o PDF da NF (jsPDF no `FaturaCard`) é simples; deixar com
   **mais cara de nota fiscal de verdade** (NF-e): blocos de **emitente** (a fazenda) e **destinatário**
   (cliente), **tabela de itens** (descrição, qtd, unitário, subtotal), **bloco de cobrança/parcelas**
   (já feito na 9.0), **impostos**, e **totais** (subtotal → desconto → impostos → total).
2. **Impostos editáveis em Configurações** — as alíquotas (ex.: ICMS e o que mais o TCC exigir) vivem em
   **Configurações** (`app_settings`, como as taxas de juros/multa da 9.B), editáveis; a NF calcula e
   exibe os impostos a partir delas.

## Pontos a decidir quando priorizar (rascunho)
- **Quais impostos** entram (provável: 1–2 alíquotas simples, ex. ICMS %, p/ não complicar o TCC).
- **Imposto é informativo ou entra no total?** (decide se afeta valor da nota/AR ou é só exibição
  fiscal). Acopla ao fluxo de dinheiro da D9 se entrar no total.
- **Layout:** redesenho do PDF (jsPDF) com blocos fiscais; manter o bloco de parcelas da 9.0.
- **Dados do emitente** (razão social, CNPJ da fazenda, endereço) — provavelmente em Configurações
  também (ou fixos).

## Relação com outras demandas
- Depende da D9 (desconto na 9.C já aparece na NF; impostos seguem o mesmo padrão de exibição na nota).
- Reusa `app_settings`/Configurações (padrão das taxas da 9.B).
- **Sem roles** (decisão do usuário — TCC).
- Prompts (DBA/BACK/FRONT) a escrever quando priorizar. Ver [[project_future_money_flow_refac]] (D9),
  [[project_d10_relatorio_vendas]].
</content>
