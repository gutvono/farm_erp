# Demanda 7 — Comercial: paridade de cadastro de cliente (CPF/CNPJ + ViaCEP), cancelamento de venda íntegro e aviso de inadimplência

## Contexto
O módulo **Comercial** nunca foi alvo de refac (D1–D6 só o tocaram como *consumidor* de Faturamento/
Financeiro/Estoque). Resultado: ficou cru perto do que Compras/Fornecedor virou na D6. Três frentes:

1. **Cadastro de cliente em paridade com o de fornecedor.** Hoje `clients` valida documento **nenhum**
   (aceita lixo no CPF/CNPJ) e tem endereço como **um único campo livre** `address`. O fornecedor já
   tem validação de documento (dígitos verificadores) e **endereço estruturado + ViaCEP**. O utilitário
   de backend `app/shared/br_documents.py` e os de front `lib/br-documents.ts` + `services/cep.ts` **já
   existem** (D6) e foram escritos para serem reusados aqui — é plugar, não reescrever.

2. **🔴 Buraco de integridade no cancelamento de venda.** Existem hoje DOIS caminhos para uma venda
   chegar a `CANCELADA`: (a) cancelar a **NF** no Faturamento → `cancelar_fatura` → `_cancelar_nf_venda`
   faz o certo (devolve estoque, **cancela toda a cadeia de NFs da venda**, baixa **todas** as contas a
   receber e gera os estornos — D1/D4); (b) `PATCH /vendas/{id}/status` com `CANCELADA` → `update_status`
   **só vira o status no banco, sem estorno nenhum**, deixando estoque baixado, AR em aberto, NF emitida e
   movimento lançado. Estado inconsistente. Precisa ser reconciliado.

3. **Inadimplência decorativa.** `is_delinquent` é um booleano de toggle manual; `create_sale` **não o
   consulta**. Falta o sistema reagir a isso na venda.

Releia: `docs/backend/comercial.md`, `docs/frontend/comercial.md`, e os reais
`backend/app/modules/comercial/{service.py,model.py,schemas.py,repository.py,router.py}`,
`backend/app/modules/faturamento/service.py` (a função pública `cancelar_fatura`),
`frontend/components/modules/comercial/{ClienteForm,ClienteRow,VendaForm,VendaCard}.tsx`,
`frontend/services/comercial.ts`. **Reuse** (D6): `backend/app/shared/br_documents.py`,
`frontend/lib/br-documents.ts`, `frontend/services/cep.ts`, e o `FornecedorForm.tsx` como referência.

## Decisões de produto (TRAVADAS)
- **Documento do cliente:** continua **opcional**; quando informado, precisa ser CPF **ou** CNPJ válido
  (dígitos verificadores oficiais). Validação no **backend** (fonte da verdade) via `validate_document`
  do `br_documents.py`, espelhada no **front** (UX) via `lib/br-documents.ts`. Mesmo padrão do fornecedor.
- **Endereço estruturado:** novas colunas em `clients`: `cep`, `street`, `number`, `complement`,
  `neighborhood`, `city`, `state` (UF, 2 chars). Manter `address` legado (compatibilidade, sem parsing/
  backfill — mesma decisão do fornecedor na D6). **ViaCEP no front** (blur do CEP), best-effort, sem
  travar o form. Sem dependência nova no backend.
