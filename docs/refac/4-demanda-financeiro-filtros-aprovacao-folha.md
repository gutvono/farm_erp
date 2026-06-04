# Demanda 4 — Financeiro: Filtros Avançados + Aprovação da Folha + NF de Folha

## Contexto
Duas frentes no mesmo módulo:

**(I) Filtros avançados.** Hoje contas a pagar/receber e movimentações têm filtros simples
(ver `docs/backend/financeiro.md` / `docs/frontend/financeiro.md`). O cliente quer:
ordenação por **data e valores**, **filtro de texto**, **data**, **tipo de movimentação** e **status**.

**(II) Aprovação da Folha.** Toda movimentação financeira do sistema passa por aprovação do
Financeiro — **exceto a Folha**, onde "Pagar funcionário" tira dinheiro direto da conta. Vamos
alinhar a Folha ao mesmo padrão das compras: pagar gera **solicitação de aprovação**; o
Financeiro aprova; só então o dinheiro sai e é emitida **uma NF de folha por funcionário**.

Releia: `docs/backend/{financeiro,folha,faturamento}.md`, `docs/frontend/{financeiro,folha}.md`,
e os reais `backend/app/modules/financeiro/*`, `backend/app/modules/folha/*`,
`backend/app/modules/faturamento/service.py`, `frontend/app/(modules)/financeiro/page.tsx`,
`frontend/app/(modules)/folha/page.tsx`. Veja como a aba **Aprovações** do Financeiro já trata
ordens de compra/cotações (`aguardando_aprovacao_financeiro`) para **espelhar o padrão**.

## Objetivo
1. Filtros/ordenação completos em **contas a pagar**, **contas a receber** e **movimentações**.
2. Novo fluxo de **aprovação de pagamento de folha** (individual e em lote).
3. Novo tipo de NF **`folha_pagamento`** (uma por funcionário), gerada na aprovação.

## Decisões de produto (TRAVADAS)
Fluxo de pagamento da Folha:
1. Abrir período (já existe).
2. "Pagar funcionário" (individual) **ou** "Pagar todos" (lote).
3. **Individual:** cria uma solicitação com aquele holerite; o botão daquele funcionário fica
   **bloqueado** (entry → `aguardando_aprovacao`); vai para a aba Aprovações do Financeiro.
4. **Lote:** cria **uma** solicitação com todos os holerites pendentes; **todos** os botões
   individuais ficam bloqueados; aparece **uma** aprovação no Financeiro com o montante total.
5. Financeiro **aprova** → valida saldo do montante; para cada holerite: gera movimento
   `saida/folha`, marca `pago`, e **emite NF `folha_pagamento`** (1 por funcionário). Marca a
   solicitação como `aprovada`.
6. Financeiro **recusa** (com motivo) → holerites voltam a `pendente`, botões liberam.

- **Validação de saldo na aprovação:** o saldo precisa cobrir o **total da solicitação**;
  caso contrário, recusar a aprovação com 400 (sem pagamento parcial — é uma aprovação única).
- **NF de folha:** `invoice_type = "folha_pagamento"`, `client_id = NULL`, `total_amount =
  net_amount` do holerite, 1 item ("Salário MM/AAAA — {funcionário}"). Vínculo ao holerite via
  `notes` no padrão `[NF-FOLHA] entry_id=<uuid> employee=<nome>` (mesmo estilo das NFs de compras).
- **Fora de escopo:** cancelamento de NF de folha (a Demanda 1 cobriu venda/recebimento/
  transporte/devolução). Registrar como melhoria futura.

