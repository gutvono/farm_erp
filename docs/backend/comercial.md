# Backend Module: Comercial

## Overview

Módulo responsável pela gestão de clientes e vendas diretas. Ao criar uma venda, integra automaticamente com Estoque (baixa), Faturamento (fatura — placeholder) e Financeiro (conta a receber + movimentação).

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Clientes

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/comercial/clientes` | Lista clientes (filtros: `is_delinquent`, paginação) |
| `POST` | `/api/comercial/clientes` | Cria cliente |
| `GET` | `/api/comercial/clientes/{id}` | Detalhe do cliente |
| `PUT` | `/api/comercial/clientes/{id}` | Atualiza dados do cliente |
| `PUT` | `/api/comercial/clientes/{id}/inadimplente` | Marca cliente como inadimplente |
| `PUT` | `/api/comercial/clientes/{id}/reverter-inadimplencia` | Reverte inadimplência manualmente |
| `DELETE` | `/api/comercial/clientes/{id}` | Soft delete do cliente |

### Vendas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/comercial/vendas` | Lista vendas (filtros: `status`, `client_id`, paginação) |
| `POST` | `/api/comercial/vendas` | Cria venda com itens (dispara integrações) |
| `GET` | `/api/comercial/vendas/{id}` | Detalhe da venda com itens |
| `PATCH` | `/api/comercial/vendas/{id}/status` | Atualiza status da venda |
| `DELETE` | `/api/comercial/vendas/{id}` | Soft delete (somente se `realizada`) |

## Schemas

### ClientCreate / ClientUpdate
```json
{
  "name": "Cooperativa Café do Vale",
  "document": "12.345.678/0001-99",
  "email": "contato@cafedovale.com",
  "phone": "(11) 99999-9999",
  "address": "Rua X, 100",
  "notes": "opcional"
}
```

### ClientOut — campos principais
- `id`, `name`, `document`, `email`, `phone`, `address`, `notes`
- `is_delinquent` (bool) — campo real no model (`is_delinquent`, não `is_defaulter`)

### SaleCreate
```json
{
  "client_id": "uuid",
  "notes": "opcional",
  "sold_at": "2026-04-15T10:00:00Z",
  "items": [
    {
      "stock_item_id": "uuid",
      "quantity": 5,
      "unit_price": 900.00,
      "description": "opcional"
    }
  ],
  "installments": 1,
  "first_due_date": null,
  "installment_interval_days": 30,
  "payment_method": "a_vista" | "parcelado" | "pix" | "boleto",
  "shipping_cost": 150.00
}
```

- Mínimo de 1 item
- `total_amount` calculado automaticamente (soma dos subtotais **+ `shipping_cost`**)
- `shipping_cost`: opcional (`>= 0`), custo de transporte. Quando `> 0`, é somado ao `total_amount` e dispara a emissão de uma NF de transporte (ver "Ao Criar uma Venda")
- `subtotal` por item = `quantity × unit_price`
- `sold_at` opcional (default: now)
- Status inicial sempre `realizada`
- `installments`: 1 a 24 (default 1 — pagamento à vista, fluxo atual inalterado)
- `first_due_date`: obrigatório quando `installments >= 2`
- `installment_interval_days`: dias entre parcelas (default 30)
- `payment_method`: default `a_vista`. Quando `"parcelado"`, exige `installments >= 2`. O valor escolhido é propagado para a(s) `accounts_receivable` gerada(s)

### SaleStatusUpdate
```json
{ "status": "entregue" }
```

### SaleOut — campos principais
- Inclui `client_name`, `items` (com `stock_item_name` e `subtotal`), `payment_method` e `shipping_cost` (default `0`)

## Regras de Negócio

### Status e Transições

```
realizada → entregue
realizada → cancelada (status final)
entregue  → cancelada (status final)
```

- `cancelada` é status final — tentativa de alterar retorna `400`
- `entregue` não pode retornar para `realizada`
- Soft delete permitido apenas em vendas com status `realizada`
- Ao entregar: `delivered_at` é preenchido automaticamente com `datetime.now()`

### Ao Criar uma Venda

Executado em sequência no `service.create_sale()`:

1. **Validação de disponibilidade** — para cada item:
   ```python
   estoque_service.verificar_disponibilidade(db, stock_item_id, quantity)
   # Se insuficiente: HTTPException 400 com nome do item e quantidade disponível
   ```

2. **Criação da venda** — `repository.create_sale()` com status `realizada`

