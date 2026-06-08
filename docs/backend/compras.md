# Backend Module: Compras

## Overview

Módulo responsável pelo cadastro de fornecedores e gestão de ordens de compra. A ordem passa por aprovação financeira e conferência item a item no recebimento. A partir da Demanda 1.1, a **entrada no Estoque e as notas fiscais** (recebimento/devolução/transporte para produto; serviço no aceite) são geradas no momento da **conferência** (ou do `/concluir-servico`), não mais no pagamento. O pagamento da(s) conta(s) a pagar apenas **liquida** a obrigação; a ordem é **concluída automaticamente** quando não resta nenhuma conta a pagar em aberto (no parcelado, só na última parcela). Integra com Estoque (entrada apenas dos itens aceitos), Financeiro (conta a pagar + movimentações) e Faturamento (NF de recebimento, devolução, transporte e serviço).

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Fornecedores

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/compras/fornecedores` | Lista fornecedores **paginada `Page[SupplierOut]`** (`search` nome/documento; `order_by`: `name`). Dívida da D6 quitada na D8 — antes era `SuccessResponse`/skip-limit |
| `POST` | `/api/compras/fornecedores` | Cria fornecedor. Valida o `document` (CPF/CNPJ); `400 "CNPJ/CPF inválido"` se inválido |
| `GET` | `/api/compras/fornecedores/{id}` | Detalhe do fornecedor (inclui endereço estruturado) |
| `PUT` | `/api/compras/fornecedores/{id}` | Atualiza fornecedor. Se `document` vier no corpo, é revalidado (`400` se inválido) |
| `DELETE` | `/api/compras/fornecedores/{id}` | Soft delete do fornecedor |

### Catálogo do fornecedor (Supplier Items)

Catálogo é a lista de **itens de estoque que um fornecedor vende, com preço sugerido**. Não tem quantidade — o estoque do fornecedor é tratado como **infinito**. A compra **direta** de produto só é permitida para itens presentes no catálogo **ativo** do fornecedor da ordem (ver "Validações na Criação").

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/compras/fornecedores/{supplier_id}/itens` | Lista o catálogo **ativo** do fornecedor, **paginado** (`Page[SupplierItemOut]` — envelope cru, `page`/`page_size`/`order_by`/`order_dir`/`search`). `order_by` aceito: `stock_item_name`, `unit_price`, `created_at`. `search` casa nome **ou** SKU do item |
| `POST` | `/api/compras/fornecedores/{supplier_id}/itens` | Adiciona item ao catálogo (corpo: `stock_item_id`, `unit_price > 0`). `201` |
| `PUT` | `/api/compras/fornecedores/{supplier_id}/itens/{item_id}` | Atualiza `unit_price` e/ou `is_active` |
| `DELETE` | `/api/compras/fornecedores/{supplier_id}/itens/{item_id}` | Soft delete do item do catálogo |

**Mensagens de erro (catálogo):**
- `404 "Fornecedor não encontrado"` — `supplier_id` inexistente/deletado.
- `404 "Item de estoque não encontrado: {id}"` — `stock_item_id` inexistente.
- `400 "Item avariado não pode entrar no catálogo"` — o item é avariado (SKU termina em `-AVARIADO`).
- `400 "Item já cadastrado no catálogo deste fornecedor"` — já existe esse item **ativo** no catálogo (viola a UNIQUE parcial `uq_supplier_items_supplier_stock_active`).
- `404 "Item do catálogo não encontrado"` — `item_id` não pertence ao fornecedor ou está deletado.

### Compra produto-primeiro

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/compras/produtos/{stock_item_id}/fornecedores` | Lista os fornecedores **ativos** que têm aquele item no catálogo **ativo**, retornando `supplier_id`, `supplier_name` e `unit_price` (preço sugerido). Alimenta o dropdown "escolha o item → veja quem vende". `404` se o item de estoque não existir |

### Ordens de Compra

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/compras/ordens` | Lista ordens **paginada `Page[PurchaseOrderOut]`** (filtros `status`, `supplier_id`; `search` nome/documento do fornecedor; `order_by`: `ordered_at`/`status`) |
| `POST` | `/api/compras/ordens` | Cria ordem com itens (status inicial: `em_andamento`) |
| `GET` | `/api/compras/ordens/{id}` | Detalhe da ordem com itens |
| `PATCH` | `/api/compras/ordens/{id}/status` | **Legacy** — restrito a cancelamento. Use os endpoints dedicados do fluxo para as demais transições |
| `POST` | `/api/compras/ordens/{id}/concluir-servico` | Apenas ordens de serviço (`order_type="servico"`) em status `aprovada`: muda para `aguardando_pagamento`, **emite a NF de serviço** (`invoice_type="servico"`) e gera a conta a pagar com o `payment_method` da ordem |
| `DELETE` | `/api/compras/ordens/{id}` | Soft delete (somente se `em_andamento`) |

