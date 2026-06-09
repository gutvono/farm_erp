# Demanda 9 — Faturamento/Financeiro: 1 NF + N parcelas (+ inadimplência auto, juros/multa, desconto)

> **Status: PLANO TRAVADO, prompts gerados sob demanda (um por vez).** É a maior e mais arriscada
> demanda do refac — mexe no núcleo do Faturamento, no motor de cancelamento (consertado na D7), no
> Financeiro e nos PDFs. Por isso é quebrada em **sub-etapas independentes e testáveis**, com a espinha
> primeiro. Roda **antes da D10** (relatório de vendas), para o relatório nascer no modelo final.

## Motivação
Hoje uma venda **parcelada** cria **N notas fiscais** (uma por parcela, com os **mesmos itens
duplicados** em cada uma, encadeadas via `parent_invoice_id`), + N contas a receber. Isso conflou
**documento fiscal** com **parcela financeira**. O correto (NF-e BR) é **1 venda → 1 NF-e → N
parcelas/duplicatas**; as parcelas vivem no bloco de cobrança da própria nota.

**Boa notícia (survey 2026-06-08):** a `accounts_receivable` **já é a parcela** — já carrega
`invoice_id`, `sale_id`, `installment_number/total`, `due_date`, `amount`, `amount_received`, `status`,
`payment_method`. A redundância está **só na camada de nota**. O refac é "parar de cunhar N notas" e
religar as pontas, não construir um modelo novo.

## Modelo atual × alvo
| | Hoje | Alvo |
|---|---|---|
| Venda à vista | 1 nota + 1 AR | igual |
| Venda Nx | **N notas** (itens duplicados) + N AR | **1 nota** (itens 1×, total cheio) + N AR |
| Parcela mora em | nota *e* AR (redundante) | **só na AR** (`invoice_id` → a nota única) |
| `invoice.installment_*` / `parent_invoice_id` | usados no venda | **mortos** no venda |
| Cancelamento | itera N notas por `sale_id` | cancela **1 nota** + N AR |

## ⚓ Invariante de timing (NÃO REGREDIR — preservar na 9.0)
A NF de venda é **emitida no ATO da venda**, antes de qualquer recebimento — modelo fiscal correto
(documento da operação no negócio; dinheiro depois). Hoje `comercial.create_sale` já faz, na criação da
venda: (1) emite a(s) nota(s); (2) lança as contas a receber com **vencimentos futuros**; (3) registra
movimento financeiro **R$ 0** (placeholder). O **caixa real só se move no recebimento/baixa** das parcelas
("dinheiro só se move no pagamento").

A 9.0 muda **quantas** notas existem (N → 1), **não** muda **quando** a nota nasce. Após o refac:
- 1 nota **emitida** no ato da venda (não no recebimento) + N AR (parcelas) com vencimentos futuros;
- movimento financeiro real continua ocorrendo **só na baixa** de cada parcela;
- a nota nasce `emitida` e vira `paga` (derivado) **quando todas as parcelas forem recebidas**.

> Contraste (já implementado, não mexer): em **Compras** (D1.1) a NF de recebimento + entrada de estoque
> ocorrem na **conferência** (não no pagamento), e o pagamento só liquida. Timings diferentes por fluxo —
> a D9 só toca a **venda** e preserva "NF no ato da venda".

## Decisões de produto (TRAVADAS — 2026-06-08)
- **Parcelas = reusar `accounts_receivable`** (1 nota → N AR). **Sem** tabela de duplicatas nova. O
  "bloco de cobrança" da nota é a lista de AR dela.
- **Dados legados = RESEED** (prod descartável): atualizar `seed.sql` pro modelo novo (1 nota + N AR no
  parcelado) e `make reset-db`. **Sem** migração de colapso de dados.
- **`invoice.installment_number/installment_total/parent_invoice_id`**: ficam **mortos** no fluxo de
  venda. DBA decide entre **dropar** (migration) ou **manter nullable/DEPRECATED** — preferir dropar se
  nenhum outro tipo de nota usa.
- **Status da nota:** "paga" passa a ser **derivado das AR** (emitida até todas as parcelas recebidas →
  paga). A nota deixa de ter pagamento por-parcela.
- **A — Inadimplência automática = DERIVADA + manual como override.** Sem scheduler no projeto → cliente
  é inadimplente-auto se tiver **qualquer parcela vencida** (`due_date < hoje` e não quitada), calculado
  na leitura. O `is_delinquent` manual da D7 **permanece** como override. "Efetivo" = manual OU
  tem-parcela-vencida. (Resolve o que a D7 deixou de fora; alimenta a D10.)
- **B — Juros/multa por atraso = padrão BR**, na **baixa** de parcela vencida: **multa %** fixa (uma vez)
  **+ juros de mora %/mês** pro-rata pelos dias de atraso. **Taxas em `app_settings` (Configurações)**,
  com default semeado. Encargo entra na baixa (valor devido da parcela vencida).
