from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.modules.comercial.model import Client, Sale, SaleItem
from app.modules.comercial.schemas import ClientCreate, ClientUpdate, SaleCreate
from app.modules.estoque.model import StockItem
from app.shared.enums import SaleStatus
from app.shared.pagination import PageParams, paginate_query

# Colunas permitidas em ?order_by (validadas por allowlist no paginate_query).
CLIENT_ORDER_COLUMNS = {
    "name": Client.name,
    "created_at": Client.created_at,
}
SALE_ORDER_COLUMNS = {
    "sold_at": Sale.sold_at,
    "status": Sale.status,
}


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


def create_client(db: Session, data: ClientCreate) -> Client:
    client = Client(
        name=data.name,
        document=data.document,
        email=data.email,
        phone=data.phone,
        address=data.address,
        cep=data.cep,
        street=data.street,
        number=data.number,
        complement=data.complement,
        neighborhood=data.neighborhood,
        city=data.city,
        state=data.state,
        notes=data.notes,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def list_clients(
    db: Session,
    *,
    params: PageParams,
    is_delinquent: Optional[bool] = None,
    effective_overdue_ids: Optional[list[UUID]] = None,
) -> tuple[list[Client], int]:
    """Lista clientes ativos, paginado. Filtro `is_delinquent`; `search` por
    nome OU documento; `order_by` allowlist: name (default), created_at.

    Quando `is_delinquent` é True, o filtro é a inadimplência **efetiva**
    (Demanda 9.B): `is_delinquent` (manual) OU `id ∈ effective_overdue_ids`
    (clientes com parcela vencida, calculado pelo Financeiro)."""
    query = db.query(Client).filter(Client.deleted_at.is_(None))
    if is_delinquent is True:
        # Inadimplência EFETIVA: manual OU vencida (Demanda 9.B).
        manual = Client.is_delinquent.is_(True)
        if effective_overdue_ids:
            query = query.filter(or_(manual, Client.id.in_(effective_overdue_ids)))
        else:
            query = query.filter(manual)
    elif is_delinquent is False:
        # Comportamento atual (não-efetivo): apenas o flag manual.
        query = query.filter(Client.is_delinquent.is_(False))
    if params.search:
        like = f"%{params.search}%"
        query = query.filter(
            or_(Client.name.ilike(like), Client.document.ilike(like))
        )
    return paginate_query(
        query,
        params,
        allowed_order_by=CLIENT_ORDER_COLUMNS,
        default_order=Client.name.asc(),
        tiebreaker=Client.id,
    )


def get_client(db: Session, client_id: UUID) -> Optional[Client]:
    return (
        db.query(Client)
        .filter(Client.id == client_id, Client.deleted_at.is_(None))
        .first()
    )


def update_client(db: Session, client_id: UUID, data: ClientUpdate) -> Optional[Client]:
    client = get_client(db, client_id)
    if not client:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(client, key, value)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def update_client_delinquent(db: Session, client_id: UUID, is_delinquent: bool) -> Optional[Client]:
    client = get_client(db, client_id)
    if not client:
        return None
    client.is_delinquent = is_delinquent
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def soft_delete_client(db: Session, client_id: UUID) -> Optional[Client]:
    client = get_client(db, client_id)
    if not client:
        return None
    client.deleted_at = datetime.now(timezone.utc)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------


def create_sale(db: Session, data: SaleCreate) -> Sale:
    sold_at = data.sold_at or datetime.now(timezone.utc)
    items_total = sum(
        Decimal(str(item.quantity)) * Decimal(str(item.unit_price))
        for item in data.items
    )
    shipping = Decimal(str(data.shipping_cost or 0))
    # Desconto de cabeçalho (Demanda 9.C): % sobre o subtotal dos itens, em R$
    # quantizado a 0.01. total_amount é o LÍQUIDO (subtotal − desconto + frete);
    # o unit_price/subtotal dos itens NÃO muda (preço de tabela preservado).
    discount_percent = Decimal(str(data.discount_percent or 0))
    discount_amount = (items_total * discount_percent / Decimal("100")).quantize(
        Decimal("0.01")
    )
    total_amount = items_total - discount_amount + shipping

    sale = Sale(
        client_id=data.client_id,
        total_amount=total_amount,
        discount_percent=discount_percent,
        discount_amount=discount_amount,
        shipping_cost=shipping,
        sold_at=sold_at,
        notes=data.notes,
        status=SaleStatus.REALIZADA,
        installments=data.installments,
        first_due_date=data.first_due_date,
        installment_interval_days=data.installment_interval_days,
        payment_method=data.payment_method.value if data.payment_method else None,
    )
    db.add(sale)
    db.flush()  # get sale.id before creating items

    for item_data in data.items:
        qty = Decimal(str(item_data.quantity))
        price = Decimal(str(item_data.unit_price))
        sale_item = SaleItem(
            sale_id=sale.id,
            stock_item_id=item_data.stock_item_id,
            description=item_data.description,
            quantity=qty,
            unit_price=price,
            subtotal=qty * price,
        )
        db.add(sale_item)

    db.commit()
    db.refresh(sale)
    _load_relations(db, sale)
    return sale


def list_sales(
    db: Session,
    *,
    params: PageParams,
    status: Optional[SaleStatus] = None,
    client_id: Optional[UUID] = None,
) -> tuple[list[Sale], int]:
    """Lista vendas ativas, paginado. Filtros `status`/`client_id`; `order_by`
    allowlist: sold_at (default desc, indexado), status."""
    query = db.query(Sale).filter(Sale.deleted_at.is_(None))
    if status:
        query = query.filter(Sale.status == status)
    if client_id:
        query = query.filter(Sale.client_id == client_id)
    sales, total = paginate_query(
        query,
        params,
        allowed_order_by=SALE_ORDER_COLUMNS,
        default_order=Sale.sold_at.desc(),
        tiebreaker=Sale.id,
    )
    for sale in sales:
        _load_relations(db, sale)
    return sales, total


def get_sale(db: Session, sale_id: UUID) -> Optional[Sale]:
    sale = (
        db.query(Sale)
        .filter(Sale.id == sale_id, Sale.deleted_at.is_(None))
        .first()
    )
    if sale:
        _load_relations(db, sale)
    return sale


def update_sale_status(
    db: Session, sale_id: UUID, status: SaleStatus, delivered_at: Optional[datetime] = None
) -> Optional[Sale]:
    sale = get_sale(db, sale_id)
    if not sale:
        return None
    sale.status = status
    if status == SaleStatus.ENTREGUE:
        sale.delivered_at = delivered_at or datetime.now(timezone.utc)
    db.add(sale)
    db.commit()
    db.refresh(sale)
    _load_relations(db, sale)
    return sale


def soft_delete_sale(db: Session, sale_id: UUID) -> Optional[Sale]:
    sale = get_sale(db, sale_id)
    if not sale:
        return None
    sale.deleted_at = datetime.now(timezone.utc)
    db.add(sale)
    db.commit()
    db.refresh(sale)
    return sale


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_relations(db: Session, sale: Sale) -> None:
    """Eager-load client and stock_item name for each item (SaleItem has no stock_item relationship)."""
    _ = sale.client
    stock_ids = [item.stock_item_id for item in sale.items]
    stock_map: dict = {}
    if stock_ids:
        rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in rows}
    for item in sale.items:
        item.__dict__["stock_item"] = stock_map.get(item.stock_item_id)


