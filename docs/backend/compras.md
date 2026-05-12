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
| `DELETE` | `/api/compras/ordens/{id}` | Soft delete (somente se `em_andamento`) |

### Fluxo de Aprovação e Conferência

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/compras/ordens/{id}/enviar-aprovacao` | `em_andamento` → `aguardando_aprovacao_financeiro` |
| `POST` | `/api/compras/ordens/{id}/aprovar` | `aguardando_aprovacao_financeiro` → `aprovada` |
| `POST` | `/api/compras/ordens/{id}/recusar` | `aguardando_aprovacao_financeiro` → `cancelada` (body: `{ "note": "..." }`, salvo em `financial_approval_note`) |
| `POST` | `/api/compras/ordens/{id}/iniciar-conferencia` | `aprovada` → `em_conferencia` (cria 1 `purchase_order_receipt` por item, status `pendente`) |
| `POST` | `/api/compras/ordens/{id}/finalizar-conferencia` | `em_conferencia` → `aguardando_pagamento` (registra qtd aceita/recusada por item, calcula `receipt_total_amount`, gera a conta a pagar) |
| `GET` | `/api/compras/recebimentos` | Lista ordens elegíveis a recebimento (status `aprovada` ou `em_conferencia`) |
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
```json
{
  "supplier_id": "uuid",
  "notes": "opcional",
  "ordered_at": "2026-04-15T10:00:00Z",
  "items": [
    {
      "stock_item_id": "uuid",
      "quantity": 10,
      "unit_price": 450.00,
      "description": "opcional"
    }
  ],
  "installments": 1,
  "first_due_date": null,
  "installment_interval_days": 30
}
```

- Mínimo de 1 item
- `total_amount` calculado automaticamente (soma dos subtotais)
- `subtotal` por item = `quantity × unit_price`
- `ordered_at` opcional (default: now)
- `installments`: 1 a 24 (default 1 — pagamento à vista, fluxo atual inalterado)
- `first_due_date`: obrigatório quando `installments >= 2`
- `installment_interval_days`: dias entre parcelas (default 30)

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
- `PurchaseOrderOut`: inclui `supplier_name`, `items` (com `stock_item_name` e `subtotal`), `receipt_total_amount`, `financial_approval_note`
- `PurchaseOrderWithReceipts`: adiciona a lista `receipts` (com `quantity_ordered`, `quantity_accepted`, `quantity_rejected`, `rejection_reason`, `status`, `unit_price`)

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
- `iniciar-conferencia` cria automaticamente um `purchase_order_receipt` por item da ordem com status `pendente`.

### Ao Enviar para Aprovação (`/enviar-aprovacao`)
- Origem: `em_andamento`
- Registra `financial_movement` (R$0, categoria `compra`, descrição "Ordem de compra enviada para aprovação financeira") apenas para rastreabilidade.

### Ao Aprovar (`/aprovar`)
- Origem: `aguardando_aprovacao_financeiro`
- Registra `financial_movement` (R$0, categoria `compra`, descrição "Ordem de compra aprovada pelo financeiro").

### Ao Recusar (`/recusar`)
- Origem: `aguardando_aprovacao_financeiro`
- Persiste o motivo em `purchase_orders.financial_approval_note`.
- Nenhum efeito em Estoque ou Financeiro.

### Ao Finalizar a Conferência (`/finalizar-conferencia`)
- Origem: `em_conferencia`
- Atualiza cada `purchase_order_receipt` com as quantidades aceitas/recusadas.
- Calcula `receipt_total_amount = Σ (quantity_accepted × unit_price)`.
- Se `receipt_total_amount > 0`, gera **conta(s) a pagar** dependendo de `installments`:
  - **`installments <= 1` (à vista, default — fluxo inalterado):** uma única conta a pagar com vencimento `today + 30d`.
  - **`installments >= 2` (parcelado):** N contas a pagar. `receipt_total_amount` é dividido igualmente; a última parcela absorve o resíduo de centavos. Vencimentos = `first_due_date + n * installment_interval_days`. Cada conta recebe `installment_number` e `installment_total`.
- Registra `financial_movement` (R$0, descrição "Conferência finalizada — aguardando pagamento").

> **Atenção (parcelamento):** o gatilho `complete_order_after_payment` é disparado **uma única vez**, no pagamento da primeira parcela. Pagamentos das parcelas seguintes apenas baixam a conta a pagar — o estoque e as NFs já foram registrados.

### Ao Pagar a Conta a Pagar (gatilho no Financeiro)
Quando `financeiro.pay_payable` detecta `payable.purchase_order_id IS NOT NULL`, chama `compras_service.complete_order_after_payment`, que executa em sequência:

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
4. **Conclusão** — status → `concluida`, `received_at` = `now()`.

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
| `total_amount` | NUMERIC(12,2) |
| `receipt_total_amount` | NUMERIC(10,2) — soma dos itens aceitos na conferência |
| `financial_approval_note` | TEXT (nullable — motivo da recusa pelo financeiro) |
| `ordered_at` | TIMESTAMPTZ |
| `received_at` | TIMESTAMPTZ (nullable — setado ao concluir) |
| `notes` | TEXT (nullable) |
| `installments` | INT default 1 |
| `first_due_date` | DATE (nullable) |
| `installment_interval_days` | INT default 30 |
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
