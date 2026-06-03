# Infra de Paginação Genérica (`app/shared/pagination.py`)

Contrato **genérico e reutilizável** de paginação/ordenação para qualquer
endpoint de listagem. Criado na Demanda 0 (infra-first); as demais demandas
(1–7) devem reusar estes blocos em vez de reimplementar paginação.

Arquitetura respeitada: **Router → Service → Repository**. O router só injeta
os parâmetros e devolve; o service orquestra e serializa; o repository monta a
query e chama o helper.

---

## Blocos disponíveis

### `PageParams` (parâmetros de entrada)

Modelo Pydantic com os parâmetros padrão de paginação/ordenação:

| Campo        | Tipo                      | Default  | Regras            |
|--------------|---------------------------|----------|-------------------|
| `page`       | `int`                     | `1`      | `>= 1`            |
| `page_size`  | `int`                     | `20`     | `1..100`          |
| `order_by`   | `str \| None`             | `None`   | validado por allowlist |
| `order_dir`  | `Literal["asc","desc"]`   | `"desc"` | —                 |
| `search`     | `str \| None`             | `None`   | busca textual livre (opcional) |

Propriedade auxiliar: `params.offset` → `(page - 1) * page_size`.

> `order_by` **nunca** é confiado às cegas: a validação contra a allowlist
> acontece dentro de `paginate_query`. Um valor desconhecido cai no
> `default_order` (responde 200, nunca 500).

### `get_page_params` (dependency do router)

Dependency FastAPI que lê os query params (`page`, `page_size`, `order_by`,
`order_dir`, `search`) e monta um `PageParams`. Use com `Depends`:

```python
from app.shared.pagination import PageParams, get_page_params

params: PageParams = Depends(get_page_params)
```

### `Page[T]` (envelope de resposta)

Modelo Pydantic genérico (`Generic[T]`). Campos:

```json
{ "items": [ ... ], "total": 15, "page": 1, "page_size": 5, "pages": 3 }
```

| Campo        | Tipo        |
|--------------|-------------|
| `items`      | `list[T]`   |
| `total`      | `int`       |
| `page`       | `int`       |
| `page_size`  | `int`       |
| `pages`      | `int`       |

**Regra de `pages`:** `ceil(total / page_size)` quando `total > 0`; **`0`**
quando o resultado é vazio (`total == 0`). Construa sempre com o factory:

```python
Page.create(items=items, total=total, params=params)
```

### `paginate_query` (helper do repository)

```python
def paginate_query(
    query: SAQuery[Any],
    params: PageParams,
    *,
    allowed_order_by: dict[str, Orderable],
    default_order: Any,
    tiebreaker: Orderable | None = None,
) -> tuple[list[Any], int]
```

O que faz, nesta ordem:

1. **Conta o total** na query-base filtrada, removendo o `ORDER BY`
   (`query.order_by(None).count()`) — antes de `LIMIT/OFFSET`, refletindo o
   conjunto filtrado completo.
2. **Valida `order_by`** contra `allowed_order_by`. Se ausente/ inválido, usa
   `default_order` (nunca 500). Se válido, aplica a coluna + `order_dir`
   (`asc`/`desc`).
3. **Tiebreaker** (recomendado: a PK) é anexado por último como ordenação
   determinística, para que linhas **não migrem entre páginas** quando a coluna
   primária tem empates (ex.: vários registros com o mesmo `occurred_at`).
4. Aplica `OFFSET/LIMIT` e retorna `(items, total)`.

Agnóstico de model: o repository monta e filtra a query; o helper só ordena e
pagina.

---

## Passo a passo: paginar um novo endpoint

Exemplo de referência implementado: `GET /api/estoque/movimentacoes`
(piloto da Demanda 0).

### 1. Repository — monte a query, defina a allowlist, chame o helper

```python
from app.shared.pagination import PageParams, paginate_query

MOVEMENT_ORDER_COLUMNS = {
    "occurred_at": StockMovement.occurred_at,
    "quantity": StockMovement.quantity,
    "total_value": StockMovement.total_value,
    "unit_cost": StockMovement.unit_cost,
}

def list_movements_paginated(
    db: Session, *, params: PageParams,
    stock_item_id=None, movement_type=None, source_module=None,
) -> tuple[list[StockMovement], int]:
    query = db.query(StockMovement)
    if stock_item_id:
        query = query.filter(StockMovement.stock_item_id == stock_item_id)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    if source_module:
        query = query.filter(StockMovement.source_module == source_module)

    return paginate_query(
        query, params,
        allowed_order_by=MOVEMENT_ORDER_COLUMNS,
        default_order=StockMovement.occurred_at.desc(),
        tiebreaker=StockMovement.id,
    )
```

> Para listas de entidades de negócio, lembre do soft delete:
> `query.filter(Model.deleted_at.is_(None))`.

### 2. Service — orquestre e serialize para `Page[Out]`

```python
from app.shared.pagination import Page, PageParams

def list_movements_paginated(
    db: Session, *, params: PageParams, **filters,
) -> Page[StockMovementOut]:
    movements, total = estoque_repo.list_movements_paginated(db, params=params, **filters)
    items = [StockMovementOut.from_model(m) for m in movements]
    return Page.create(items=items, total=total, params=params)
```

### 3. Router — injete `PageParams` e devolva o `Page`

```python
from app.shared.pagination import Page, PageParams, get_page_params

@router.get("/movimentacoes", response_model=Page[StockMovementOut])
def list_movements(
    stock_item_id: Optional[UUID] = None,
    movement_type: Optional[MovementType] = None,
    source_module: Optional[str] = None,
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[StockMovementOut]:
    return estoque_service.list_movements_paginated(
        db, params=params,
        stock_item_id=stock_item_id,
        movement_type=movement_type,
        source_module=source_module,
    )
```

Os filtros específicos do endpoint continuam como query params normais, **ao
lado** dos parâmetros de paginação.

---

## Retrocompatibilidade

Endpoints paginados respondem com o envelope `Page[T]` **direto** (não no
`SuccessResponse`), pois o frontend tipa `Paginated<T>` exatamente como
`{ items, total, page, page_size, pages }`. Endpoints legados que ainda
retornam array simples **não foram alterados** nesta demanda — migram nas suas
próprias demandas (a Demanda 7 fecha o restante).

## Índices

A ordenação default precisa de índice para não fazer full scan. O piloto usa
`occurred_at desc`, coberto por `idx_stock_movements_occurred_at` (migration
`0011_add_sort_indexes`, espelhado em `StockMovement.__table_args__`). Ao
adicionar uma nova coluna de ordenação default em outro módulo, garanta o
índice correspondente (migration + `__table_args__` no model).

## Exemplo real de resposta (piloto, `page_size=2`)

```json
{
  "items": [
    {
      "id": "ffffffff-ffff-ffff-ffff-ffffff000042",
      "stock_item_id": "55555555-5555-5555-5555-555555555002",
      "stock_item_name": "Café Arábica Superior (saca 60kg)",
      "movement_type": "saida",
      "quantity": "15.000",
      "unit_cost": "650.00",
      "total_value": "9750.00",
      "description": "Venda NF-0002 - café superior",
      "source_module": "comercial",
      "reference_id": "99999999-9999-9999-9999-999999999002",
      "occurred_at": "2026-03-15T14:35:00Z",
      "created_at": "2026-06-02T01:21:26.401915Z"
    }
  ],
  "total": 15,
  "page": 1,
  "page_size": 2,
  "pages": 8
}
```