### Fluxo de Aprovação e Conferência

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/compras/ordens/{id}/enviar-aprovacao` | `em_andamento` → `aguardando_aprovacao_financeiro` |
| `POST` | `/api/compras/ordens/{id}/aprovar` | `aguardando_aprovacao_financeiro` → `aprovada` (body define `payment_method` + parcelamento) |
| `POST` | `/api/compras/ordens/{id}/recusar` | `aguardando_aprovacao_financeiro` → `cancelada` (body: `{ "note": "..." }`, salvo em `financial_approval_note`) |
| `POST` | `/api/compras/ordens/{id}/iniciar-conferencia` | `aprovada` → `em_conferencia` (cria 1 `purchase_order_receipt` por item, status `pendente`). **Apenas ordens de produto** — retorna `400` se `order_type == "servico"` |
| `POST` | `/api/compras/ordens/{id}/finalizar-conferencia` | `em_conferencia` → `aguardando_pagamento` (registra qtd aceita/recusada por item, calcula `receipt_total_amount`, **dá entrada no estoque dos aceitos, emite NF de recebimento/devolução/transporte** e gera a conta a pagar) |
| `GET` | `/api/compras/recebimentos` | Lista ordens **de produto** (`order_type == "produto"`) elegíveis a recebimento (status `aprovada` ou `em_conferencia`), **paginada `Page[PurchaseOrderWithReceipts]`** (`order_by`: `ordered_at`/`status`). Ordens de serviço nunca aparecem aqui |
| `GET` | `/api/compras/recebimentos/{id}` | Detalhe da ordem com `receipts` |

> A conclusão da ordem (`aguardando_pagamento` → `concluida`) acontece **automaticamente** quando o Financeiro paga a conta a pagar vinculada (`payable.purchase_order_id`) **e não resta nenhuma conta a pagar em aberto da ordem** (no parcelado, só na última parcela). Não existe endpoint manual para essa transição. Estoque e NFs **não** são gerados aqui — já foram emitidos na conferência/aceite.

## Schemas

### SupplierCreate / SupplierUpdate
```json
{
  "name": "Fornecedor ABC",
  "document": "11.222.333/0001-81",
  "email": "contato@abc.com",
  "phone": "(11) 99999-9999",
  "address": "Rua X, 100 (legado, texto livre)",
  "cep": "37000-000",
  "street": "Rua X",
  "number": "100",
  "complement": "Sala 2",
  "neighborhood": "Centro",
  "city": "Varginha",
  "state": "MG",
  "notes": "opcional"
}
```

- `document` é **opcional**; quando informado, precisa ser um **CPF ou CNPJ válido** (dígitos verificadores oficiais, máscara ignorada). A validação roda no Service via `app/shared/br_documents.validate_document` e retorna `400 "CNPJ/CPF inválido"` (não 422) — é regra de negócio, não de schema. O utilitário (`is_valid_cpf`, `is_valid_cnpj`, `validate_document`) é reutilizável (será reaproveitado pelo Comercial).
- **Endereço estruturado** (`cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `state`): todos opcionais; são a fonte da verdade do endereço a partir da Demanda 6. A coluna legada `address` (texto livre) é mantida por compatibilidade. **A busca por CEP (ViaCEP) é feita no front** — o backend só persiste o que recebe.

### SupplierItemCreate / SupplierItemUpdate / SupplierItemOut
```json
// SupplierItemCreate (POST)
{ "stock_item_id": "uuid", "unit_price": 11.50 }

// SupplierItemUpdate (PUT) — campos opcionais
{ "unit_price": 12.00, "is_active": false }

// SupplierItemOut
{
  "id": "uuid", "supplier_id": "uuid", "stock_item_id": "uuid",
  "stock_item_name": "Fertilizante NPK", "stock_item_sku": "INS-FERT",
  "unit_price": 11.50, "is_active": true,
  "created_at": "...", "updated_at": "..."
}
```

- `unit_price > 0` (o preço do catálogo é uma sugestão real; ver "Preço do catálogo").
- `SupplierForStockItemOut` (saída de `/produtos/{id}/fornecedores`): `supplier_id`, `supplier_name`, `unit_price`.

### PurchaseOrderCreate

**Ordem de produto (default)**
```json
{
  "supplier_id": "uuid",
  "notes": "opcional",
  "ordered_at": "2026-04-15T10:00:00Z",
  "order_type": "produto",
  "shipping_cost": 80.00,
  "items": [
    {
      "stock_item_id": "uuid",
      "quantity": 10,
      "unit_price": 450.00,
      "description": "opcional"
    }
  ]
}
```