3. **Baixa no Estoque** — para cada item:
   ```python
   estoque_service.registrar_saida(
       db,
       stock_item_id=item.stock_item_id,
       quantity=item.quantity,
       unit_cost=Decimal(str(stock_item.unit_cost)),  # CMP atual do item
       description=f"Venda #{sale.id}",
       source_module="comercial",
       reference_id=sale.id,
   )
   ```
   O `unit_cost` passado é o CMP (custo médio móvel) atual do item, para que a
   saída carregue o custo e viabilize o cálculo de CMV (Custo da Mercadoria
   Vendida). O `StockItem` é reaproveitado da validação de disponibilidade
   (etapa 1), sem query redundante. A movimentação financeira da saída continua
   em `amount=0` / `AJUSTE` — a receita é registrada apenas no recebimento da
   Conta a Receber.

4. **Fatura(s)** — depende de `installments`:
   - **`installments <= 1` (à vista, default — fluxo inalterado):** uma única fatura via `faturamento_service.criar_fatura(...)` com `invoice_type="venda"`, `due_date = today + 30d`.
   - **`installments >= 2` (parcelado):** N faturas via `faturamento_service.criar_faturas_parceladas(...)`, uma por parcela. `total_amount` é dividido igualmente; a última parcela absorve o resíduo de centavos. Cada fatura recebe `installment_number`, `installment_total` e `parent_invoice_id` apontando para a primeira (a primeira tem `parent_invoice_id = None`). Vencimentos = `first_due_date + n * installment_interval_days`.

5. **Conta(s) a Receber**:
   - **À vista:** uma conta com `due_date = today + 30d`.
   - **Parcelado:** uma conta por parcela, cada uma vinculada à sua fatura (`invoice_id`), com `installment_number`, `installment_total` e `due_date` espelhando o vencimento da fatura.

6. **NF de Transporte** (somente se `shipping_cost > 0`) — via `faturamento_service.criar_nota_transporte(...)` com `sale_id`, `client_id`, sempre à vista (1 item, `quantity=1`, `unit_price=shipping_cost`), independente de a venda ser parcelada. Emitida após a(s) fatura(s) de itens.

7. **Movimentação Financeira** (rastreabilidade):
   - **À vista e Parcelado:** movimentação placeholder de R$0.
   - O valor real é registrado exclusivamente no recebimento da Conta a Receber
     (via `financeiro.receive_payment`).

### Inadimplência de Clientes
- Controlada pelo campo `is_delinquent` (Boolean) em `Client`
- Pode ser marcada manualmente via `PUT /clientes/{id}/inadimplente`
- Pode ser revertida manualmente via `PUT /clientes/{id}/reverter-inadimplencia`
- O módulo Financeiro também atualiza `is_delinquent` ao marcar conta a receber como inadimplente (`mark_as_defaulter`)

## Database Schema

### `clients`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(255) |
| `document` | VARCHAR(32) (nullable) |
| `email` | VARCHAR(255) (nullable) |
| `phone` | VARCHAR(32) (nullable) |
| `address` | VARCHAR(500) (nullable) |
| `is_delinquent` | BOOLEAN default false |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `sales`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `client_id` | UUID FK → clients |
| `status` | enum (`realizada` / `entregue` / `cancelada`) |
| `total_amount` | NUMERIC(12,2) — inclui `shipping_cost` |
| `shipping_cost` | NUMERIC(12,2) (nullable, default 0) — custo de transporte |
| `sold_at` | TIMESTAMPTZ |
| `delivered_at` | TIMESTAMPTZ (nullable) |
| `notes` | TEXT (nullable) |
| `installments` | INT default 1 |
| `first_due_date` | DATE (nullable) |
| `installment_interval_days` | INT default 30 |
| `payment_method` | enum `payment_method` (`a_vista` / `parcelado` / `pix` / `boleto`, default `a_vista`) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `sale_items`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `sale_id` | UUID FK → sales (cascade delete) |
| `stock_item_id` | UUID FK → stock_items |
| `description` | VARCHAR(255) (nullable) |
| `quantity` | NUMERIC(12,3) |
| `unit_price` | NUMERIC(12,2) |
| `subtotal` | NUMERIC(12,2) — calculado na criação |
| `created_at`, `updated_at` | TIMESTAMPTZ |

## Migrations

`0007_add_shipping_cost` (arquivo `alembic/versions/20260528_0007_add_shipping_cost.py`):
- Adiciona `sales.shipping_cost NUMERIC(12,2) nullable, server_default '0'`.
- Adiciona `purchase_orders.shipping_cost NUMERIC(12,2) nullable, server_default '0'` (a mesma migration cobre Comercial e Compras).

Reversível via `downgrade()` (drop das duas colunas).

## Campos Importantes vs. Spec

| Spec | Model real |
|------|-----------|
| `is_defaulter` | `is_delinquent` |
| `total_price` (item) | `subtotal` |

## Nota sobre SaleItem

`SaleItem` não possui relationship `stock_item` no model. O `repository._load_relations()` executa uma query manual por todos os `StockItem` IDs dos itens e injeta via `item.__dict__["stock_item"]`, sem alterar o model.
