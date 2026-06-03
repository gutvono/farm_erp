# Demanda 6 — Compras: Fornecedor (CNPJ/CPF + endereço + CEP) + Catálogo de Fornecedor + Bug de Cotação de Serviço

## Contexto
Três frentes:
1. **Cadastro de fornecedor** mais robusto: validar **CNPJ/CPF** (dígitos verificadores oficiais),
   **separar o endereço** em campos (hoje é um único `suppliers.address VARCHAR(500)`) e integrar
   **busca por CEP** ao digitar.
2. **Catálogo de fornecedor (produto ↔ fornecedor)** — NOVO (decisão D7 do README). Hoje a ordem de
   compra deixa escolher **qualquer** item de estoque de **qualquer** fornecedor, o que permite até
   "comprar" itens AVARIADOS. Passa a existir uma tabela ligando fornecedor ↔ item de estoque com
   **preço por fornecedor**; a compra seleciona o **produto primeiro** e só então os **fornecedores
   que vendem aquele item**. Não temos acesso ao estoque do fornecedor → trata-se o item do catálogo
   como **estoque infinito**.
3. **Bug na aprovação/realização de cotação de SERVIÇO** (produto está ok). Reproduzir via smoke
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
- **Catálogo de fornecedor (`supplier_items`):** tabela ligando **fornecedor ↔ item de estoque** com
  **preço por fornecedor**. Cardinalidade **N:N** (um fornecedor vende vários itens; um item é vendido
  por vários fornecedores). **Estoque infinito:** não modelamos quantidade do fornecedor — havendo
  entrada no catálogo, o item está sempre disponível para comprar.
- **Fluxo de compra invertido (produto-primeiro):** na ordem de compra o usuário escolhe o **item
  primeiro**; o dropdown de **fornecedores** mostra **apenas os que têm aquele item no catálogo**. A
  ordem continua com **um único fornecedor**: ao escolher o fornecedor (após o 1º item), os **demais
  itens** da ordem ficam restritos ao **catálogo desse fornecedor**, com **preço sugerido do catálogo
  (editável)**. Trocar o fornecedor revalida os itens já adicionados.
- **Avariado não é comprável (consequência):** o seletor de itens da compra passa a vir do **catálogo**
  (não mais de "todos os stock_items"). Como ninguém cadastra item `…-AVARIADO` num catálogo, itens
  avariados deixam de aparecer na compra — **resolve a pendência conhecida** sem regra extra.

## Hipótese do bug de cotação de serviço (verificar!)
Em `service.realize_order` (compras), a OP de **serviço** nasce em `aprovada` mas **não** dispara
`concluir-servico` automaticamente; ordens de serviço **não** aparecem em "Recebimentos" e não há
próximo passo óbvio — a OP fica **presa em `aprovada` sem gerar conta a pagar**. Produto segue para
conferência normalmente. **Confirme com smoke test** e corrija (ex.: ao realizar pedido de serviço,
avançar a OP até `aguardando_pagamento` gerando a conta a pagar, espelhando `/concluir-servico`).

## Critérios de aceite
- [ ] Documento de fornecedor validado (CPF/CNPJ) no backend; erro 400 em documento inválido.
- [ ] Endereço em campos separados; CEP autopreenche via ViaCEP no front.
- [ ] Tabela `supplier_items` (produto↔fornecedor + preço) criada; CRUD de catálogo por fornecedor.
- [ ] Ordem de compra: seleção **produto→fornecedor** (só fornecedores que vendem o item); itens
      restritos ao catálogo do fornecedor escolhido; preço sugerido do catálogo.
- [ ] Item AVARIADO (e qualquer item fora do catálogo) **não** é selecionável na compra.
- [ ] Cotação de **serviço** gera ordem que chega a `aguardando_pagamento` com conta a pagar (igual a produto no resultado financeiro).
- [ ] Smoke test do bug documentado (antes/depois).

---

## ▶️ Prompt — Agente DBA

