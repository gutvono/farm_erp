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
| `GET` | `/api/financeiro/movimentacoes` | Lista **paginada `Page[T]`** (filtros: movement_type, category, source_module, start_date, end_date, `search` em description; ordenação por allowlist `{occurred_at, amount}`) |
| `POST` | `/api/financeiro/movimentacoes` | Registra nova movimentação manual |

### Contas a Pagar

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/financeiro/contas-pagar` | Lista **paginada `Page[T]`** (filtros: status, supplier_id, due_before, due_after, `search` em number/description/nome do fornecedor; ordenação por allowlist `{due_date, amount, created_at}`) |
| `POST` | `/api/financeiro/contas-pagar` | Cria nova conta |
| `GET` | `/api/financeiro/contas-pagar/{id}` | Detalhe |
| `PUT` | `/api/financeiro/contas-pagar/{id}` | Atualiza conta em aberto |
| `PUT` | `/api/financeiro/contas-pagar/{id}/pagar` | Marca como paga + gera movimento de saída. **Se a conta tem `purchase_order_id`, dispara o fluxo de conclusão em Compras** (entrada de estoque dos aceitos, NF-RECEBIMENTO, NF-DEVOLUCAO se houver, transição para `concluida`; ordens de serviço apenas transicionam para `concluida`) |
| `PUT` | `/api/financeiro/contas-pagar/{id}/cancelar` | Cancela conta (sem movimento) |
| `PATCH` | `/api/financeiro/contas-pagar/{id}/metodo-pagamento` | Atualiza `payment_method` da conta (apenas se `em_aberto`) |
| `GET` | `/api/financeiro/contas-pagar/{id}/pix` | Retorna `PixPaymentInfo` (chave + payload EMV simulado). Requer `payment_method == "pix"` |
| `GET` | `/api/financeiro/contas-pagar/{id}/boleto` | Retorna `BoletoPaymentInfo` (linha digitável + código de barras simulados, determinístico por id). Requer `payment_method == "boleto"` |

### Contas a Receber

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/financeiro/contas-receber` | Lista **paginada `Page[T]`** (filtros: status, client_id, due_before, due_after, `search` em number/description/nome do cliente; ordenação por allowlist `{due_date, amount, created_at}`) |
| `POST` | `/api/financeiro/contas-receber` | Cria nova conta |
| `GET` | `/api/financeiro/contas-receber/{id}` | Detalhe |
| `PUT` | `/api/financeiro/contas-receber/{id}` | Atualiza conta ativa |
| `PUT` | `/api/financeiro/contas-receber/{id}/receber` | Registra recebimento parcial ou total. Body aceita `encargo` opcional (override do juros/multa — Demanda 9.B) |
| `GET` | `/api/financeiro/contas-receber/{id}/encargo` | Pré-calcula o encargo por atraso (multa/juros/dias) — para a tela de baixa (9.B) |
| `PUT` | `/api/financeiro/contas-receber/{id}/inadimplente` | Marca cliente como inadimplente |
| `PUT` | `/api/financeiro/contas-receber/{id}/reverter-inadimplencia` | Reverte inadimplência |
| `PATCH` | `/api/financeiro/contas-receber/{id}/metodo-pagamento` | Atualiza `payment_method` da conta (apenas se `em_aberto`) |
| `GET` | `/api/financeiro/contas-receber/{id}/pix` | Retorna `PixPaymentInfo`. Requer `payment_method == "pix"` |
| `GET` | `/api/financeiro/contas-receber/{id}/boleto` | Retorna `BoletoPaymentInfo`. Requer `payment_method == "boleto"` |
| `GET` | `/api/financeiro/relatorio-inadimplencia` | Lista contas em inadimplência **efetiva** (manual **OU** vencida — Demanda 9.A) |

### Aprovação de folha (Demanda 4)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/financeiro/aprovacoes-folha` | Fila de solicitações de pagamento de folha em `aguardando_aprovacao_financeiro` (com período/competência, tipo `individual`/`lote`, total e os holerites/funcionários incluídos) |
| `POST` | `/api/financeiro/aprovacoes-folha/{id}/aprovar` | Aprova: valida saldo, paga cada holerite e emite as NFs |
| `POST` | `/api/financeiro/aprovacoes-folha/{id}/recusar` | Recusa (body `{ "note": "..." }`): holerites voltam a `pendente` |

**Aprovar** (`POST .../aprovar`):
- Valida `get_balance(db).saldo >= total` da solicitação. Senão `400 "Saldo insuficiente para aprovar o pagamento da folha"` — **sem pagamento parcial**: ou cobre o total ou recusa.
- Para **cada** holerite da solicitação: registra `saida/folha` (`amount = net_amount`, `source_module="folha"`, `reference_id = entry.id`) — **este é o débito real**; marca a entry `pago` + `paid_at`; chama `faturamento.criar_nota_folha(db, entry, period)` (1 NF `folha_pagamento` por funcionário, com movimento de R$0 de rastreabilidade).
- Marca a solicitação `aprovada` + `decided_at`.