**Ordem de serviço**
```json
{
  "supplier_id": "uuid",
  "ordered_at": "2026-04-15T10:00:00Z",
  "order_type": "servico",
  "service_description": "Manutenção do trator XYZ",
  "total_amount": 1500.00,
  "items": []
}
```

- `order_type`: `"produto"` (default) ou `"servico"`
- Ordens de produto exigem **mínimo 1 item**; `total_amount` calculado automaticamente como soma dos subtotais (`subtotal = quantity × unit_price`)
- Ordens de serviço exigem `service_description` (obrigatório) e `total_amount` > 0; `items` pode ser lista vazia
- `shipping_cost`: opcional (`>= 0`), **aplica-se apenas a ordens de produto**. Em ordens de serviço o campo é forçado a `None`/`0` no validator, mesmo que enviado. Quando `> 0`, é somado ao `total_amount` da ordem e dispara a emissão de uma NF de transporte na **conferência** (ver "Ao Finalizar a Conferência")
- `ordered_at` opcional (default: now)
- **Parcelamento (`installments`, `first_due_date`, `installment_interval_days`) não fica mais na criação** — o financeiro define no momento da aprovação

### ApproveOrderRequest (body de `/aprovar`)
```json
{
  "payment_method": "a_vista" | "parcelado" | "pix" | "boleto",
  "installments": 1,
  "first_due_date": null,
  "installment_interval_days": 30
}
```

- `payment_method` (`PaymentMethod`) é obrigatório
- Quando `payment_method == "parcelado"`: `installments >= 2` e `first_due_date` obrigatórios
- O método de pagamento e os parâmetros de parcelamento são persistidos na ordem e propagados para a(s) `accounts_payable` gerada(s)

### PurchaseOrderCancelRequest (body de `/recusar`)
```json
{ "note": "Preço acima do orçado" }
```

### PurchaseOrderReceiptFinalize (body de `/finalizar-conferencia`)
```json
{
  "items": [
    {
      "purchase_order_item_id": "uuid",
      "quantity_accepted": 10,
      "quantity_rejected": 0
    },
    {
      "purchase_order_item_id": "uuid",
      "quantity_accepted": 4,
      "quantity_rejected": 1,
      "rejection_reason": "Saca com furo"
    }
  ]
}
```

- `quantity_accepted + quantity_rejected ≤ quantity_ordered`
- `rejection_reason` é **obrigatório** quando `quantity_rejected > 0`

### PurchaseOrderOut / PurchaseOrderWithReceipts
- `PurchaseOrderOut`: inclui `supplier_name`, `items` (com `stock_item_name` e `subtotal`), `shipping_cost` (default `0`), `receipt_total_amount`, `financial_approval_note`, `order_type`, `service_description`, `payment_method`
- `PurchaseOrderWithReceipts`: mesmos campos + lista `receipts` (com `quantity_ordered`, `quantity_accepted`, `quantity_rejected`, `rejection_reason`, `status`, `unit_price`)

## Regras de Negócio

### Status e Transições

```
em_andamento ──/enviar-aprovacao──▶ aguardando_aprovacao_financeiro
                                       │
                                       ├──/aprovar──▶ aprovada ──/iniciar-conferencia──▶ em_conferencia
                                       │                                                      │
                                       └──/recusar──▶ cancelada                               │
                                                                                              ▼
                                                                                /finalizar-conferencia
                                                                                              │
                                                                                              ▼
                                                                                   aguardando_pagamento
                                                                                              │
                                                                  (todas as contas a pagar liquidadas)
                                                                                              │
                                                                                              ▼
                                                                                          concluida
```

- `aguardando_pagamento`: mercadoria/serviço **recebido**, NF(s) emitida(s) e estoque atualizado — aguardando a quitação financeira.
- `concluida`: **todas** as contas a pagar da ordem foram pagas (no parcelado, a conclusão só ocorre na última parcela).
- `concluida` e `cancelada` são **status finais**.
- Tentar usar o endpoint legado `PATCH /ordens/{id}/status` com um status diferente de `cancelada` retorna `400` com instrução para usar os endpoints dedicados.
- Soft delete permitido apenas em ordens com status `em_andamento`.
- `iniciar-conferencia` cria automaticamente um `purchase_order_receipt` por item da ordem com status `pendente`. É **restrito a ordens de produto**: chamá-lo numa ordem de serviço retorna `400` (serviços seguem por `/concluir-servico`).

### Ao Enviar para Aprovação (`/enviar-aprovacao`)
- Origem: `em_andamento`
- Registra `financial_movement` (R$0, categoria `compra`, descrição "Ordem de compra enviada para aprovação financeira") apenas para rastreabilidade.