- **C — Desconto manual % na venda:** campo de **percentual** na criação da venda; guarda
  `discount_percent` + `discount_amount` + `total_amount` **já com desconto**; nota e parcelas derivam do
  total com desconto. Front mostra **subtotal → desconto (R$) → total final**. (Desconto sobre o total da
  venda, não por item.)

## Sub-etapas (independentes e testáveis — gerar prompts uma por vez)

### 9.0 — Espinha: 1 NF + N parcelas (FAZER PRIMEIRO, sozinha)
- **DBA:** decisão das colunas `installment_*`/`parent_invoice_id` (dropar vs manter); **reseed**
  (`seed.sql` com parcelado no modelo novo: 1 nota + N AR). Sem migração de dados.
- **Backend:** Faturamento troca `criar_faturas_parceladas` (N notas) por **1 nota (total cheio) + N AR**
  (a divisão de valores/vencimentos passa a dirigir as AR). Comercial `create_sale` simplifica (sempre 1
  nota + 1..N AR). Cancelamento (`_cancelar_nf_venda`) cancela **1 nota** + todas as AR (estorno íntegro);
  simplifica o "achar 1 das N notas" que a D7 teve que fazer. Status da nota derivado das AR.
- **PDF:** nota com total cheio + **bloco de parcelas** (as AR), no lugar de N PDFs de "1/3".
- **Front:** lista de Faturas mostra **1 fatura** por venda; detalhe da fatura lista as parcelas;
  "Ver notas fiscais" (`?sale_id`) retorna 1. Financeiro/contas a receber **não muda**.
- **Done/regressão (crítico):** cancelar venda À VISTA e PARCELADA continua **íntegro** (estoque + todas
  as AR + nota) — provar com SELECT antes/depois; PDF gerado; `make reset-db` ok.

### 9.A — Inadimplência automática (derivada)
- **Backend:** verificação derivada de parcela vencida; `ClientOut` expõe inadimplência **efetiva**
  (manual OU vencida) e/ou `has_overdue`; status "vencido" computado na AR. Mantém o override manual.
- **Front:** badge/lista de clientes reflete inadimplência auto; o aviso de venda (D7) passa a disparar
  também pela derivada.
- **Done:** parcela vencida → cliente aparece inadimplente **sem** botão manual.

### 9.B — Juros/multa por atraso
- **DBA/Config:** chaves em `app_settings` (multa %, juros %/mês) + defaults no seed; aba em
  Configurações pra editar.
- **Backend:** na baixa de parcela vencida, calcular encargo = multa + juros×dias; incorporar ao valor
  devido (definir representação: encargo no movimento/na AR).
- **Front:** tela de baixa mostra o encargo calculado; Configurações edita as taxas.
- **Done:** baixa de parcela vencida cobra multa+juros corretos (smoke com datas).

### 9.C — Desconto % na venda (mais solto — 1º candidato a virar demanda própria se inflar)
**Desconto como campo EXPLÍCITO (não edição de preço unitário) — auditável de ponta a ponta** (modelo
ERP correto: preço de tabela intacto + desconto registrado à parte). **Sem roles/alçada** (decisão do
usuário 2026-06-09: TCC, roles só atrapalhariam). Desconto no **cabeçalho** (sobre o total), só **%**.
- **DBA:** `sales` ganha `discount_percent` + `discount_amount` (migration).
- **Backend:** `create_sale` aplica desconto; `total_amount` = subtotal − desconto. **Propaga para a
  NOTA:** a invoice carrega o desconto (campo/linha) e a NF mostra **Subtotal → Desconto → Total
  líquido**; **nota e parcelas (AR) derivam do total LÍQUIDO**. Auditável: venda → nota → AR →
  recebimento/relatório enxergam o líquido.
- **Front:** `VendaForm` com input de % (no cabeçalho) → mostra **subtotal → desconto (R$) → total
  final**. Preço unitário NÃO é sobrescrito. A NF/PDF mostra a linha de desconto.
- **Done:** venda com X% → total, **nota (com linha de desconto)** e parcelas refletem o desconto.

## Sequência sugerida
**9.0 (espinha) → 9.A → 9.B → 9.C.** A C é independente da espinha (poderia ir antes como aquecimento de
baixo risco); B e C podem trocar de ordem. A espinha **tem que vir primeiro** e fechar com regressão de
cancelamento antes de empilhar o resto.

## Relação com D7 e D10
- D7 já fez o cancelamento de venda passar pelo motor único; a 9.0 **simplifica** esse motor (1 nota).
- D10 (relatório de vendas) lê recebíveis **via service do Financeiro** e nasce sobre este modelo final.
- Ver [[project_d7_comercial]], [[project_d10_relatorio_vendas]], [[project_future_money_flow_refac]].
</content>
