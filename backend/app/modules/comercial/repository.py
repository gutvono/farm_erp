from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.comercial.model import Client, Sale, SaleItem
from app.modules.comercial.schemas import ClientCreate, ClientUpdate, SaleCreate
from app.modules.estoque.model import StockItem
from app.shared.enums import SaleStatus


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
        notes=data.notes,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def list_clients(
    db: Session,
    *,
    is_delinquent: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Client]:
    query = db.query(Client).filter(Client.deleted_at.is_(None))
    if is_delinquent is not None:
        query = query.filter(Client.is_delinquent == is_delinquent)
    return query.order_by(Client.name.asc()).offset(skip).limit(limit).all()


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
    total_amount = sum(
        Decimal(str(item.quantity)) * Decimal(str(item.unit_price))
        for item in data.items
    )

    sale = Sale(
        client_id=data.client_id,
        total_amount=total_amount,
        sold_at=sold_at,
        notes=data.notes,
        status=SaleStatus.REALIZADA,
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
    status: Optional[SaleStatus] = None,
    client_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Sale]:
    query = db.query(Sale).filter(Sale.deleted_at.is_(None))
    if status:
        query = query.filter(Sale.status == status)
    if client_id:
        query = query.filter(Sale.client_id == client_id)
    sales = (
        query.order_by(Sale.sold_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for sale in sales:
        _load_relations(db, sale)
    return sales


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