# ---------------------------------------------------------------------------
# Sales report aggregations (Demanda 10 — fatia operacional)
# ---------------------------------------------------------------------------
#
# Período filtrado por `sold_at` (cast a data). Vendas canceladas ficam FORA de
# todas as agregações de total (faturamento, ticket, mix, séries, tops); só a
# quebra por status (`sales_by_status`) as inclui. Sempre `deleted_at IS NULL`.


def _period_filter(start: date, end: date) -> list:
    return [
        Sale.deleted_at.is_(None),
        func.date(Sale.sold_at) >= start,
        func.date(Sale.sold_at) <= end,
    ]


def _not_cancelled():
    return Sale.status != SaleStatus.CANCELADA


def _period_expr(granularity: str):
    """Expressão SQL do rótulo de período da série temporal por granularidade."""
    g = (granularity or "month").lower()
    if g == "day":
        return func.to_char(Sale.sold_at, "YYYY-MM-DD")
    if g == "week":
        return func.to_char(func.date_trunc("week", Sale.sold_at), "YYYY-MM-DD")
    return func.to_char(Sale.sold_at, "YYYY-MM")


def sales_summary(db: Session, *, start: date, end: date) -> tuple[Decimal, int]:
    """Faturamento (Σ total_amount, já líquido pós-desconto D9) e nº de vendas
    NÃO canceladas no período."""
    row = (
        db.query(
            func.coalesce(func.sum(Sale.total_amount), 0),
            func.count(Sale.id),
        )
        .filter(*_period_filter(start, end), _not_cancelled())
        .one()
    )
    return Decimal(row[0]), int(row[1])