**Recusar** (`POST .../recusar`):
- Todas as entries da solicitação voltam a `pendente`; a solicitação fica `recusada` + `approval_note`. **Nenhum** movimento financeiro é gerado.

> A **solicitação** é criada na Folha (`/api/folha/.../solicitar-pagamento[-todos]`). O dinheiro só se move aqui, na aprovação. Ver `docs/backend/folha.md`.

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
  "notes": "opcional",
  "payment_method": "a_vista" | "parcelado" | "pix" | "boleto"
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
  "notes": "opcional",
  "payment_method": "a_vista" | "parcelado" | "pix" | "boleto"
}
```

### PaymentMethodUpdate (body do `PATCH .../metodo-pagamento`)
```json
{ "payment_method": "pix" }
```

### PixPaymentInfo (response do `GET .../pix`)
```json
{
  "pix_key": "fazenda.cafe@pix.com.br",
  "pix_code": "00020126580014BR.GOV.BCB.PIX0136...6304XXXX",
  "amount": 1500.00,
  "description": "..."
}
```
- Payload EMV simulado (não validado pelo Banco Central) — gerado de forma determinística por id da conta.

### BoletoPaymentInfo (response do `GET .../boleto`)
```json
{
  "boleto_number": "34191.xxxxx xxxxx.xxxxxx xxxxxx.xxxxxx X DDMMYYYY VVVVVVVVVV",
  "barcode": "34191xxxxxxxxxx...",
  "due_date": "30/04/2026",
  "amount": 1500.00,
  "beneficiary": "Fazenda Café Arábica Ltda. — CNPJ: 00.000.000/0001-00",
  "payer": "Fornecedor X / Cliente Y"
}
```
- Determinístico por id da conta (mesmo boleto gerado múltiplas vezes retorna o mesmo número).

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

### Parcelamento (vendas / compras)

`criar_conta_pagar` e `criar_conta_receber` aceitam parâmetros opcionais:

- `installment_number: int` — 1-based
- `installment_total: int`
- `sale_id: UUID` (apenas `criar_conta_receber`) — quando o vínculo da venda precisa coexistir com `invoice_id`
- `invoice_id: UUID` (apenas `criar_conta_receber`)

No fluxo de **venda parcelada** (Comercial chama `criar_faturas_parceladas` + N `criar_conta_receber`), cada conta a receber referencia tanto a venda (`sale_id`) quanto a fatura da parcela correspondente (`invoice_id`).

No fluxo de **compra parcelada** (Compras divide `receipt_total_amount` em N parcelas), cada conta a pagar mantém `purchase_order_id` e recebe `installment_number`/`installment_total`. Ver `docs/backend/compras.md` para detalhes sobre o gatilho `complete_order_after_payment`, que só é executado no pagamento da primeira parcela.

### `get_receivables_report(db, *, start, end)` — fatia de recebíveis (Demanda 10)

Função de **agregação por período** consumida pelo **Comercial** para montar a fatia de
recebíveis do Relatório de Vendas. Regra de arquitetura travada: o Comercial **não** consulta
`accounts_receivable`/`invoices` direto — lê tudo por aqui (consumidor, não reimplementador).
Retorna `ReceivablesReportOut`:

- **`received_in_period`** — Σ `amount_received` de AR (não canceladas) com `received_at ∈
  [start, end]` (parcelas efetivamente quitadas no intervalo).
- **`to_receive_in_period`** — Σ saldo (`amount − amount_received`) de AR **em aberto** (saldo
  > 0, não cancelada) com `due_date ∈ [start, end]`.
- **`overdue_total` + `aging`** — AR **vencidas** (`due_date < hoje`, em aberto, não cancelada,
  reusando a definição derivada da 9.A `_receivable_is_overdue`), com buckets por dias de
  atraso (`1-30`, `31-60`, `61-90`, `90+`). É uma **foto de inadimplência na data de hoje** —
  diferente de `received`/`to_receive`, **não** é limitada ao período do relatório.

As queries agregadas vivem no `repository` (`sum_received_between`, `sum_open_due_between`,
`list_overdue_receivables`); o `service` apenas faz o bucketing do aging e monta o DTO.

> **Limitação conhecida:** `received_in_period` usa `received_at`, que só é carimbado quando a
> parcela é **quitada** (recebimentos parciais não têm timestamp por evento — vivem só nos
> `financial_movements`). Logo a métrica reflete o que foi **liquidado** no período, não cada
> recebimento parcial.

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

### Inadimplência derivada / parcela vencida (Demanda 9.A)

Sem scheduler no projeto, a inadimplência automática é **DERIVADA na leitura** (nenhum job,
nenhum schema novo). Uma conta a receber está **vencida (overdue)** quando:

> `due_date < hoje` **E** `amount_received < amount` (saldo em aberto) **E** `status != cancelada`.

(Parcela quitada ou cancelada nunca é vencida.)

- **`AccountReceivableOut`** expõe, derivados na serialização: **`is_overdue`** (bool) e
  **`days_overdue`** (`max(0, hoje - due_date)` quando vencida; senão `0`).
- **Funções do Service** (fonte da verdade do overdue, usadas pelo Comercial via Service):
  - `get_client_ids_with_overdue(db) -> set[UUID]` — **uma** query (`SELECT DISTINCT client_id`)
    com os clientes que têm ≥1 parcela vencida. Anota a lista de clientes **sem N+1**.
  - `client_has_overdue(db, client_id) -> bool` — para o GET de um cliente.
- **Inadimplência efetiva = manual OU vencida.** O `relatorio-inadimplencia` agora reconcilia os
  dois: inclui as contas marcadas manualmente (status `cancelada` de cliente com
  `is_delinquent`) **e** as contas vencidas em aberto. O override manual (`mark_as_defaulter`/
  reverter) segue inalterado. O Comercial expõe `has_overdue`/`is_delinquent_effective` no
  `ClientOut` a partir destas funções.

### Juros/multa por atraso na baixa (Demanda 9.B)

Ao **quitar** uma parcela **vencida**, o sistema cobra um **encargo** (multa + juros de mora),
calculado sobre o **saldo** da parcela. As taxas vêm de Configurações (`app_settings`), com
default `2`%/`1`% (ver `docs/backend/configuracoes.md`).

> `multa  = saldo × multa_atraso_percent/100`  (uma vez)
> `juros  = saldo × (juros_mora_mensal_percent/100 / 30) × dias_atraso`  (mora simples, pro-rata)
> `total  = multa + juros`

- **`GET /contas-receber/{id}/encargo`** → breakdown `EncargoOut`
  (`saldo, dias_atraso, multa, juros, total`); `0` em tudo se a parcela não está vencida. O front
  mostra **antes** da baixa. Ex. (AR vencida 55 dias, saldo 23.250): multa `465,00`, juros
  `426,25`, total `891,25`.
- **`PUT /contas-receber/{id}/receber`** aceita `encargo` **opcional** (override):
  - parcela vencida, sem `encargo` no body → usa o `total` pré-calculado;
  - com `encargo` (inclusive **`0` = perdão**) → usa o valor informado (validado `≥ 0`);
  - parcela **não** vencida → encargo `0` (nenhum movimento de encargo).
- **O encargo NÃO entra no principal.** A parcela quita pelo `amount` (lógica de
  `amount_received` inalterada). Quando `encargo > 0`, é registrado um **movimento separado**
  `ENTRADA`/**`juros_multa`** (`amount = encargo`, `reference_id` = a AR, descrição
  `"Juros/multa por atraso — {número} (parcela i/N)"`) — receita financeira à parte.
- **Pagamento parcial:** o encargo é cobrado **apenas na baixa que QUITA** a parcela; baixas
  parciais não geram encargo.

### Status da nota = `paga` na baixa da última parcela (Demanda 9.B)

Quando uma baixa deixa uma AR `quitada` e **todas** as parcelas daquela nota (`invoice_id`,
não canceladas) estão quitadas, o Financeiro chama
`faturamento_service.marcar_fatura_paga_se_quitada(db, invoice_id)`, que **persiste**
`invoices.status = paga` (via repository, sem registrar movimento de "fatura paga" — o caixa já
entrou parcela a parcela). Isso resolve `GET /faturas?status=paga` (que filtra pela coluna do
banco). O status derivado na leitura da 9.0 continua coerente.

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
| `installment_number` | INT (nullable) — 1-based |
| `installment_total` | INT (nullable) |
| `payment_method` | enum `payment_method` (`a_vista` / `parcelado` / `pix` / `boleto`, nullable) |
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
| `installment_number` | INT (nullable) — 1-based |
| `installment_total` | INT (nullable) |
| `payment_method` | enum `payment_method` (`a_vista` / `parcelado` / `pix` / `boleto`, nullable) |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

## Integrações entre módulos

| Origem | Ação | Chamada |
|--------|------|---------|
| Comercial | Venda realizada | `criar_conta_receber(source_module="comercial", reference_id=sale.id)` + `registrar_movimento(VENDA)` opcional |
| Compras | Conferência finalizada | `criar_conta_pagar(source_module="compras", reference_id=po.id)` (amount = `receipt_total_amount`) |
| Financeiro → Compras | Pagamento da conta a pagar | Em `pay_payable`, se `payable.purchase_order_id IS NOT NULL`, chama `compras_service.complete_order_after_payment(db, payable.purchase_order_id)`, que faz entrada de estoque dos itens aceitos, gera NF-RECEBIMENTO via `faturamento.criar_nota_recebimento`, gera NF-DEVOLUCAO se houver itens recusados via `faturamento.criar_nota_devolucao`, e move a ordem para `concluida`. Import é lazy para evitar ciclo. |
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
