# Backend Module: Dashboard e Notificações

## Overview

Módulo responsável pelos KPIs consolidados do sistema (Dashboard) e pelo sistema de notificações que alimenta o sino no frontend. É o único módulo que agrega dados de todos os outros: lê `financial_movements`, `accounts_payable/receivable`, `stock_items`, `production_orders` e `clients` para compor os indicadores em tempo real.

Outros módulos geram notificações chamando `dashboard.service.criar_notificacao()`.

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

O model `Notification` está em `app.shared.models` (compartilhado) — não foi necessário criar `model.py` local no módulo dashboard.

## Endpoints

Todos os endpoints exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Dashboard

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/dashboard/` | Retorna KPIs completos + fluxo de caixa dos últimos 6 meses |

### Notificações

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/dashboard/notificacoes` | Lista notificações. Query param: `unread_only=true` filtra apenas não lidas |
| `GET` | `/api/dashboard/notificacoes/count` | Retorna `{"unread": int}` — usado pelo badge do sino |
| `PATCH` | `/api/dashboard/notificacoes/todas-lidas` | Marca todas as notificações como lidas |
| `PATCH` | `/api/dashboard/notificacoes/{id}/lida` | Marca uma notificação específica como lida |

**Atenção à ordem das rotas:** `/notificacoes/todas-lidas` é declarado antes de `/notificacoes/{id}/lida` para evitar que FastAPI tente interpretar `todas-lidas` como um UUID.

## Schemas

### DashboardOut
```json
{
  "kpis": {
    "balance": 49156.67,
    "monthly_revenue": 1500.00,
    "monthly_expenses": 57700.00,
    "pending_payables": 2,
    "pending_receivables": 3,
    "low_stock_items": 3,
    "open_production_orders": 0,
    "defaulter_clients": 1
  },
  "cash_flow": [
    { "month": "11/2025", "income": 0.0, "expenses": 0.0 },
    { "month": "04/2026", "income": 1500.0, "expenses": 57700.0 }
  ]
}
```

### NotificationOut
```json
{
  "id": "uuid",
  "type": "warning",
  "title": "Estoque baixo: Fertilizante NPK",
  "message": "Quantidade atual (85.000 kg) abaixo do mínimo (100.000 kg)",
  "module": "estoque",
  "read": false,
  "created_at": "2026-04-16T20:30:00Z"
}
```

Nota: o campo do model é `is_read`; a API expõe como `read` para maior clareza no frontend.

## KPIs — Como São Calculados

| KPI | Query |
|-----|-------|
| `balance` | `SUM(amount) WHERE type=entrada` − `SUM(amount) WHERE type=saida` em `financial_movements` |
| `monthly_revenue` | `SUM(amount) WHERE type=entrada AND year=atual AND month=atual` |
| `monthly_expenses` | `SUM(amount) WHERE type=saida AND year=atual AND month=atual` |
| `pending_payables` | `COUNT(*) WHERE status='em_aberto' AND deleted_at IS NULL` em `accounts_payable` |
| `pending_receivables` | `COUNT(*) WHERE status='em_aberto' AND deleted_at IS NULL` em `accounts_receivable` |
| `low_stock_items` | `COUNT(*) WHERE quantity_on_hand < minimum_stock AND deleted_at IS NULL` em `stock_items` |
| `open_production_orders` | `COUNT(*) WHERE status IN ('planejada','em_producao') AND deleted_at IS NULL` em `production_orders` |
| `defaulter_clients` | `COUNT(*) WHERE is_delinquent=True AND deleted_at IS NULL` em `clients` |

Cada KPI é uma query agregada independente sem JOIN, garantindo performance mesmo com volume de dados.

## Fluxo de Caixa

`cash_flow` retorna os últimos 6 meses agrupando `financial_movements.occurred_at` por mês via `date_trunc('month', ...)`. Para cada bucket, separa `income` (entradas) e `expenses` (saídas). Meses sem movimentação não aparecem na lista (preencher zeros é responsabilidade do frontend).

## Como Outros Módulos Usam `criar_notificacao`

```python
from app.modules.dashboard.service import criar_notificacao

# Exemplo — chamado pelo módulo Estoque ao detectar estoque baixo:
criar_notificacao(
    db,
    title="Estoque baixo: Fertilizante NPK",
    message="Quantidade atual (85.000 kg) abaixo do mínimo (100.000 kg)",
    type="warning",   # aceita: "info", "warning", "error", "success"
                      # ou nomes de módulos como "estoque" → mapeado para WARNING
    module="estoque", # módulo que gerou a notificação (para navegação no frontend)
    link=None,        # URL relativa opcional para navegar ao recurso
)
```

### Mapeamento de tipos

A função `criar_notificacao` aceita tanto os valores do enum `NotificationType` quanto strings legadas (nomes de módulo). O mapeamento interno é:

| String recebida | NotificationType resultante |
|-----------------|----------------------------|
| `"info"` | INFO |
| `"warning"` | WARNING |
| `"error"` | ERROR |
| `"success"` | SUCCESS |
| `"estoque"` | WARNING |
| qualquer outro | INFO |

### Onde é chamado

| Módulo | Quando | Tipo |
|--------|--------|------|
| Estoque | `quantity_on_hand < minimum_stock` após qualquer movimentação | WARNING |

Outros módulos podem chamar `criar_notificacao` a qualquer momento seguindo o mesmo padrão.

## Database Schema (Notification)

O model `Notification` está em `app/shared/models.py` e a tabela `notifications` é criada pela migration inicial.

| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `type` | enum (`info`/`warning`/`error`/`success`) |
| `title` | VARCHAR(255) |
| `message` | VARCHAR(1000) |
| `module` | VARCHAR(50) nullable, indexado |
| `link` | VARCHAR(500) nullable |
| `is_read` | BOOLEAN default false, indexado |
| `user_id` | UUID FK → users (nullable, para futuras notificações por usuário) |
| `created_at`, `updated_at` | TIMESTAMPTZ |

## Observações

- Mensagens de erro e resposta em português
- Todas as respostas usam `SuccessResponse` do `app.shared.responses`
- Nenhuma migration nova foi necessária — a tabela `notifications` já existia no schema inicial
- O campo `user_id` no model existe para preparar futura segmentação de notificações por usuário, mas não é usado atualmente (todas as notificações são globais)
- Notificações não têm soft delete — uma vez criadas, persistem indefinidamente