## Critérios de aceite
- [ ] Contas a pagar/receber e movimentações com filtros (texto, data, tipo, status) + ordenação por data/valor, paginados (infra Demanda 0).
- [ ] Pagamento individual e em lote viram **solicitação de aprovação**; botões bloqueiam corretamente.
- [ ] Aba Aprovações do Financeiro lista as solicitações de folha; aprovar/recusar funciona.
- [ ] Aprovar gera 1 movimento `saida/folha` + 1 NF `folha_pagamento` por funcionário e marca holerites `pago`.
- [ ] Recusar devolve holerites a `pendente`.
- [ ] Fechar período continua exigindo todos os holerites `pago`.

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md`, a seção
> "Regras transversais" de `docs/refac/README.md` e os models de `folha`, `financeiro`, `faturamento`.
>
> **Tarefa:**
> 1. `alembic heads` para confirmar o head.
> 2. **Enum `payroll_entry_status`:** adicione o valor `aguardando_aprovacao`
>    (use `ALTER TYPE ... ADD VALUE` em bloco autocommit; idempotente). Fluxo passa a ser
>    `pendente → aguardando_aprovacao → pago` (+ volta a `pendente` na recusa).
> 3. Crie **`payroll_payment_requests`**: `id UUID PK`, `payroll_period_id UUID FK → payroll_periods`,
>    `request_type VARCHAR(12)` (`individual`|`lote`), `status VARCHAR(40)` default
>    `aguardando_aprovacao_financeiro` (`aprovada`/`recusada`), `total_amount NUMERIC(12,2)`,
>    `approval_note TEXT NULL`, `requested_at TIMESTAMPTZ`, `decided_at TIMESTAMPTZ NULL`,
>    timestamps, `deleted_at`. Índices em `payroll_period_id` e `status`.
> 4. Crie **`payroll_payment_request_entries`** (junção): `id UUID PK`,
>    `payment_request_id UUID FK (CASCADE)`, `payroll_entry_id UUID FK → payroll_entries`,
>    timestamps. UNIQUE (`payment_request_id`, `payroll_entry_id`); índices nas FKs.
> 5. `invoices.invoice_type` já é `VARCHAR(50)` — **sem migration** para o tipo `folha_pagamento`
>    (é só um novo valor de string). Confirme isso no model e documente.
> 6. `revision id` ≤ 32 chars (`00NN_payroll_approval`), `down_revision` = head atual; reversível.
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `\d payroll_payment_requests`,
> `\d payroll_payment_request_entries` no psql (cole). Atualize `docs/database/schema.md`.

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend**. Leia `/.claude/agents/backend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/backend/{financeiro,folha,faturamento}.md` e os reais
> `backend/app/modules/{financeiro,folha,faturamento}/*`. Veja como compras dispara aprovação
> financeira (`aguardando_aprovacao_financeiro`) para **espelhar o padrão**. As tabelas de
> solicitação **já existem** (Demanda 4 DBA).
>
> **Parte I — Filtros avançados** (sobre a infra `Page[T]` da Demanda 0):
> - `GET /contas-pagar` e `GET /contas-receber`: filtros `status`, `search` (ILIKE em
>   `number`/`description`/nome do fornecedor ou cliente), `due_after`/`due_before`,
>   ordenação por `due_date`/`amount`/`created_at`. Retornar `Page[T]`.
> - `GET /movimentacoes`: filtros `movement_type`, `category`, `source_module`, `search`
>   (ILIKE em `description`), `start_date`/`end_date` (sobre `occurred_at`), ordenação por
>   `occurred_at`/`amount`. Retornar `Page[T]`.
>
> **Parte II — Aprovação da Folha:**
> - **Folha:** substitua o pagamento direto. Crie:
>   - `POST /api/folha/entries/{id}/solicitar-pagamento` (individual): valida entry `pendente`,
>     cria `payroll_payment_request` (`individual`, `total = net_amount`) + junção, move entry → `aguardando_aprovacao`.
>   - `POST /api/folha/periodos/{id}/solicitar-pagamento-todos` (lote): pega todas as entries
>     `pendente` do período, cria **uma** request (`lote`, total = soma), move todas → `aguardando_aprovacao`.
>   - Os antigos `/entries/{id}/pagar` e `/periodos/{id}/pagar-todos` devem deixar de tirar
>     dinheiro direto — remova-os ou redirecione para as novas rotas de solicitação (documente a escolha).
>   - Bloqueie nova solicitação para entry já em `aguardando_aprovacao`/`pago`.
> - **Financeiro:** exponha a fila e a decisão:
>   - `GET /api/financeiro/aprovacoes-folha` → solicitações `aguardando_aprovacao_financeiro`
>     (com período, tipo, total, e nomes/holerites incluídos).
>   - `POST /api/financeiro/aprovacoes-folha/{id}/aprovar`: valida `get_balance >= total`
>     (senão 400 "Saldo insuficiente..."); para cada entry da request: `registrar_movimento(SAIDA,
>     FOLHA, amount=net_amount, source_module="folha", reference_id=entry.id)`, marca `pago`+`paid_at`,
>     e chama `faturamento.criar_nota_folha(db, entry, period)`. Marca request `aprovada`+`decided_at`. Transação.
>   - `POST /api/financeiro/aprovacoes-folha/{id}/recusar` (body `{note}`): entries → `pendente`,
>     request `recusada`+nota. Sem movimento financeiro.
> - **Faturamento:** crie `criar_nota_folha(db, entry, period) -> Invoice`:
>   `invoice_type="folha_pagamento"`, `client_id=None`, `total_amount=net_amount`, 1 item
>   `"Salário MM/AAAA — {employee_name}"`, `notes="[NF-FOLHA] entry_id=<uuid> employee=<nome>"`,
>   e registra `financial_movement` de R$0 para rastreabilidade (o débito real é o `saida/folha`
>   lançado pelo Financeiro). Import lazy para evitar ciclo.
> - Fechar período continua exigindo todos `pago`.
>
> **Done quando (smoke tests — cole as saídas):**
> 1. Abrir período (seed tem 03/2026 aberta). Solicitar pagamento individual de 1 holerite →
>    `SELECT status FROM payroll_entries WHERE id=...;` → `aguardando_aprovacao`;
>    `SELECT * FROM payroll_payment_requests;` mostrando a request.
> 2. Aprovar no Financeiro → `SELECT status,paid_at FROM payroll_entries WHERE id=...;` → `pago`;
>    `SELECT invoice_type,total_amount,notes FROM invoices WHERE invoice_type='folha_pagamento';`;
>    movimento `saida/folha` em `financial_movements`; saldo coerente.
> 3. Solicitar **lote**, recusar → todas as entries voltam a `pendente`.
> 4. Filtros: `GET /contas-pagar?search=...&order_by=amount&order_dir=desc&page=1&page_size=10` e
>    `GET /movimentacoes?start_date=...&end_date=...&category=folha`.
> - Atualize `docs/backend/{financeiro,folha,faturamento}.md`.

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend**. Leia `/.claude/agents/frontend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/frontend/{financeiro,folha}.md` e os reais
> `frontend/app/(modules)/{financeiro,folha}/page.tsx`, `frontend/services/{financeiro,folha}.ts`,
> e os componentes de folha (`EntryRow`, `PagarTodosButton`) e de aprovações do financeiro.
>
> **Parte I — Filtros (Financeiro):** nas abas Contas a Pagar, Contas a Receber e Movimentações,
> use `DataTable` (Demanda 0) com: busca textual, filtro de status (pagar/receber), filtro de
> tipo/categoria e intervalo de datas (movimentações), e ordenação por data/valor — tudo
> server-side e paginado.
>
> **Parte II — Aprovação da Folha:**
> - **Folha:** os botões "Pagar" (individual) e "Pagar Todos" passam a chamar
>   `solicitarPagamento(entryId)` / `solicitarPagamentoTodos(periodId)`. Quando a entry está
>   `aguardando_aprovacao`, o botão fica **bloqueado** com rótulo "Aguardando aprovação do
>   financeiro" (badge). No lote, todos os botões individuais bloqueiam. Toast explicando que
>   foi enviado para aprovação.
> - **Financeiro → aba Aprovações:** adicione a seção **"Pagamentos de Folha Aguardando Aprovação"**
>   (abaixo de Ordens/Cotações), via `getAprovacoesFolha()`. Cada card: período, tipo (individual/lote),
>   total, lista de funcionários. Botões **Aprovar** (AlertDialog; mostra total e avisa que gera NF
>   por funcionário) e **Recusar** (Dialog com motivo obrigatório). Atualizar o badge contador da aba.
> - `services/folha.ts` e `services/financeiro.ts`: novas funções. Tipos para `PayrollPaymentRequest`.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; no browser: solicitar pagamento
> individual e lote (botões bloqueiam), aprovar no Financeiro (holerites viram pago, NFs aparecem em
> Faturamento), recusar (voltam a pendente), e filtros funcionando nas 3 abas. Atualize
> `docs/frontend/{financeiro,folha}.md`.
</content>
