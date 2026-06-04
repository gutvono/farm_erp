# Demanda 1 — Faturamento: Cancelamento de Notas Fiscais

## Contexto
Hoje cancelar uma fatura (`PATCH /faturas/{id}/status` → `cancelada`) só registra uma
movimentação financeira de R$ 0,00 para rastreabilidade (ver `docs/backend/faturamento.md`).
Não há estorno real. Precisamos que o cancelamento **reverta os efeitos** de cada tipo
de NF. Os tipos existentes (campo `invoices.invoice_type`): `venda`, `recebimento`,
`transporte`, `devolucao`.

Releia antes de começar: `docs/backend/faturamento.md`, `docs/backend/comercial.md`,
`docs/backend/financeiro.md`, `docs/backend/estoque.md`, `docs/frontend/faturamento.md`,
e os arquivos reais `backend/app/modules/faturamento/{service.py,router.py,repository.py,model.py}`,
`backend/app/modules/comercial/service.py` e `backend/app/modules/estoque/service.py`.

## Objetivo
Implementar **cancelamento com estorno** por tipo de NF, com efeito ponta a ponta e
estado consistente entre módulos.

## Regras de cancelamento por tipo (DECISÕES TRAVADAS)

| Tipo NF | Efeito ao cancelar |
|---------|--------------------|
| **`venda`** | Cancela **ponta a ponta** (D4): (a) volta os produtos ao estoque (`registrar_entrada` de cada item, com o `unit_cost` registrado na saída original); (b) **cancela a venda** associada (`sales.status = cancelada`); (c) **cancela a(s) conta(s) a receber** vinculada(s) — inclusive parcelas (`accounts_receivable.status = cancelada`); (d) gera os estornos financeiros. Se a venda for **parcelada** (várias faturas/parcelas), cancelar QUALQUER NF da cadeia cancela a **venda inteira** e **todas** as NFs/parcelas/AR irmãs. Para valores **já recebidos**, registrar movimento de **estorno** (`saida/ajuste`) no Financeiro. |
| **`recebimento`** | (a) **Estorna o valor na conta** — registra `entrada/ajuste` no Financeiro com o `total_amount` da NF (devolve o dinheiro que saiu no pagamento da compra); (b) **remove do estoque** os produtos que entraram (`registrar_saida` das quantidades aceitas correspondentes). A ordem de compra **permanece `concluida`** (não reabrir) e a conta a pagar **permanece `paga`** — o ajuste é puramente de NF/estoque/caixa. Documentar essa escolha. |
| **`transporte`** | **Apenas reajusta os valores relacionados**: registra o estorno financeiro do `shipping_cost` (movimento de ajuste de sinal inverso ao que foi lançado) e marca a NF como cancelada. **Sem** efeito de estoque. |
| **`devolucao`** | Os produtos devolvidos **entram no estoque como itens AVARIADOS**: para cada item da NF de devolução, resolver o `stock_item` original (via `order_id` no `notes` → `purchase_order_items`), procurar um item de estoque com **SKU avariado padronizado** (ver abaixo); se não existir, **criar** um novo `stock_item` com nome sufixado `" (AVARIADO)"` e SKU derivado; registrar `entrada` da `quantity_rejected`. Marca a NF de devolução como cancelada. |

### SKU do item AVARIADO
- Há um padrão de geração de SKU no sistema — **localize-o** (procure por geração de
  `sku` em `backend/app/modules/estoque/` e seeds). 
- Padrão a adotar: `"{sku_original}-AVARIADO"`. Antes de criar, **pesquisar por esse SKU**;
  se já existir, reaproveitar o item (apenas registrar nova entrada). Garante idempotência
  e evita duplicar o item avariado.

### Quando o cancelamento é permitido
- Permitido a partir de `emitida` **e** `paga`. Bloqueado se já `cancelada` (400).
- Operação **idempotente em efeito**: nunca estornar duas vezes a mesma NF.