### Ao Aprovar (`/aprovar`)
- Origem: `aguardando_aprovacao_financeiro`
- Persiste `payment_method`, `installments`, `first_due_date` e `installment_interval_days` na ordem (definidos pelo financeiro).
- Validação: se `payment_method == "parcelado"`, exige `installments >= 2` e `first_due_date`.
- Registra `financial_movement` (R$0, categoria `compra`, descrição "Ordem de compra aprovada pelo financeiro").

### Concluir Serviço (`/concluir-servico`)
- Apenas ordens com `order_type == "servico"` e status `aprovada`.
- Transição: `aprovada` → `aguardando_pagamento`.
- **Emite a NF de serviço** (`invoice_type="servico"`, 1 item com a `service_description` e `total_amount` da ordem) via `fat_service.criar_nota_servico` — idempotente (não emite uma 2ª NF se já houver uma para a ordem). O documento fiscal de serviço é emitido **no aceite**, não no pagamento.
- Gera conta a pagar com `amount = order.total_amount`, propagando `payment_method` e regras de parcelamento da ordem.
- Registra `financial_movement` (R$0, descrição "Serviço concluído — aguardando pagamento").
- Sem efeito de estoque (serviço não movimenta estoque).

### Ao Recusar (`/recusar`)
- Origem: `aguardando_aprovacao_financeiro`
- Persiste o motivo em `purchase_orders.financial_approval_note`.
- Nenhum efeito em Estoque ou Financeiro.

### Ao Finalizar a Conferência (`/finalizar-conferencia`)
- Origem: `em_conferencia`
- **Ordens de serviço** (`order_type == "servico"`) pulam a conferência item a item: vão direto para `aguardando_pagamento`, **emitem a NF de serviço** (`criar_nota_servico`, sem estoque) e geram a conta a pagar com `order.total_amount` e o `payment_method` da ordem. (O endpoint dedicado é `/concluir-servico`; `finalize_receipt` mantém o mesmo comportamento como fallback caso uma ordem de serviço esteja em `em_conferencia`.)
- **Ordens de produto:** atualiza cada `purchase_order_receipt` com as quantidades aceitas/recusadas (persistidas e commitadas no repository) e calcula `receipt_total_amount = Σ (quantity_accepted × unit_price)`.
- **Entrada no Estoque e NFs são geradas AGORA** (Demanda 1.1), via `_gerar_estoque_e_nf_da_conferencia`. A operação é **idempotente**: se já existe NF de recebimento para a ordem (`existe_nota_recebimento`), nada é re-emitido. Para cada receipt:
  1. **Entrada no Estoque** — apenas para `quantity_accepted > 0`, com `unit_cost = order_item.unit_price`, `reference_id = order.id`. As coleções `items`/`receipts` são materializadas **antes** do loop porque `registrar_entrada` faz commit e expira as relações.
  2. **NF de Recebimento** — se houve qualquer item aceito: `criar_nota_recebimento(db, order.id)`.
  3. **NF de Devolução** — se houve qualquer item com `quantity_rejected > 0`: `criar_nota_devolucao(db, order.id)`.
  4. **NF de Transporte** — se `order.shipping_cost > 0`: `criar_nota_transporte(..., order_id=order.id, client_id=None)`. À vista (1 item, `quantity=1`, `unit_price=shipping_cost`), `movement_type=SAIDA`, `category=COMPRA`.
- O valor a pagar é `receipt_total_amount + shipping_cost`. Como o frete é devido mesmo que todos os itens sejam recusados, a conta a pagar é gerada sempre que `receipt_total_amount + shipping_cost > 0` (não apenas quando `receipt_total_amount > 0`).
- Quando há valor a pagar, gera **conta(s) a pagar** dependendo do `payment_method` armazenado na aprovação:
  - **Não parcelado (`a_vista`/`pix`/`boleto`):** uma única conta a pagar. Vencimento = `first_due_date` da ordem se definido, caso contrário `today + 30d`. `payment_method` é propagado para a conta.
  - **Parcelado (`payment_method == "parcelado"`, `installments >= 2`):** N contas a pagar. O valor (já incluindo o frete) é dividido igualmente; a última parcela absorve o resíduo de centavos. Vencimentos = `first_due_date + n * installment_interval_days`. Cada conta recebe `installment_number`, `installment_total` e `payment_method = "parcelado"`.
- Registra `financial_movement` (R$0, descrição "Conferência finalizada — mercadoria recebida, aguardando pagamento").

### Ao Pagar a Conta a Pagar (gatilho no Financeiro)
A partir da Demanda 1.1 o pagamento **não** gera mais estoque nem NF (já emitidos na conferência/aceite). Quando `financeiro.pay_payable` liquida uma conta:

1. Marca a conta como `paga` e registra o `financial_movement` de pagamento real (`SAIDA`/`PAGAMENTO`, valor da parcela) — esse é o único momento em que o dinheiro se move.
2. Se `payable.purchase_order_id IS NOT NULL`, chama `compras_service.complete_order_after_payment`, que **apenas conclui a ordem** quando `contar_contas_pagar_em_aberto_por_ordem == 0`:
   - **À vista / não parcelado:** a única conta é quitada → ordem vai para `concluida`.
   - **Parcelado:** as primeiras parcelas apenas liquidam a respectiva conta; a ordem permanece em `aguardando_pagamento` até a **última** parcela ser paga, quando então transiciona para `concluida` (`received_at = now()`).
   - Vale igualmente para produto e serviço — nenhum efeito de estoque/NF nesta etapa.

### Cancelamento de NF de compra (Demanda 1.1)
O cancelamento é acionado pelo Faturamento (`POST /api/faturamento/faturas/{id}/cancelar`) e segue o princípio **"o dinheiro só se move no pagamento"**. O tratamento financeiro de uma ordem de compra é centralizado em `_reverter_financeiro_ordem_compra`:

- **Parte já paga da ordem:** estorno `ENTRADA/AJUSTE` do **valor pago** (`total_pago_por_ordem`). **Idempotente** — registrado uma única vez por ordem (guard `existe_estorno_ordem`), mesmo que mais de uma NF da mesma ordem (recebimento + transporte) seja cancelada.
- **Parte em aberto:** as contas a pagar `em_aberto` da ordem são **canceladas** (`cancelar_contas_pagar_em_aberto_por_ordem`) — o dinheiro nunca saiu, então não há estorno.

Por tipo de NF:

- **NF de recebimento:** **sempre** estorna o estoque dos itens aceitos (`registrar_saida`, `unit_cost=0`, não mexe no CMP, `reference_id = invoice.id`) e aplica o tratamento financeiro acima. Antes de pagar → só cancela as contas em aberto, sem estorno financeiro. Depois de pago → estoque estornado **e** estorno do valor pago.
- **NF de transporte (compra, `order_id` no notes):** o frete está embutido na(s) conta(s) a pagar da ordem, então usa o mesmo `_reverter_financeiro_ordem_compra` (idempotente — não duplica se a NF de recebimento da mesma ordem também for cancelada). Sem efeito de estoque.
- **NF de serviço:** sem estoque; aplica `_reverter_financeiro_ordem_compra` (antes de pagar → cancela a conta em aberto; depois de pago → estorno do valor pago).
- **NF de devolução:** inalterada — os itens rejeitados retornam ao estoque como itens **avariados** (idempotente por SKU).

### Validações na Criação
- `supplier_id` deve existir e não estar deletado (404 se não encontrado)
- Todos os `stock_item_id` nos itens devem existir (404 identificando o item ausente)
- **Catálogo (Demanda 6 — só `create_order` de produto):** cada item da ordem precisa estar no catálogo **ativo** do `supplier_id` da ordem, senão `400 "Item não disponível no catálogo do fornecedor"`. Estoque do fornecedor é infinito → a quantidade **não** é validada contra o fornecedor. Ordens de **serviço** não usam catálogo.
- **Preço do catálogo (decisão PO travada):** o preço do catálogo é a **sugestão/default**, a compra é negociação. Na criação da ordem, se o item vier **sem** `unit_price` (ou `0`), aplica-se o `unit_price` do catálogo; se vier **preenchido (> 0)**, respeita-se o preço do front (override).

#### Fronteira catálogo × cotação (decisão PO travada)
A validação de catálogo **vale apenas para a criação DIRETA de ordem de produto** (`POST /ordens` → `create_order`). O fluxo de **cotação** (`/cotacoes/.../realizar-pedido` → `realize_order`) **NÃO** impõe catálogo: a cotação é uma negociação própria via propostas de vários fornecedores, e impor catálogo ali causaria regressão/scope creep. Tecnicamente, `realize_order` cria a ordem chamando `repository.create_order` **direto** (pula o `service.create_order`), de modo que a regra de catálogo não é exercida nesse caminho.

#### Item avariado não é comprável
Itens **avariados** (SKU terminando em `-AVARIADO`, convenção de `estoque_service.obter_ou_criar_item_avariado`) **não** podem entrar no catálogo do fornecedor (`400` no `POST .../itens`). São itens gerados internamente pelo estorno de devolução, não produtos vendáveis.

## Database Schema

