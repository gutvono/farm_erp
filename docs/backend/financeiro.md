# Backend Module: Financeiro

## Overview

Módulo responsável pela gestão financeira da fazenda: conta corrente (movimentações append-only), contas a pagar, contas a receber, fluxo de caixa e controle de inadimplência.

Toda operação de negócio em qualquer módulo gera um movimento financeiro via `registrar_movimento()`, garantindo que o saldo reflete 100% das transações.

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

Obedece a regra do projeto: router valida entrada e retorna resposta; service orquestra lógica; repository acessa o banco. Nunca pular camadas.

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Saldo & Fluxo

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/financeiro/saldo` | Retorna total de entradas, saídas e saldo |
| `GET` | `/api/financeiro/fluxo-caixa?months=6` | Fluxo de caixa agrupado por mês (1–36 meses) |

### Movimentações

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/financeiro/movimentacoes` | Lista movimentações (filtros: movement_type, category, source_module, start_date, end_date) |
| `POST` | `/api/financeiro/movimentacoes` | Registra nova movimentação manual |

### Contas a Pagar

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/financeiro/contas-pagar` | Lista (filtros: status, supplier_id, due_before, due_after) |
| `POST` | `/api/financeiro/contas-pagar` | Cria nova conta |
| `GET` | `/api/financeiro/contas-pagar/{id}` | Detalhe |
| `PUT` | `/api/financeiro/contas-pagar/{id}` | Atualiza conta em aberto |
| `PUT` | `/api/financeiro/contas-pagar/{id}/pagar` | Marca como paga + gera movimento de saída |
| `PUT` | `/api/financeiro/contas-pagar/{id}/cancelar` | Cancela conta (sem movimento) |

### Contas a Receber

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/financeiro/contas-receber` | Lista (filtros: status, client_id, due_before, due_after) |
| `POST` | `/api/financeiro/contas-receber` | Cria nova conta |
| `GET` | `/api/financeiro/contas-receber/{id}` | Detalhe |
| `PUT` | `/api/financeiro/contas-receber/{id}` | Atualiza conta ativa |
| `PUT` | `/api/financeiro/contas-receber/{id}/receber` | Registra recebimento parcial ou total |
| `PUT` | `/api/financeiro/contas-receber/{id}/inadimplente` | Marca cliente como inadimplente |
| `PUT` | `/api/financeiro/contas-receber/{id}/reverter-inadimplencia` | Reverte inadimplência |
| `GET` | `/api/financeiro/relatorio-inadimplencia` | Lista clientes com contas em inadimplência |

## Schemas principais

### FinancialMovementCreate
```json
{
  "movement_type": "entrada" | "saida",
  "category": "venda|compra|folha|producao|ajuste|recebimento|pagamento|saldo_inicial|outro",
  "amount": 1500.00,
  "description": "Descrição",
  "source_module": "comercial",
  "reference_id": "uuid",
  "occurred_at": "2026-04-15T10:00:00Z"
}
```

### AccountPayableCreate
```json
{
  "description": "Aluguel abril",
  "amount": 2500.00,
  "due_date": "2026-04-30",
  "supplier_id": "uuid",
  "purchase_order_id": "uuid",
  "notes": "opcional"
}
```

### AccountReceivableCreate
```json
{
  "client_id": "uuid",
  "description": "Venda #0042",
  "amount": 5000.00,
  "due_date": "2026-05-15",
  "sale_id": "uuid",
  "invoice_id": "uuid",
  "notes": "opcional"
}
```

### ReceivePaymentRequest
```json
{
  "amount": 1500.00,
  "received_at": "2026-04-15T10:00:00Z",
  "notes": "opcional"
}
```

## Funções Públicas (uso por outros módulos)

Exportadas em `service.py`, consumidas via import pelos demais módulos.

```python
from app.modules.financeiro import service as fin_service

# Registrar movimento financeiro
fin_service.registrar_movimento(
    db,
    movement_type=MovementType.ENTRADA,
    category=FinancialCategory.VENDA,
    amount=Decimal("1500.00"),
    description="Venda #0042",
    source_module="comercial",
    reference_id=sale.id,
)

# Criar conta a pagar (ex.: ao concluir compra)
fin_service.criar_conta_pagar(
    db,
    description="Compra de insumos",
    amount=Decimal("800.00"),
    due_date=date(2026, 5, 15),
    supplier_id=supplier.id,
    source_module="compras",
    reference_id=purchase_order.id,
)

# Criar conta a receber (ex.: ao vender)
fin_service.criar_conta_receber(
    db,
    client_id=client.id,
    description="Venda #0042",
    amount=Decimal("5000.00"),
    due_date=date(2026, 5, 15),
    source_module="comercial",
    reference_id=sale.id,
)
```

Se `source_module == "compras"`, `reference_id` é atribuído a `purchase_order_id`.
Se `source_module == "comercial"`, `reference_id` é atribuído a `sale_id`.
Se `source_module == "faturamento"`, `reference_id` é atribuído a `invoice_id`.