> Você é o **DBA**. Leia `/.claude/agents/dba.md`, `docs/database/schema.md`, a seção
> "Regras transversais" de `docs/refac/README.md` e `backend/app/modules/compras/model.py`.
> `alembic heads` para o head.
>
> **Tarefa A — Endereço do fornecedor:** adicionar os campos de endereço separados em `suppliers`:
> `cep VARCHAR(9) NULL`, `street VARCHAR(255) NULL`, `number VARCHAR(20) NULL`,
> `complement VARCHAR(120) NULL`, `neighborhood VARCHAR(120) NULL`, `city VARCHAR(120) NULL`,
> `state VARCHAR(2) NULL`. Mantenha a coluna `address` existente (compatibilidade) — opcionalmente
> faça backfill copiando `address` para `street` quando possível; documente a decisão.
> Migration idempotente e reversível; `revision id` ≤ 32 chars (`00NN_supplier_address`),
> `down_revision` = head atual.
> Atualize `backend/scripts/seed.sql` para preencher os novos campos nos fornecedores do seed.
>
> **Tarefa B — Tabela de catálogo `supplier_items` (produto↔fornecedor):**
> Crie a tabela ligando fornecedor ↔ item de estoque:
> - `id UUID PK`, `supplier_id UUID NOT NULL FK → suppliers.id`,
>   `stock_item_id UUID NOT NULL FK → stock_items.id`,
>   `unit_price NUMERIC(12,2) NOT NULL` (preço de venda do fornecedor),
>   `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at/updated_at`, `deleted_at NULL` (soft delete).
> - **UNIQUE (`supplier_id`, `stock_item_id`)** entre os ativos (evita duplicar o item no catálogo do
>   mesmo fornecedor); índices nas duas FKs (espelhe os índices no model — regra transversal).
> - **Sem coluna de quantidade** (estoque do fornecedor é tratado como infinito).
> - Migration idempotente/reversível; `revision id` ≤ 32 chars (ex.: `00NN_supplier_items`).
> - Seeds (`seed.sql`): popular o catálogo de forma realista — cada fornecedor com alguns
>   `stock_items` "vendáveis" (NÃO inclua itens `…-AVARIADO`), com preços coerentes, de modo que as
>   ordens de compra do seed continuem válidas (o item da ordem precisa existir no catálogo do
>   fornecedor da ordem).
>
> **Done quando:** `alembic upgrade head` + `alembic check` limpos; `python scripts/reset_db.py` ok;
> `\d suppliers` e `\d supplier_items` no psql (cole); `SELECT count(*) FROM supplier_items;` e um
> `SELECT s.name, si.name, sup_i.unit_price FROM supplier_items sup_i JOIN suppliers s ON s.id=sup_i.supplier_id JOIN stock_items si ON si.id=sup_i.stock_item_id LIMIT 10;`.
> Atualize `docs/database/schema.md` (suppliers + a nova `supplier_items`, com significado de negócio).

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
> **Tarefa B — Catálogo de fornecedor (`supplier_items`) + compra produto-primeiro:**
> A tabela `supplier_items` já existe (Demanda 6 DBA). Camadas Router→Service→Repository.
> 1. **CRUD do catálogo por fornecedor** (item = produto que o fornecedor vende + preço):
>    - `GET /fornecedores/{supplier_id}/itens` (lista o catálogo do fornecedor; paginação se a
>      Demanda 0 estiver disponível), `POST /fornecedores/{supplier_id}/itens`
>      (body: `stock_item_id`, `unit_price`), `PUT /fornecedores/{supplier_id}/itens/{id}`
>      (preço/`is_active`), `DELETE …` (soft delete).
>    - Validar no service: `stock_item` existe; **não** permitir cadastrar item `…-AVARIADO`
>      (rejeitar SKU avariado com 400) nem duplicar item no catálogo do mesmo fornecedor (UNIQUE).
> 2. **Fornecedores que vendem um item** (alimenta o dropdown produto-primeiro):
>    - `GET /compras/produtos/{stock_item_id}/fornecedores` → fornecedores ativos com aquele item no
>      catálogo, retornando `supplier_id`, `supplier_name` e `unit_price` (preço sugerido).
> 3. **Validação na criação da ordem de compra (produto):** todo item da ordem precisa existir no
>    catálogo do `supplier_id` da ordem (senão 400 "Item não disponível no catálogo do fornecedor").
>    Use o `unit_price` do catálogo como sugestão/preço default (o enviado pelo front pode sobrepor;
>    decida e documente). Ordens de **serviço** não usam catálogo (sem `stock_item`).
> 4. **Estoque infinito:** não validar quantidade contra o fornecedor — havendo item no catálogo, a
>    compra é permitida em qualquer quantidade.
>
> **Tarefa C — Corrigir o bug da cotação de serviço:**
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
> - **Catálogo:** `POST /fornecedores/{id}/itens` cadastra item+preço (201); tentar cadastrar um
>   item `…-AVARIADO` → 400; duplicar o mesmo item no fornecedor → 400 (UNIQUE).
>   `GET /compras/produtos/{stock_item_id}/fornecedores` retorna só os fornecedores que vendem o
>   item, com `unit_price` (prove com SELECT no `supplier_items`).
> - **Ordem de compra:** criar ordem cujo item **não** está no catálogo do fornecedor → 400; com item
>   no catálogo → 201 (preço sugerido do catálogo aplicado). Comprovar que item AVARIADO não é
>   cadastrável no catálogo (logo, indisponível na compra).
> - Fluxo completo de cotação de **serviço** até `realizar-pedido`: SELECT mostrando a ordem em
>   `aguardando_pagamento` (ou status correto) e a `accounts_payable` correspondente
>   (`SELECT id,status,amount,purchase_order_id FROM accounts_payable WHERE ...;`).
> - Fluxo de cotação de **produto** continua ok (sem regressão).
> - Atualize `docs/backend/compras.md` (validação, endereço, **catálogo de fornecedor + fluxo
>   produto-primeiro + avariado não-comprável**, e a correção do bug com antes/depois).

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
> 4. **Catálogo do fornecedor (gerência):** na tela/detalhe do fornecedor, uma seção "Itens vendidos"
>    para adicionar/editar/remover itens do catálogo (item de estoque + preço). Dropdown de itens
>    **não** deve oferecer itens `…-AVARIADO`. Tudo via `services/compras.ts` (sem fetch no componente).
> 5. **Ordem de compra — fluxo invertido (produto → fornecedor):** no `OrdemForm`, em cada linha de
>    item o usuário escolhe o **produto primeiro**; então o dropdown de **fornecedores** lista apenas
>    os que vendem aquele item (`GET /compras/produtos/{stock_item_id}/fornecedores`), com **preço
>    sugerido do catálogo** (editável). A ordem tem **um fornecedor**: após o 1º item definir o
>    fornecedor, as demais linhas ficam restritas ao catálogo dele; trocar o fornecedor revalida/limpa
>    os itens incompatíveis (avisar com toast). Itens fora do catálogo (ex.: AVARIADO) simplesmente
>    não aparecem para seleção.
> 6. Cotação de serviço: confirmar no browser que, após o backend corrigido, o fluxo
>    `realizar-pedido` leva a ordem ao estado pagável (ajustar textos/labels se necessário).
> 7. Se a Demanda 0 estiver mergeada, usar `DataTable` na lista de fornecedores.
>
> **Done quando:** `npm run build` + `npm run lint` ok; sem `any`; no browser: documento inválido
> bloqueia o submit, CEP autopreenche endereço, fornecedor salvo com campos separados; catálogo do
> fornecedor gerenciável (sem oferecer avariados); ordem de compra seleciona **produto→fornecedor**
> com preço do catálogo e **não** permite item fora do catálogo; e o fluxo de cotação de serviço
> chega ao pagamento. Atualize `docs/frontend/compras.md` na ótica do usuário (fluxos passo a passo,
> incluindo o novo gerenciamento de catálogo e a seleção produto→fornecedor; marcadores
> `[SCREENSHOT: ...]`).
</content>
