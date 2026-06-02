# Backend Module: Compras

## Overview

Módulo responsável pelo cadastro de fornecedores e gestão de ordens de compra. A ordem passa por aprovação financeira, conferência item a item no recebimento e só é concluída automaticamente quando a conta a pagar correspondente é quitada no Financeiro. Integra com Estoque (entrada apenas dos itens aceitos), Financeiro (conta a pagar + movimentações) e Faturamento (NF de recebimento e NF de devolução).

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Fornecedores

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/compras/fornecedores` | Lista fornecedores (paginação: skip, limit) |
| `POST` | `/api/compras/fornecedores` | Cria fornecedor |
| `GET` | `/api/compras/fornecedores/{id}` | Detalhe do fornecedor |
| `PUT` | `/api/compras/fornecedores/{id}` | Atualiza fornecedor |
| `DELETE` | `/api/compras/fornecedores/{id}` | Soft delete do fornecedor |

### Ordens de Compra

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/compras/ordens` | Lista ordens (filtros: `status`, `supplier_id`, paginação) |
| `POST` | `/api/compras/ordens` | Cria ordem com itens (status inicial: `em_andamento`) |
| `GET` | `/api/compras/ordens/{id}` | Detalhe da ordem com itens |
| `PATCH` | `/api/compras/ordens/{id}/status` | **Legacy** — restrito a cancelamento. Use os endpoints dedicados do fluxo para as demais transições |
| `POST` | `/api/compras/ordens/{id}/concluir-servico` | Apenas ordens de serviço (`order_type="servico"`) em status `aprovada`: muda para `aguardando_pagamento` e gera a conta a pagar com o `payment_method` da ordem |
| `DELETE` | `/api/compras/ordens/{id}` | Soft delete (somente se `em_andamento`) |

### Fluxo de Aprovação e Conferência

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/compras/ordens/{id}/enviar-aprovacao` | `em_andamento` → `aguardando_aprovacao_financeiro` |
| `POST` | `/api/compras/ordens/{id}/aprovar` | `aguardando_aprovacao_financeiro` → `aprovada` (body define `payment_method` + parcelamento) |
| `POST` | `/api/compras/ordens/{id}/recusar` | `aguardando_aprovacao_financeiro` → `cancelada` (body: `{ "note": "..." }`, salvo em `financial_approval_note`) |
| `POST` | `/api/compras/ordens/{id}/iniciar-conferencia` | `aprovada` → `em_conferencia` (cria 1 `purchase_order_receipt` por item, status `pendente`). **Apenas ordens de produto** — retorna `400` se `order_type == "servico"` |
| `POST` | `/api/compras/ordens/{id}/finalizar-conferencia` | `em_conferencia` → `aguardando_pagamento` (registra qtd aceita/recusada por item, calcula `receipt_total_amount`, gera a conta a pagar) |
| `GET` | `/api/compras/recebimentos` | Lista ordens **de produto** (`order_type == "produto"`) elegíveis a recebimento (status `aprovada` ou `em_conferencia`). Ordens de serviço nunca aparecem aqui |
| `GET` | `/api/compras/recebimentos/{id}` | Detalhe da ordem com `receipts` |

> A conclusão da ordem (`aguardando_pagamento` → `concluida`) acontece **automaticamente** quando o Financeiro paga a conta a pagar vinculada (`payable.purchase_order_id`). Não existe endpoint manual para essa transição.

## Schemas

### SupplierCreate / SupplierUpdate
```json
{
  "name": "Fornecedor ABC",
  "document": "12.345.678/0001-99",
  "email": "contato@abc.com",
  "phone": "(11) 99999-9999",
  "address": "Rua X, 100",
  "notes": "opcional"
}
```

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
- `shipping_cost`: opcional (`>= 0`), **aplica-se apenas a ordens de produto**. Em ordens de serviço o campo é forçado a `None`/`0` no validator, mesmo que enviado. Quando `> 0`, é somado ao `total_amount` da ordem e dispara a emissão de uma NF de transporte no pagamento (ver "Ao Pagar a Conta a Pagar")
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
                                                                            (pagamento da conta a pagar)
                                                                                              │
                                                                                              ▼
                                                                                          concluida
```

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
- Gera conta a pagar com `amount = order.total_amount`, propagando `payment_method` e regras de parcelamento da ordem.
- Registra `financial_movement` (R$0, descrição "Serviço concluído — aguardando pagamento").

### Ao Recusar (`/recusar`)
- Origem: `aguardando_aprovacao_financeiro`
- Persiste o motivo em `purchase_orders.financial_approval_note`.
- Nenhum efeito em Estoque ou Financeiro.

### Ao Finalizar a Conferência (`/finalizar-conferencia`)
- Origem: `em_conferencia`
- **Ordens de serviço** (`order_type == "servico"`) pulam a conferência item a item: vão direto para `aguardando_pagamento` e geram a conta a pagar com `order.total_amount` e o `payment_method` da ordem. (O endpoint dedicado é `/concluir-servico`; finalize_receipt mantém o mesmo comportamento como fallback caso uma ordem de serviço esteja em `em_conferencia`.)
- **Ordens de produto:** atualiza cada `purchase_order_receipt` com as quantidades aceitas/recusadas e calcula `receipt_total_amount = Σ (quantity_accepted × unit_price)`.
- O valor a pagar é `receipt_total_amount + shipping_cost`. Como o frete é devido mesmo que todos os itens sejam recusados, a conta a pagar é gerada sempre que `receipt_total_amount + shipping_cost > 0` (não apenas quando `receipt_total_amount > 0`).
- Quando há valor a pagar, gera **conta(s) a pagar** dependendo do `payment_method` armazenado na aprovação:
  - **Não parcelado (`a_vista`/`pix`/`boleto`):** uma única conta a pagar. Vencimento = `first_due_date` da ordem se definido, caso contrário `today + 30d`. `payment_method` é propagado para a conta.
  - **Parcelado (`payment_method == "parcelado"`, `installments >= 2`):** N contas a pagar. O valor é dividido igualmente; a última parcela absorve o resíduo de centavos. Vencimentos = `first_due_date + n * installment_interval_days`. Cada conta recebe `installment_number`, `installment_total` e `payment_method = "parcelado"`.