## Regras de Negócio

### Saldo
- Saldo = SUM(movements WHERE type='entrada') − SUM(movements WHERE type='saida')
- `financial_movements` é append-only: nunca é atualizado ou removido

### Contas a Pagar (status)
- `em_aberto` → `paga`: gera movimento `saida/pagamento`
- `em_aberto` → `cancelada`: não gera movimento
- Conta paga não pode ser cancelada; conta cancelada não pode ser paga

### Contas a Receber (status)
- `em_aberto` → `parcialmente_pago`: gera movimento `entrada/recebimento` a cada parcial
- `em_aberto`/`parcialmente_pago` → `quitado`: ao completar o valor total
- `em_aberto`/`parcialmente_pago` → `cancelada` (inadimplência): marca `client.is_delinquent = True`
- Reverter inadimplência restaura o status com base em `amount_received` e limpa `is_delinquent` do cliente se ele não tiver outras contas inadimplentes

### Recebimentos parciais
- Valor recebido nunca pode exceder o saldo devedor (`amount - amount_received`)
- Sempre gera movimento de entrada com a categoria `recebimento`
- Cada recebimento atualiza `amount_received` cumulativamente

### Numeração
- Payables: `AP-0001`, `AP-0002`, ...
- Receivables: `AR-0001`, `AR-0002`, ...
- Gerada automaticamente via `repository.next_number()` na criação

### Soft delete
- `accounts_payable` e `accounts_receivable` usam `deleted_at`; todas as queries filtram `deleted_at IS NULL`
- `financial_movements` **não** tem soft delete (append-only)

## Database Schema

### `financial_movements` (append-only)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `movement_type` | enum | `entrada` / `saida` |
| `category` | enum | `venda` / `compra` / `folha` / `producao` / `ajuste` / `recebimento` / `pagamento` / `saldo_inicial` / `outro` |
| `amount` | NUMERIC(12,2) | |
| `description` | VARCHAR(500) | |
| `source_module` | VARCHAR(50) | Módulo de origem |
| `reference_id` | UUID | ID da entidade origem (sale, purchase_order, invoice, payable, receivable) |
| `occurred_at` | TIMESTAMPTZ | Data real do evento |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `accounts_payable`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `number` | VARCHAR(32) unique (ex.: AP-0001) |
| `supplier_id` | UUID FK → suppliers (nullable) |
| `purchase_order_id` | UUID FK → purchase_orders (nullable) |
| `description` | VARCHAR(500) |
| `amount` | NUMERIC(12,2) |
| `due_date` | DATE |
| `paid_at` | TIMESTAMPTZ (nullable) |
| `status` | enum (`em_aberto` / `paga` / `cancelada`) |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `accounts_receivable`
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `number` | VARCHAR(32) unique (ex.: AR-0001) |
| `client_id` | UUID FK → clients (obrigatório) |
| `sale_id` | UUID FK → sales (nullable) |
| `invoice_id` | UUID FK → invoices (nullable) |
| `description` | VARCHAR(500) |
| `amount` | NUMERIC(12,2) |
| `amount_received` | NUMERIC(12,2) default 0 |
| `due_date` | DATE |
| `received_at` | TIMESTAMPTZ (nullable) |
| `status` | enum (`em_aberto` / `quitado` / `parcialmente_pago` / `cancelada`) |
| `notes` | TEXT (nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

## Integrações entre módulos

| Origem | Ação | Chamada |
|--------|------|---------|
| Comercial | Venda realizada | `criar_conta_receber(source_module="comercial", reference_id=sale.id)` + `registrar_movimento(VENDA)` opcional |
| Compras | Compra concluída | `criar_conta_pagar(source_module="compras", reference_id=po.id)` |
| Folha | Folha fechada | `criar_conta_pagar(source_module="folha", reference_id=payroll_entry.id)` por funcionário |
| PCP | Produção concluída | `registrar_movimento(SAIDA/PRODUCAO)` (insumos) + `registrar_movimento(ENTRADA/PRODUCAO, amount=0)` (produto) |
| Estoque | Movimentação interna | `registrar_movimento(SAIDA/OUTRO, amount=0)` |

## Fluxo de cálculo do saldo

```
saldo = Σ(amount WHERE movement_type='entrada')
      − Σ(amount WHERE movement_type='saida')
```

Fluxo de caixa mensal usa `to_char(occurred_at, 'YYYY-MM')` com GROUP BY para agrupar por período.

## Observações

- Mensagens de erro e resposta em português
- Todas as respostas usam `SuccessResponse` / `ErrorResponse` do `app.shared.responses`
- Validação de entrada via Pydantic (`schemas.py`)
- Lista de contas sempre ordenada por `due_date ASC`
- Lista de movimentações sempre ordenada por `occurred_at DESC`
