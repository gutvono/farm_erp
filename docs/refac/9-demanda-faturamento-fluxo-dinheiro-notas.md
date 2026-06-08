# Demanda 9 — Refac do fluxo de dinheiro/notas (Vendas + Financeiro + Faturamento)

> **Status: ESCOPO DEFINIDO, prompts a escrever.** Promovida de backlog a **Demanda 9** em 2026-06-08
> (decisão do usuário): roda **antes** do relatório de vendas (agora D10) para que o relatório nasça
> sobre o modelo final (1 NF + N parcelas), sem retrabalho na fatia de recebíveis. É a maior demanda de
> núcleo do refac — o PO escreve os 3 prompts (DBA/BACK/FRONT) quando priorizar. Sequência: após a D8
> (ver flag de ordenação D8×D9 no README — a D9 remexe telas de Faturamento/Financeiro).

## Motivação
Hoje uma venda **parcelada** cria **uma Nota Fiscal por parcela** (`faturamento.criar_faturas_parceladas`
→ ex.: 3 NFs num pagamento 3x). Isso **conflou** duas coisas que os ERPs profissionais separam:

- **Nota Fiscal (NF-e)** = documento da **operação** (saída da mercadoria). Uma venda de mercadoria gera
  **UMA** NF-e, independente da forma de pagamento.
- **Parcelas / duplicatas** = o **financeiro** (cobrança). São contas a receber, não notas fiscais. Na
  NF-e brasileira elas vivem no **bloco de cobrança** (`<cobr>/<dup>`) da própria nota.

Modelo-alvo: **1 venda → 1 NF-e → N parcelas (duplicatas) no Financeiro.**

## Escopo (amplo — por isso é demanda própria)
- **Faturamento:** uma nota por venda, com as parcelas como itens de cobrança/duplicatas (não como
  Invoices separadas). PDFs refletindo isso.
- **Motor de cancelamento:** `_cancelar_nf_venda` hoje **itera invoices por `sale_id`**; passa a agir na
  **nota única** e cascatear para as duplicatas/contas a receber.
- **Financeiro:** N contas a receber (uma por parcela) vinculadas à **mesma** nota.
- **Vendas (Comercial):** criação da venda parcelada passa a emitir 1 NF + N parcelas.
- **Frontend:** listagem/detalhe de notas e de contas a receber refletindo "1 nota, N parcelas".

## Regras de negócio a travar (decisões já sinalizadas)
- **Não existe "cancelar parcela específica" como evento fiscal.** Cancelar a nota cancela a venda toda
  (mercadoria volta, todas as duplicatas são canceladas). "Mexer numa parcela só" é evento **financeiro**
  (renegociar / dar baixa numa duplicata), feature do Financeiro, separada do cancelamento fiscal.

## Relação com a D7
A D7 (Comercial) **não** mexe nisso — só fecha o cancelamento da venda inteira (correto) e adiciona a
navegação "Ver notas fiscais da venda". A unificação 1-NF-N-parcelas fica para esta demanda. Ver
`7-demanda-comercial-paridade-cancelamento.md`.
</content>