### `suppliers`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) |
| `document` | VARCHAR(32) (nullable) — CPF/CNPJ; validado no cadastro |
| `email` | VARCHAR(255) (nullable) |
| `phone` | VARCHAR(32) (nullable) |
| `address` | VARCHAR(500) (nullable) — endereço legado (texto livre) |
| `cep` | VARCHAR(9) (nullable) |
| `street` | VARCHAR(255) (nullable) |
| `number` | VARCHAR(20) (nullable) |
| `complement` | VARCHAR(120) (nullable) |
| `neighborhood` | VARCHAR(120) (nullable) |
| `city` | VARCHAR(120) (nullable) |
| `state` | VARCHAR(2) (nullable) |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `supplier_items` (catálogo do fornecedor)
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `supplier_id` | UUID FK → suppliers (RESTRICT) |
| `stock_item_id` | UUID FK → stock_items (RESTRICT) |
| `unit_price` | NUMERIC(12,2) — preço sugerido (sem quantidade; estoque infinito) |
| `is_active` | BOOLEAN (default TRUE) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

UNIQUE parcial `uq_supplier_items_supplier_stock_active` em `(supplier_id, stock_item_id) WHERE deleted_at IS NULL`: um item ativo só aparece uma vez por fornecedor; soft-deletes não colidem (permite re-cadastro). Migrations `0019_supplier_address` (campos de endereço) e `0020_supplier_items` (tabela do catálogo).

### `purchase_orders`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `supplier_id` | UUID FK → suppliers |
| `status` | enum `purchase_order_status` (`em_andamento` / `aguardando_aprovacao_financeiro` / `aprovada` / `em_conferencia` / `aguardando_pagamento` / `concluida` / `cancelada`) |
| `total_amount` | NUMERIC(12,2) — inclui `shipping_cost` (ordens de produto) |
| `shipping_cost` | NUMERIC(12,2) (nullable, default 0) — custo de transporte (apenas ordens de produto) |
| `receipt_total_amount` | NUMERIC(10,2) — soma dos itens aceitos na conferência |
| `financial_approval_note` | TEXT (nullable — motivo da recusa pelo financeiro) |
| `ordered_at` | TIMESTAMPTZ |
| `received_at` | TIMESTAMPTZ (nullable — setado ao concluir) |
| `notes` | TEXT (nullable) |
| `installments` | INT default 1 (definido na aprovação) |
| `first_due_date` | DATE (nullable, definido na aprovação) |
| `installment_interval_days` | INT default 30 (definido na aprovação) |
| `order_type` | VARCHAR(10) — `produto` (default) ou `servico` |
| `service_description` | TEXT (nullable, obrigatório para ordens de serviço) |
| `payment_method` | enum `payment_method` (`a_vista` / `parcelado` / `pix` / `boleto`, nullable; setado na aprovação) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `purchase_order_items`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `purchase_order_id` | UUID FK → purchase_orders (cascade delete) |
| `stock_item_id` | UUID FK → stock_items |
| `description` | VARCHAR(255) (nullable) |
| `quantity` | NUMERIC(12,3) |
| `unit_price` | NUMERIC(12,2) |
| `subtotal` | NUMERIC(12,2) — calculado na criação |
| `created_at`, `updated_at` | TIMESTAMPTZ |

### `purchase_order_receipts`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `purchase_order_id` | UUID FK → purchase_orders (cascade delete) |
| `purchase_order_item_id` | UUID FK → purchase_order_items (cascade delete) |
| `quantity_ordered` | NUMERIC(10,3) — copiado do item da ordem |
| `quantity_accepted` | NUMERIC(10,3) — default 0 |
| `quantity_rejected` | NUMERIC(10,3) — default 0 |
| `rejection_reason` | TEXT (nullable — obrigatório se `quantity_rejected > 0`) |
| `status` | enum `purchase_order_receipt_status` (`pendente` / `conferido`) |
| `created_at`, `updated_at` | TIMESTAMPTZ |

## Cotações

Sub-fluxo de **cotação de preços** (RFQ). A cotação reúne uma lista de itens (ou um serviço) e recebe **propostas** de vários fornecedores. Após selecionar a proposta vencedora e obter aprovação do financeiro, a cotação **gera automaticamente uma Ordem de Compra já em `aprovada`**, com os itens e preços da proposta vencedora — pulando o fluxo de envio/aprovação da ordem (não gera movimentações financeiras duplicadas).

### Endpoints

Todos exigem autenticação (`get_current_user`). Prefixo `/api/compras`.