- Registra `financial_movement` (R$0, descrição "Conferência finalizada — aguardando pagamento").

> **Atenção (parcelamento):** o gatilho `complete_order_after_payment` é disparado **uma única vez**, no pagamento da primeira parcela. Pagamentos das parcelas seguintes apenas baixam a conta a pagar — o estoque e as NFs já foram registrados.

### Ao Pagar a Conta a Pagar (gatilho no Financeiro)
Quando `financeiro.pay_payable` detecta `payable.purchase_order_id IS NOT NULL`, chama `compras_service.complete_order_after_payment`. Para ordens de serviço, o fluxo apenas transiciona a ordem para `concluida` (sem entrada no estoque, sem NFs). Para ordens de produto, executa em sequência:

1. **Entrada no Estoque** — apenas para receipts com `quantity_accepted > 0`:
   ```python
   estoque_service.registrar_entrada(
       db,
       stock_item_id=order_item.stock_item_id,
       quantity=receipt.quantity_accepted,
       unit_cost=order_item.unit_price,
       description=f"Recebimento ordem #{order.id}",
       source_module="compras",
       reference_id=order.id,
   )
   ```
2. **NF de Recebimento** — se houve qualquer item aceito: `fat_service.criar_nota_recebimento(db, order.id)`.
3. **NF de Devolução** — se houve qualquer item com `quantity_rejected > 0`: `fat_service.criar_nota_devolucao(db, order.id)`.
4. **NF de Transporte** — se `order.shipping_cost > 0`: `fat_service.criar_nota_transporte(db, shipping_cost=order.shipping_cost, order_id=order.id, client_id=None)`. Sempre à vista (1 item, `quantity=1`, `unit_price=shipping_cost`), `movement_type=SAIDA`, `category=COMPRA`.
5. **Conclusão** — status → `concluida`, `received_at` = `now()`.

### Validações na Criação
- `supplier_id` deve existir e não estar deletado (404 se não encontrado)
- Todos os `stock_item_id` nos itens devem existir (404 identificando o item ausente)

## Database Schema

### `suppliers`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) |
| `document` | VARCHAR(32) (nullable) |
| `email` | VARCHAR(255) (nullable) |
| `phone` | VARCHAR(32) (nullable) |
| `address` | VARCHAR(500) (nullable) |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

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
| `GET` | `/cotacoes` | — | Lista cotações (query: `status: QuotationStatus?`, `order_type: str?`, `skip`, `limit`) |
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

### Schemas (resumo)

**Entrada**
- `QuotationItemCreate`: `stock_item_id: UUID`, `quantity: Decimal > 0`.
- `QuotationCreate`: `order_type: str = "produto"`, `service_description: str?`, `notes: str?`, `items: [QuotationItemCreate] = []`. Validação: `servico` exige `service_description` e sem itens; `produto` exige ≥ 1 item.
- `QuotationProposalItemCreate`: `quotation_item_id: UUID`, `unit_price: Decimal ≥ 0`.
- `QuotationProposalCreate`: `supplier_id: UUID`, `total_price: Decimal? ≥ 0`, `notes: str?`, `proposal_items: [QuotationProposalItemCreate] = []`. As regras cruzadas (produto exige itens; serviço exige `total_price`) são validadas no Service.
- `QuotationProposalUpdate`: mesmos campos, todos opcionais (`proposal_items` regenera os itens quando presente).
- `SelectWinnerRequest`: `proposal_id: UUID`.
- `CancelQuotationRequest`: `note: str` (1–2000).
- `RealizeOrderRequest`: `shipping_cost: Decimal? ≥ 0`, `ordered_at: datetime?`, `notes: str?`.

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

## Migrations

`0007_add_shipping_cost` (arquivo `alembic/versions/20260528_0007_add_shipping_cost.py`):
- Adiciona `purchase_orders.shipping_cost NUMERIC(12,2) nullable, server_default '0'` (custo de transporte, apenas ordens de produto).
- Adiciona `sales.shipping_cost NUMERIC(12,2) nullable, server_default '0'` (a mesma migration cobre Comercial e Compras).

Reversível via `downgrade()` (drop das duas colunas).

`0010_add_quotations` (arquivo `alembic/versions/20260601_0010_add_quotations.py`):
- Cria o enum `quotation_status` e as tabelas `quotations`, `quotation_items`, `quotation_proposals` e `quotation_proposal_items` do sub-fluxo de Cotações.
- FKs circulares (`quotations.winning_proposal_id` → `quotation_proposals.id` e `quotations.purchase_order_id` → `purchase_orders.id`) adicionadas via `ALTER TABLE` após a criação das tabelas. Migration idempotente (guards `IF NOT EXISTS` / `pg_constraint`) e reversível.