## Critérios de aceite
- [ ] Endpoint dedicado `POST /api/faturamento/faturas/{id}/cancelar` (não sobrecarregar o PATCH de status com efeitos colaterais).
- [ ] Cada tipo de NF executa exatamente os efeitos da tabela acima, em transação (tudo ou nada).
- [ ] Cancelar NF de venda parcelada cancela a venda + todas as parcelas/NFs/AR.
- [ ] Item AVARIADO criado/reaproveitado por SKU; nunca duplica.
- [ ] Saldo do Financeiro após cancelar = saldo coerente com os estornos.
- [ ] Mensagens em português; sem regressão nos fluxos de criação de NF.

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md`, a seção
> "Regras transversais" de `docs/refac/README.md` e os models
> `backend/app/modules/faturamento/model.py`, `comercial/model.py`, `estoque/model.py`.
>
> **Tarefa:** avaliar se o cancelamento exige mudança de schema. Provavelmente **mínima**:
> 1. Garanta rastreabilidade do estorno: avalie adicionar `invoices.cancelled_at TIMESTAMPTZ NULL`
>    (e `cancellation_reason TEXT NULL`, opcional) para auditar quando/por que a NF foi cancelada.
>    Se decidir adicionar, faça migration idempotente e reversível (`revision id` ≤ 32 chars,
>    `down_revision` = head atual confirmado por `alembic heads`).
> 2. Confirme que **não** há necessidade de nova tabela (o item AVARIADO usa `stock_items`,
>    estornos usam `financial_movements`/`stock_movements` já existentes).
> 3. Verifique índices em `invoices.invoice_type` e `invoices.parent_invoice_id`
>    (usados para achar a cadeia parcelada e filtrar por tipo); adicione se faltarem.
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `\d invoices` no psql
> mostrando as colunas/índices; doc `docs/database/schema.md` atualizada. Cole as saídas.

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend**. Leia `/.claude/agents/backend.md` e a seção "Regras transversais"
> de `docs/refac/README.md`. **Antes de codar, leia** integralmente:
> `backend/app/modules/faturamento/{service.py,router.py,repository.py,model.py}`,
> `backend/app/modules/comercial/service.py`, `backend/app/modules/financeiro/service.py`,
> `backend/app/modules/estoque/service.py` e `docs/backend/{faturamento,comercial,financeiro,estoque}.md`.
> Entenda como `criar_nota_recebimento/devolucao/transporte` e `criar_fatura(s)` funcionam,
> e como o `notes` carrega `order_id=<uuid>` (prefixos `[NF-RECEBIMENTO]`, `[NF-DEVOLUCAO]`, `[NF-TRANSPORTE]`).
>
> **Tarefa:** implementar `POST /api/faturamento/faturas/{id}/cancelar` com despacho por
> `invoice_type` e os efeitos da tabela de regras abaixo (copiada da demanda):
>
> - **venda:** cancele a venda ponta a ponta. Descubra a cadeia de NFs/AR da venda
>   (`sale_id` + `parent_invoice_id`/`installment_*`). Para cada item da venda,
>   `estoque_service.registrar_entrada` (use o `unit_cost` da saída original — busque na
>   `stock_movements` da venda). `sales.status = cancelada`. Todas as
>   `accounts_receivable` da venda → `cancelada`. Para valor já recebido, registre
>   `registrar_movimento(SAIDA, AJUSTE, amount=recebido, descrição "Estorno cancelamento NF {number}")`.
>   Reaproveite serviços do Comercial se já houver um "cancelar venda"; senão, implemente no
>   Faturamento orquestrando os services (sem pular camadas).
> - **recebimento:** `registrar_movimento(ENTRADA, AJUSTE, amount=total_amount, ...)` (estorno)
>   e `estoque_service.registrar_saida` das quantidades aceitas (resolva os itens via `order_id`
>   no `notes` → `purchase_order_items`/`purchase_order_receipts`). Ordem permanece `concluida`,
>   AP permanece `paga`.
> - **transporte:** estorno financeiro do `shipping_cost` correspondente (movimento de ajuste
>   inverso). Sem efeito de estoque.
> - **devolucao:** para cada item recusado (via `order_id` → receipts com `quantity_rejected>0`),
>   resolva o `stock_item` original, monte SKU `"{sku}-AVARIADO"`, **busque**; se não existir,
>   crie `stock_item` nome `"{name} (AVARIADO)"`; `registrar_entrada` da `quantity_rejected`.
> - Em todos: marque a NF `cancelada` (+ `cancelled_at`/reason se o DBA criou as colunas),
>   tudo em **uma transação**. Bloqueie se já `cancelada`. Garanta idempotência.
>
> Localize e **reutilize** o padrão de geração de SKU do projeto. Tipagem estrita,
> mensagens em PT, lógica no service, router fino.
>
> **Done quando (smoke tests obrigatórios — cole as saídas):**
> 1. Suba o container (rebuild). Crie uma venda à vista (Comercial) → gera NF venda + AR + baixa estoque.
> 2. `POST /faturas/{id}/cancelar` na NF de venda. Prove com SELECTs:
>    - `SELECT status FROM sales WHERE id=...;` → `cancelada`
>    - `SELECT status FROM accounts_receivable WHERE sale_id=...;` → `cancelada`
>    - `SELECT movement_type, type? quantity FROM stock_movements WHERE reference_id=... ORDER BY created_at;` → entrada de volta
>    - saldo do financeiro coerente.
> 3. Repita o fluxo de compra (produto) até `concluida` (gera NF recebimento). Cancele a NF de
>    recebimento → SELECT mostrando `entrada` financeira de estorno + `saida` de estoque.
> 4. Fluxo com item recusado → NF devolução → cancelar → SELECT mostrando o item
>    `'%-AVARIADO'` em `stock_items` e a entrada correspondente; cancelar de novo **não** duplica.
> 5. NF transporte → cancelar → SELECT do estorno do frete.
> - Atualize `docs/backend/faturamento.md` com o novo endpoint e os efeitos por tipo.

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend**. Leia `/.claude/agents/frontend.md`, a seção "Regras transversais"
> de `docs/refac/README.md`, `docs/frontend/faturamento.md` e os arquivos reais
> `frontend/app/(modules)/faturamento/page.tsx`, `frontend/services/faturamento.ts`,
> `frontend/components/modules/faturamento/FaturaCard.tsx` (e o tipo `Invoice` em `types/index.ts`).
>
> **Tarefa:** expor o cancelamento com estorno na UI para os 4 tipos de NF.
>
> 1. `services/faturamento.ts`: adicione `cancelarFatura(id): Promise<Invoice>` →
>    `POST /api/faturamento/faturas/{id}/cancelar`.
> 2. No `FaturaCard` (ou componente de detalhe), adicione o botão **"Cancelar NF"** com
>    `AlertDialog` de confirmação. O texto do diálogo deve **explicar o efeito conforme o tipo**:
>    - venda: "Isto cancelará a venda, devolverá os produtos ao estoque e cancelará as contas a receber."
>    - recebimento: "Isto estornará o valor e removerá os produtos recebidos do estoque."
>    - transporte: "Isto estornará o valor do frete."
>    - devolucao: "Os produtos voltarão ao estoque como itens AVARIADOS."
>    Detecte o tipo por `invoice.invoice_type`.
> 3. Botão visível quando `status ∈ {emitida, paga}`; oculto/desabilitado se `cancelada`.
> 4. Após sucesso: toast em PT, fechar diálogo, recarregar a lista. Erros do backend exibidos verbatim.
> 5. Se a Demanda 0 já estiver mergeada, **use o `DataTable` paginado** para a lista de faturas
>    (colunas: número, tipo, cliente, emissão, vencimento, total, status, ações). Caso contrário,
>    mantenha os cards e deixe a migração para a Demanda 7.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; cancelamento funcionando
> no browser para os 4 tipos (texto do diálogo correto por tipo). Atualize `docs/frontend/faturamento.md`.
</content>