| Método | Rota | Body | Descrição |
|--------|------|------|-----------|
| `GET` | `/cotacoes` | — | Lista cotações **paginada `Page[QuotationOut]`** (filtros `status`, `order_type`; `order_by`: `status` (indexado), `created_at` (default desc — **sem índice**, ver nota)) |
| `POST` | `/cotacoes` | `QuotationCreate` | Cria cotação (201) |
| `GET` | `/cotacoes/{quotation_id}` | — | Detalhe com itens e propostas |
| `DELETE` | `/cotacoes/{quotation_id}` | — | Soft delete (só em `em_andamento`) |
| `POST` | `/cotacoes/{quotation_id}/propostas` | `QuotationProposalCreate` | Adiciona proposta (201) |
| `PUT` | `/cotacoes/{quotation_id}/propostas/{proposal_id}` | `QuotationProposalUpdate` | Edita proposta |
| `DELETE` | `/cotacoes/{quotation_id}/propostas/{proposal_id}` | — | Remove proposta (não pode ser a vencedora) |
| `POST` | `/cotacoes/{quotation_id}/selecionar-vencedor` | `SelectWinnerRequest` | Seleciona proposta vencedora |
| `POST` | `/cotacoes/{quotation_id}/aprovar` | — | Financeiro aprova |
| `POST` | `/cotacoes/{quotation_id}/cancelar` | `CancelQuotationRequest` | Cancela cotação |
| `POST` | `/cotacoes/{quotation_id}/realizar-pedido` | `RealizeOrderRequest` | Gera a Ordem de Compra em `aprovada` |

> **Paginação (D8) + débito de índice:** `GET /cotacoes` retorna `Page[QuotationOut]`
> (envelope cru). O sort default é `created_at desc`, que **preserva** o comportamento
> anterior, mas `quotations.created_at` **não tem índice** (só `status` é indexado —
> `idx_quotations_status`). Hoje a tabela é pequena, então o scan ordenado é irrelevante;
> **sinalizado** para avaliar um `idx_quotations_created_at` se a tabela crescer. `order_by`
> inválido cai no default (nunca 500); PK como tiebreaker.

### Schemas (resumo)

**Entrada**
- `QuotationItemCreate`: `stock_item_id: UUID`, `quantity: Decimal > 0`.
- `QuotationCreate`: `order_type: str = "produto"`, `service_description: str?`, `notes: str?`, `items: [QuotationItemCreate] = []`. Validação: `servico` exige `service_description` e sem itens; `produto` exige ≥ 1 item.
- `QuotationProposalItemCreate`: `quotation_item_id: UUID`, `unit_price: Decimal ≥ 0`.
- `QuotationProposalCreate`: `supplier_id: UUID`, `total_price: Decimal? ≥ 0`, `notes: str?`, `proposal_items: [QuotationProposalItemCreate] = []`. As regras cruzadas (produto exige itens; serviço exige `total_price`) são validadas no Service.
- `QuotationProposalUpdate`: mesmos campos, todos opcionais (`proposal_items` regenera os itens quando presente).
- `SelectWinnerRequest`: `proposal_id: UUID`.
- `CancelQuotationRequest`: `note: str` (1–2000).
- `RealizeOrderRequest`: `shipping_cost: Decimal? ≥ 0`, `ordered_at: datetime?`, `notes: str?`, `payment_method: PaymentMethod?`, `installments: int = 1`, `first_due_date: date?`, `installment_interval_days: int = 30`. Os campos de pagamento são **opcionais**; quando informados, são propagados para a Ordem de Compra gerada (relevante para **serviço**, cuja conta a pagar é gerada já no realizar-pedido). Se `payment_method == "parcelado"`, exige `installments >= 2` e `first_due_date` (senão `400`).

**Saída**
- `QuotationItemOut`: `id`, `stock_item_id`, `stock_item_name`, `quantity`.
- `QuotationProposalItemOut`: `id`, `proposal_id`, `quotation_item_id`, `unit_price`.
- `QuotationProposalOut`: `id`, `quotation_id`, `supplier_id`, `supplier_name`, `total_price?`, `notes?`, `proposal_items[]`.
- `QuotationOut`: `id`, `order_type`, `status`, `service_description?`, `notes?`, `cancellation_note?`, `winning_proposal_id?`, `purchase_order_id?`, `items[]`, `proposals[]`, `created_at`, `updated_at`.

### Status flow

```
em_andamento ──selecionar-vencedor──▶ aguardando_aprovacao_financeiro ──aprovar──▶ aprovado_financeiro ──realizar-pedido──▶ concluida
     │                                                                                                                          ▲
     └──────────────────────────────────────── cancelar ───────────────────────────────────────────────────────────▶ cancelada
```