- **Cancelamento de venda = UM motor só (o do Faturamento).** Decisão de PO ("o que um ERP profissional
  faz"): cancelamento é evento fiscal, ancorado na NF. Portanto:
  - `PATCH /vendas/{id}/status` **deixa de aceitar `CANCELADA`** (transição inválida → 400 com mensagem
    em PT explicando que o cancelamento é feito pela ação "Cancelar venda").
  - Cria-se uma **ação "Cancelar venda"** no Comercial que **delega ao motor do Faturamento**
    (`cancelar_fatura`), que já estorna estoque, cancela **toda a cadeia de NFs** da venda, baixa
    **todas** as contas a receber e cancela a venda. Tratar o caso **parcelado** (uma venda tem N NFs):
    o motor já marca toda a cadeia pelo `sale_id` — o Backend deve **confirmar isso por smoke test** e,
    se necessário, localizar a NF da venda para acionar o motor uma única vez (sem duplicar estorno).
  - Cancelamento continua **irreversível** (status final, regra transversal).
- **Inadimplência = AVISAR, não bloquear** (decisão do usuário). `create_sale` **conclui a venda
  normalmente** mesmo para cliente inadimplente — o backend **não** recusa. O **front** exibe um
  aviso/confirmação antes de finalizar a venda quando o cliente está `is_delinquent`. (Automatizar a
  flag a partir de AR vencida fica **fora de escopo** desta demanda.)

## Critérios de aceite
- [ ] Documento de cliente validado no backend (CPF/CNPJ, dígitos verificadores); 400 em documento inválido; opcional quando ausente.
- [ ] `clients` com endereço estruturado; CEP autopreenche via ViaCEP no front; `address` legado preservado.
- [ ] `PATCH /vendas/{id}/status` recusa `CANCELADA` (400); o status só muda para estados válidos.
- [ ] Ação "Cancelar venda" cancela ponta a ponta (estoque devolvido, **todas** as NFs da venda canceladas, **todas** as contas a receber baixadas, estornos gerados) — provado para venda à vista **e** parcelada.
- [ ] Venda para cliente inadimplente é **concluída** pelo backend; o front **avisa** antes de finalizar.
- [ ] Smoke tests com SELECT no container provando estoque/AR/NF antes e depois do cancelamento.

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md`, a seção "Regras
> transversais" de `docs/refac/README.md` e `backend/app/modules/comercial/model.py`. `alembic heads`
> para o head atual.
>
> **Tarefa — Endereço estruturado do cliente:** adicionar à tabela `clients` os campos de endereço
> separados, espelhando o que a Demanda 6 fez em `suppliers`:
> `cep VARCHAR(9) NULL`, `street VARCHAR(255) NULL`, `number VARCHAR(20) NULL`,
> `complement VARCHAR(120) NULL`, `neighborhood VARCHAR(120) NULL`, `city VARCHAR(120) NULL`,
> `state VARCHAR(2) NULL`. **Mantenha** a coluna `address` existente (compatibilidade) — **sem** backfill
> por parsing (mesma decisão da D6; documente). Reflita as colunas no model `Client`.
> Migration **idempotente e reversível** (downgrade testado); `revision id` ≤ 32 chars
> (ex.: `00NN_client_address`), `down_revision` = head atual. Após `upgrade head`, `alembic check` deve
> dizer *No new upgrade operations detected*.
> Atualize `backend/scripts/seed.sql` para preencher os novos campos nos clientes do seed (endereços BR
> realistas e coerentes), de forma que `python scripts/reset_db.py` / `make reset-db` siga funcionando.
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `reset_db` ok; `\d clients` no psql
> (cole); `SELECT id, name, cep, street, city, state FROM clients LIMIT 5;` (cole). Atualize
> `docs/database/schema.md` (tabela `clients` com os novos campos e significado de negócio).

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend**. Leia `/.claude/agents/backend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/backend/comercial.md`, `docs/backend/faturamento.md` e os reais
> `backend/app/modules/comercial/*` e `backend/app/modules/faturamento/service.py`. Os campos de
> endereço do cliente já existem (Demanda 7 DBA). **Não reescreva** validação de documento: reuse
> `app/shared/br_documents.py` (mesmo util do fornecedor). Camadas Router→Service→Repository.
>
> **Tarefa A — Documento + endereço do cliente:**
> 1. `ClientCreate/ClientUpdate`: validar `document` com `validate_document` (400 "CPF/CNPJ inválido"
>    quando informado e inválido; permanece **opcional**). Espelhe o padrão `_validate_document_or_400`
>    do `compras/service.py` (a validação fica no **Service**, não no schema, para manter a régua do
>    projeto). Adicionar os campos de endereço (`cep, street, number, complement, neighborhood, city,
>    state`) aos schemas de entrada e ao `ClientOut`.
>
> **Tarefa B — Cancelamento de venda íntegro (UM motor):**
> 1. **Bloquear o caminho pelado:** em `update_status`, recusar a transição para `SaleStatus.CANCELADA`
>    com **400** e mensagem em PT (ex.: "Para cancelar uma venda use a ação 'Cancelar venda', que estorna
>    estoque e financeiro."). As demais transições válidas continuam.
> 2. **Ação "Cancelar venda":** novo endpoint (ex.: `POST /vendas/{sale_id}/cancelar`, body com `reason`
>    opcional) → Service do Comercial que **delega ao Faturamento** chamando `cancelar_fatura` para a(s)
>    NF(s) da venda. **Investigue e prove** que `_cancelar_nf_venda` já cancela toda a cadeia pelo
>    `sale_id` (estoque + todas as NFs + todas as contas a receber + cancela a `Sale`): se sim, basta
>    localizar **uma** NF de venda do `sale_id` e acionar o motor **uma vez** (sem duplicar estorno); se a
>    venda tiver alguma borda não coberta (ex.: venda sem NF — não deveria ocorrer, pois `create_sale`
>    sempre emite), trate com 4xx claro. **Não** crie um segundo motor de estorno no Comercial.
> 3. Idempotência: cancelar uma venda já cancelada é no-op/4xx claro (não estorna duas vezes).
>
> **Tarefa C — Inadimplência (avisar, não bloquear):**
> 1. `create_sale` **não** deve recusar venda para cliente inadimplente — comportamento atual de concluir
>    a venda permanece. Garanta apenas que o `is_delinquent` do cliente é **exposto** onde o front
>    precise decidir avisar (ex.: no `ClientOut`/listagem de clientes e/ou no retorno relevante). **Sem**
>    regra de bloqueio no backend.
>
> **Done quando (smoke tests — cole as saídas):**
> - `POST /clientes` com CPF inválido → 400; com CPF/CNPJ válido → 201 com endereço estruturado; sem
>   documento → 201 (opcional). `PUT /clientes/{id}` idem.
> - `PATCH /vendas/{id}/status` com `CANCELADA` → 400 (mensagem em PT).
> - **Cancelar venda À VISTA:** criar venda, capturar estoque/AR/NF (SELECT antes), `POST
>   /vendas/{id}/cancelar`, e provar (SELECT depois): item voltou ao estoque (`stock_movements` de
>   entrada/estorno), NF(s) `cancelada`, conta(s) a receber canceladas, venda `Cancelada`, movimentos de
>   estorno gerados. Cole os `SELECT … FROM stock_movements/invoices/accounts_receivable WHERE …`.
> - **Cancelar venda PARCELADA (≥2x):** mesma prova, confirmando que **TODAS** as NFs e **TODAS** as
>   contas a receber da venda foram canceladas (não sobra parcela em aberto).
> - Cancelar de novo a mesma venda → no-op/4xx (sem segundo estorno).
> - Venda para cliente `is_delinquent=true` → **201** (não bloqueia).
> - Atualize `docs/backend/comercial.md` (validação de documento, endereço, **a nova ação de cancelamento
>   e a transição CANCELADA bloqueada no status**, inadimplência = avisar) e ajuste `docs/backend/
>   faturamento.md` se o contrato de cancelamento ficou mais explícito.

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend**. Leia `/.claude/agents/frontend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/frontend/comercial.md` e os reais
> `frontend/components/modules/comercial/{ClienteForm,ClienteRow,VendaForm,VendaCard}.tsx`,
> `frontend/services/comercial.ts` e o tipo `Client`/`Cliente` em `types/`. **Reuse** (D6, não
> reescreva): `frontend/lib/br-documents.ts` (`validateDocument`, `maskDocument`, `maskCep`) e
> `frontend/services/cep.ts` (`lookupCep`). Use o `FornecedorForm.tsx` como **referência de padrão**.
>
> **Tarefa A — `ClienteForm` em paridade com `FornecedorForm`:**
> 1. O tipo do cliente ganha os campos de endereço (`cep, street, number, complement, neighborhood,
>    city, state`).
> 2. RHF + Zod: validar `document` (CPF/CNPJ) no client espelhando o backend (reuse `validateDocument`);
>    mensagem em PT; documento **opcional** (vazio passa). Máscaras de CPF/CNPJ e CEP.
> 3. Campos de endereço separados; no **blur do CEP** (8 dígitos) chamar `lookupCep` e autopreencher
>    `street/neighborhood/city/state` (toast "CEP não encontrado" quando `null`; sem travar o form se a
>    rede falhar; manter editável). Tudo via `services/comercial.ts` (sem fetch no componente).
> 4. `ClienteRow`/detalhe: exibir o endereço composto a partir dos campos.
>
> **Tarefa B — Cancelar venda (ação real, no lugar do status):**
> 1. Remover a opção **"Cancelada"** de qualquer Select/fluxo de troca de status da venda (espelha o que
>    a D1 fez no Faturamento). O cancelamento deixa de ser uma mudança de status na UI.
> 2. Adicionar uma ação **"Cancelar venda"** (botão no `VendaCard`/detalhe) com **AlertDialog** de
>    confirmação (texto deixando claro que estorna estoque e financeiro e é irreversível; `reason`
>    opcional) → chama `services/comercial.ts` → novo endpoint `POST /vendas/{id}/cancelar`. Toast de
>    sucesso/erro; refletir o novo status `Cancelada` na lista.
>
> **Tarefa C — Aviso de inadimplência na venda:**
> 1. No `VendaForm`, ao selecionar um cliente com `is_delinquent`, exibir **aviso visível** (badge/alerta)
>    e, ao finalizar, um **AlertDialog de confirmação** ("Cliente inadimplente — deseja continuar?").
>    Confirmar **prossegue** com a venda (o backend não bloqueia). Não impedir a venda.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; no browser: documento inválido bloqueia
> o submit, CEP autopreenche o endereço, cliente salvo com campos separados; a venda **não** oferece mais
> "Cancelada" no status e o botão "Cancelar venda" estorna ponta a ponta (conferir estoque/financeiro
> atualizados na UI); vender para cliente inadimplente mostra o aviso e exige confirmação, mas conclui.
> Atualize `docs/frontend/comercial.md` na ótica do usuário (cadastro de cliente com CEP, cancelamento de
> venda, aviso de inadimplência; marcadores `[SCREENSHOT: ...]`).
</content>
