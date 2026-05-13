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

**Ordem de produto (default)**
```json
{
  "supplier_id": "uuid",
  "notes": "opcional",
  "ordered_at": "2026-04-15T10:00:00Z",
  "order_type": "produto",
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
- `PurchaseOrderOut`: inclui `supplier_name`, `items` (com `stock_item_name` e `subtotal`), `receipt_total_amount`, `financial_approval_note`, `order_type`, `service_description`, `payment_method`
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
- `iniciar-conferencia` cria automaticamente um `purchase_order_receipt` por item da ordem com status `pendente`.

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
