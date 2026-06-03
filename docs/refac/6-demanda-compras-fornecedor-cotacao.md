# Demanda 6 — Compras: Cadastro de Fornecedor (CNPJ/CPF + endereço + CEP) e Bug de Cotação de Serviço

## Contexto
Duas frentes:
1. **Cadastro de fornecedor** mais robusto: validar **CNPJ/CPF** (dígitos verificadores oficiais),
   **separar o endereço** em campos (hoje é um único `suppliers.address VARCHAR(500)`) e integrar
   **busca por CEP** ao digitar.
2. **Bug na aprovação/realização de cotação de SERVIÇO** (produto está ok). Reproduzir via smoke
   test e corrigir.

Releia: `docs/backend/compras.md` (inclui a seção Cotações), `docs/frontend/compras.md`, e os reais
`backend/app/modules/compras/{service.py,model.py,schemas.py,repository.py,router.py}`,
`frontend/components/modules/compras/{FornecedorForm,FornecedorRow,CotacaoCard,RealizeOrderModal}.tsx`.

## Decisões de produto (TRAVADAS)
- **CEP:** usar **ViaCEP** (`https://viacep.com.br/ws/{cep}/json/`) — **gratuito, sem API key,
  sem custo**. Chamada no **frontend** (no blur do CEP) para autopreencher logradouro/bairro/
  cidade/UF; o usuário pode editar. Sem dependência nova no backend.
- **Endereço separado** (novas colunas em `suppliers`): `cep`, `street` (logradouro), `number`,
  `complement`, `neighborhood` (bairro), `city`, `state` (UF, 2 chars). Manter `address` legado
  como derivado/composto opcional ou descontinuar (ver DBA).
- **Validação de documento:** CPF (11 dígitos) ou CNPJ (14 dígitos) com **dígitos verificadores
  oficiais**, no **backend** (fonte da verdade) e espelhada no **frontend** (UX). Utilitário
  reutilizável (poderá servir ao Comercial/clientes depois — fora de escopo agora).

## Hipótese do bug de cotação de serviço (verificar!)
Em `service.realize_order` (compras), a OP de **serviço** nasce em `aprovada` mas **não** dispara
`concluir-servico` automaticamente; ordens de serviço **não** aparecem em "Recebimentos" e não há
próximo passo óbvio — a OP fica **presa em `aprovada` sem gerar conta a pagar**. Produto segue para
conferência normalmente. **Confirme com smoke test** e corrija (ex.: ao realizar pedido de serviço,
avançar a OP até `aguardando_pagamento` gerando a conta a pagar, espelhando `/concluir-servico`).