- **`cancelar`** é possível em qualquer estado exceto os finais (`concluida` / `cancelada`).
- **`realizar-pedido`** cria a `PurchaseOrder` (via `repository.create_order`), avança-a direto para `aprovada` com `repository._set_status` e grava `quotation.purchase_order_id`.
  - **Produto:** a ordem nasce `aprovada` e segue o fluxo normal de conferência/recebimento/pagamento (estoque e conta a pagar só na conferência). Registra 1 movimento de auditoria R$ 0,00.
  - **Serviço (corrigido na Demanda 6):** após criar a ordem `aprovada`, o `realize_order` **reaproveita `complete_service_order`** — a ordem avança para `aguardando_pagamento`, **emite a NF de serviço** e **gera a conta a pagar** (`total_amount` da proposta vencedora), propagando `payment_method`/parcelamento do `RealizeOrderRequest`. O movimento R$ 0,00 de "ordem gerada a partir da cotação" passa a ser registrado **só para produto** (serviço já registra o seu próprio movimento R$ 0,00 em `complete_service_order`), evitando duplicação.

### Regras de negócio

- Criação/propostas/edição/remoção de propostas e seleção de vencedor só ocorrem com a cotação em `em_andamento`.
- `create_quotation` (produto) valida que todo `stock_item_id` existe e não está deletado (404 por item).
- Proposta de **produto** deve conter exatamente um `QuotationProposalItem` por `QuotationItem` da cotação; `quotation_item_id` que não pertença à cotação → 404; cobertura incompleta → 400.
- Proposta de **serviço** exige `total_price`.
- Fornecedor duplicado na mesma cotação viola `uq_qp_quotation_supplier` → **409** "Este fornecedor já tem uma proposta nesta cotação".
- A proposta vencedora não pode ser removida.
- `selecionar-vencedor`, `aprovar` e `realizar-pedido` registram `financial_movement` de R$ 0,00 (categoria `COMPRA`, `source_module="compras"`), seguindo o padrão de auditoria das ordens.
- Ao realizar o pedido de produto, `shipping_cost` é repassado à ordem; o `total_amount` da ordem é `Σ(quantity × unit_price) + shipping`. Para serviço, `total_amount = winning_proposal.total_price`.

### Integrações

- **Estoque** (`estoque_repo.get_item`): valida itens na criação da cotação.
- **Financeiro** (`fin_service.registrar_movimento`): movimentações de auditoria nas transições.
- **Compras / Ordens de Compra** (`repository.create_order` + `_set_status`): a Ordem de Compra gerada segue daí o fluxo normal de conferência/recebimento/pagamento.
- **Faturamento** (`fat_service.criar_nota_servico`, via `complete_service_order`): cotação de **serviço** emite a NF de serviço já no realizar-pedido.

### Bug corrigido na Demanda 6 — cotação de serviço presa em `aprovada`

**Antes:** ao realizar o pedido de uma cotação de **serviço**, o `realize_order` criava a ordem e a deixava em `aprovada`, mas **nunca** chamava `complete_service_order`. Como o endpoint `/iniciar-conferencia` é restrito a produto e `/concluir-servico` não era acionado, a ordem de serviço ficava **presa em `aprovada`, sem NF de serviço e sem conta a pagar** — o financeiro não tinha o que pagar e a ordem nunca concluía. (A cotação de **produto** não tinha esse problema: nasce `aprovada` e segue para conferência normalmente.)

**Depois:** o `realize_order`, para `order_type == "servico"`, **reaproveita `complete_service_order(db, po.id)`** logo após criar a ordem `aprovada`: a ordem avança para `aguardando_pagamento`, emite a NF de serviço e gera a conta a pagar com o `total_amount` da proposta vencedora (propagando `payment_method`/parcelamento do `RealizeOrderRequest`). O movimento de auditoria R$ 0,00 de "ordem gerada a partir da cotação" passou a ser registrado **apenas para produto**, porque `complete_service_order` já registra o seu próprio movimento R$ 0,00 — evitando movimento duplicado para serviço. Produto segue **sem regressão** (continua nascendo `aprovada` e indo para a conferência).

## Migrations

`0007_add_shipping_cost` (arquivo `alembic/versions/20260528_0007_add_shipping_cost.py`):
- Adiciona `purchase_orders.shipping_cost NUMERIC(12,2) nullable, server_default '0'` (custo de transporte, apenas ordens de produto).
- Adiciona `sales.shipping_cost NUMERIC(12,2) nullable, server_default '0'` (a mesma migration cobre Comercial e Compras).

Reversível via `downgrade()` (drop das duas colunas).

`0010_add_quotations` (arquivo `alembic/versions/20260601_0010_add_quotations.py`):
- Cria o enum `quotation_status` e as tabelas `quotations`, `quotation_items`, `quotation_proposals` e `quotation_proposal_items` do sub-fluxo de Cotações.
- FKs circulares (`quotations.winning_proposal_id` → `quotation_proposals.id` e `quotations.purchase_order_id` → `purchase_orders.id`) adicionadas via `ALTER TABLE` após a criação das tabelas. Migration idempotente (guards `IF NOT EXISTS` / `pg_constraint`) e reversível.