def sales_by_status(
    db: Session, *, start: date, end: date
) -> list[tuple[str, int, Decimal]]:
    """Quebra por status no período — única agregação que INCLUI canceladas."""
    rows = (
        db.query(
            Sale.status,
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total_amount), 0),
        )
        .filter(*_period_filter(start, end))
        .group_by(Sale.status)
        .all()
    )
    return [
        (getattr(status, "value", status), int(count), Decimal(total))
        for status, count, total in rows
    ]


def sales_mix(
    db: Session, *, start: date, end: date
) -> list[tuple[str, int, Decimal]]:
    """Mix à vista × parcelado (parcelado = `installments > 1`), NÃO canceladas."""
    categoria = case((Sale.installments > 1, "parcelado"), else_="a_vista")
    rows = (
        db.query(
            categoria.label("categoria"),
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total_amount), 0),
        )
        .filter(*_period_filter(start, end), _not_cancelled())
        .group_by(categoria)
        .all()
    )
    return [(cat, int(count), Decimal(total)) for cat, count, total in rows]


def sales_timeseries(
    db: Session, *, start: date, end: date, granularity: str = "month"
) -> list[tuple[str, int, Decimal]]:
    """Série temporal de faturamento/contagem por granularidade, NÃO canceladas."""
    period = _period_expr(granularity)
    rows = (
        db.query(
            period.label("period"),
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total_amount), 0),
        )
        .filter(*_period_filter(start, end), _not_cancelled())
        .group_by(period)
        .order_by(period)
        .all()
    )
    return [(prd, int(count), Decimal(total)) for prd, count, total in rows]


def top_products(
    db: Session, *, start: date, end: date, limit: int = 5
) -> list[tuple[UUID, str, Decimal, Decimal]]:
    """Top produtos por faturamento (Σ subtotal, a preço de tabela) e quantidade,
    a partir de `sale_items` de vendas NÃO canceladas."""
    rows = (
        db.query(
            SaleItem.stock_item_id,
            StockItem.name,
            func.coalesce(func.sum(SaleItem.quantity), 0),
            func.coalesce(func.sum(SaleItem.subtotal), 0),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .outerjoin(StockItem, StockItem.id == SaleItem.stock_item_id)
        .filter(*_period_filter(start, end), _not_cancelled())
        .group_by(SaleItem.stock_item_id, StockItem.name)
        .order_by(func.coalesce(func.sum(SaleItem.subtotal), 0).desc())
        .limit(limit)
        .all()
    )
    return [
        (stock_item_id, name or "", Decimal(qty), Decimal(total))
        for stock_item_id, name, qty, total in rows
    ]


def top_clients(
    db: Session, *, start: date, end: date, limit: int = 5
) -> list[tuple[UUID, str, int, Decimal]]:
    """Top clientes por faturamento (Σ total_amount) e nº de vendas NÃO canceladas."""
    rows = (
        db.query(
            Sale.client_id,
            Client.name,
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total_amount), 0),
        )
        .outerjoin(Client, Client.id == Sale.client_id)
        .filter(*_period_filter(start, end), _not_cancelled())
        .group_by(Sale.client_id, Client.name)
        .order_by(func.coalesce(func.sum(Sale.total_amount), 0).desc())
        .limit(limit)
        .all()
    )
    return [
        (client_id, name or "", int(count), Decimal(total))
        for client_id, name, count, total in rows
    ]