## Critérios de aceite
- [ ] Documento de fornecedor validado (CPF/CNPJ) no backend; erro 400 em documento inválido.
- [ ] Endereço em campos separados; CEP autopreenche via ViaCEP no front.
- [ ] Cotação de **serviço** gera ordem que chega a `aguardando_pagamento` com conta a pagar (igual a produto no resultado financeiro).
- [ ] Smoke test do bug documentado (antes/depois).

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md`, a seção
> "Regras transversais" de `docs/refac/README.md` e `backend/app/modules/compras/model.py`.
> `alembic heads` para o head.
>
> **Tarefa:** adicionar os campos de endereço separados em `suppliers`:
> `cep VARCHAR(9) NULL`, `street VARCHAR(255) NULL`, `number VARCHAR(20) NULL`,
> `complement VARCHAR(120) NULL`, `neighborhood VARCHAR(120) NULL`, `city VARCHAR(120) NULL`,
> `state VARCHAR(2) NULL`. Mantenha a coluna `address` existente (compatibilidade) — opcionalmente
> faça backfill copiando `address` para `street` quando possível; documente a decisão.
> Migration idempotente e reversível; `revision id` ≤ 32 chars (`00NN_supplier_address`),
> `down_revision` = head atual.
> Atualize `backend/scripts/seed.sql` para preencher os novos campos nos fornecedores do seed.
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `python scripts/reset_db.py` ok;
> `\d suppliers` no psql (cole). Atualize `docs/database/schema.md`.

---

## ▶️ Prompt — Agente BACKEND

> Você é o **Backend**. Leia `/.claude/agents/backend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/backend/compras.md` e os reais `backend/app/modules/compras/*`.
> Os campos de endereço já existem (Demanda 6 DBA).
>
> **Tarefa A — Validação de documento + endereço:**
> 1. Crie um utilitário reutilizável (ex.: `backend/app/shared/br_documents.py`) com
>    `is_valid_cpf(value) -> bool`, `is_valid_cnpj(value) -> bool`, `validate_document(value)`
>    (aceita CPF **ou** CNPJ, ignora máscara, valida dígitos verificadores oficiais).
> 2. `SupplierCreate/Update`: validar `document` com esse utilitário (400 "CNPJ/CPF inválido" se
>    falhar). Adicionar os campos de endereço separados (`cep, street, number, complement,
>    neighborhood, city, state`) aos schemas e ao `SupplierOut`.
> 3. Não chamar ViaCEP no backend (a busca é no front).
>
> **Tarefa B — Corrigir o bug da cotação de serviço:**
> 1. **Reproduza primeiro** (smoke test): crie uma cotação de serviço, adicione proposta com
>    `total_price`, selecione vencedor, aprove no financeiro, e `realizar-pedido`. Observe o
>    estado final da ordem gerada e se existe `accounts_payable`. Documente o comportamento atual.
> 2. Corrija para que a cotação de serviço resulte numa ordem que chega a `aguardando_pagamento`
>    com **conta a pagar gerada** (propagando `payment_method`/parcelamento se aplicável),
>    equivalente ao resultado de uma ordem de serviço normal pós-`/concluir-servico`. Não duplicar
>    movimentações financeiras. Garanta que produto continua funcionando (sem regressão).
>
> **Done quando (smoke tests — cole as saídas):**
> - `POST /fornecedores` com CNPJ inválido → 400; com CNPJ válido → 201, com endereço separado.
> - Fluxo completo de cotação de **serviço** até `realizar-pedido`: SELECT mostrando a ordem em
>   `aguardando_pagamento` (ou status correto) e a `accounts_payable` correspondente
>   (`SELECT id,status,amount,purchase_order_id FROM accounts_payable WHERE ...;`).
> - Fluxo de cotação de **produto** continua ok (sem regressão).
> - Atualize `docs/backend/compras.md` (validação, endereço, e a correção do bug com antes/depois).

---

## ▶️ Prompt — Agente FRONTEND

> Você é o **Frontend**. Leia `/.claude/agents/frontend.md`, a seção "Regras transversais" de
> `docs/refac/README.md`, `docs/frontend/compras.md` e os reais
> `frontend/components/modules/compras/{FornecedorForm,FornecedorRow}.tsx`, `frontend/services/compras.ts`,
> e o tipo `Supplier` em `types/`.
>
> **Tarefa:**
> 1. `Supplier` ganha os campos de endereço separados (`cep, street, number, complement,
>    neighborhood, city, state`).
> 2. `FornecedorForm` (RHF + Zod):
>    - Validação de `document` (CPF/CNPJ) no client espelhando o backend (dígitos verificadores);
>      mensagem em PT. Reaproveite/escreva um util `lib/br-documents.ts`.
>    - Campos de endereço separados. Ao sair do campo **CEP** (blur, 8 dígitos), chamar **ViaCEP**
>      (`https://viacep.com.br/ws/{cep}/json/`) e autopreencher `street/neighborhood/city/state`
>      (tratar `erro: true` com toast "CEP não encontrado"; manter editável). Sem travar o form se a API falhar.
>    - Máscaras de CPF/CNPJ e CEP (UX).
> 3. `FornecedorRow`/detalhe: exibir o endereço composto a partir dos campos.
> 4. Cotação de serviço: confirmar no browser que, após o backend corrigido, o fluxo
>    `realizar-pedido` leva a ordem ao estado pagável (ajustar textos/labels se necessário).
> 5. Se a Demanda 0 estiver mergeada, usar `DataTable` na lista de fornecedores.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; no browser: documento inválido
> bloqueia o submit, CEP autopreenche endereço, fornecedor salvo com campos separados, e o fluxo de
> cotação de serviço chega ao pagamento. Atualize `docs/frontend/compras.md`.
</content>
