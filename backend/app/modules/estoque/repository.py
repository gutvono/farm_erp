from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.modules.estoque.model import StockItem, StockMovement
from app.modules.estoque.schemas import StockItemCreate, StockItemUpdate, StockMovementCreate
from app.shared.enums import MovementType
from app.shared.pagination import PageParams, paginate_query


# ---------------------------------------------------------------------------
# Stock Items
# ---------------------------------------------------------------------------


def create_item(db: Session, data: StockItemCreate) -> StockItem:
    item = StockItem(
        sku=data.sku,
        name=data.name,
        category_id=data.category_id,
        unit=data.unit,
        minimum_stock=data.minimum_stock,
        unit_cost=data.unit_cost,
        hourly_cost=data.hourly_cost,
        description=data.description,
        quantity_on_hand=Decimal("0"),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_items(
    db: Session,
    *,
    category_id: Optional[UUID] = None,
    item_ids: Optional[list[UUID]] = None,
    below_minimum: bool = False,
    skip: int = 0,
    limit: int = 100,
) -> list[StockItem]:
    query = (
        db.query(StockItem)
        .options(joinedload(StockItem.category))
        .filter(StockItem.deleted_at.is_(None))
    )
    if category_id is not None:
        query = query.filter(StockItem.category_id == category_id)
    if item_ids is not None:
        # Filtro por papel resolvido no service (lista de ids). Lista vazia →
        # nenhum item (in_([]) é sempre falso), comportamento correto.
        query = query.filter(StockItem.id.in_(item_ids))
    items = query.order_by(StockItem.name.asc()).offset(skip).limit(limit).all()
    if below_minimum:
        items = [i for i in items if Decimal(i.quantity_on_hand) < Decimal(i.minimum_stock)]
    return items


def get_item(db: Session, item_id: UUID) -> Optional[StockItem]:
    return (
        db.query(StockItem)
        .options(joinedload(StockItem.category))
        .filter(StockItem.id == item_id, StockItem.deleted_at.is_(None))
        .first()
    )


def get_item_by_sku(db: Session, sku: str) -> Optional[StockItem]:
    return (
        db.query(StockItem)
        .filter(StockItem.sku == sku, StockItem.deleted_at.is_(None))
        .first()
    )


def update_item(db: Session, item_id: UUID, data: StockItemUpdate) -> Optional[StockItem]:
    item = get_item(db, item_id)
    if not item:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def soft_delete_item(db: Session, item_id: UUID) -> Optional[StockItem]:
    item = get_item(db, item_id)
    if not item:
        return None
    item.deleted_at = datetime.now(timezone.utc)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_inventory(db: Session) -> list[StockItem]:
    return (
        db.query(StockItem)
        .options(joinedload(StockItem.category))
        .filter(StockItem.deleted_at.is_(None))
        .order_by(StockItem.name.asc())
        .all()
    )


# ---------------------------------------------------------------------------
# Stock Movements
# ---------------------------------------------------------------------------


def create_movement(db: Session, data: StockMovementCreate) -> StockMovement:
    """
    Create a stock movement and update quantity_on_hand on the item.
    Raises ValueError if saida would result in negative stock.
    """
    item = db.query(StockItem).filter(StockItem.id == data.stock_item_id).first()
    if not item:
        raise ValueError("Item de estoque não encontrado")

    quantity = Decimal(str(data.quantity))
    unit_cost = Decimal(str(data.unit_cost))
    total_value = quantity * unit_cost

    if data.movement_type == MovementType.SAIDA:
        new_qty = Decimal(item.quantity_on_hand) - quantity
        if new_qty < 0:
            raise ValueError(
                f"Estoque insuficiente. Disponível: {item.quantity_on_hand} {item.unit}"
            )
        item.quantity_on_hand = new_qty
    else:
        item.quantity_on_hand = Decimal(item.quantity_on_hand) + quantity

    movement = StockMovement(
        stock_item_id=data.stock_item_id,
        movement_type=data.movement_type,
        quantity=quantity,
        unit_cost=unit_cost,
        total_value=total_value,
        description=data.description,
        source_module=data.source_module,
        reference_id=data.reference_id,
        occurred_at=data.occurred_at or datetime.now(timezone.utc),
    )
    db.add(item)
    db.add(movement)
    db.commit()
    db.refresh(movement)
    # Eager load stock_item for serialization
    db.refresh(movement)
    _ = movement.stock_item
    return movement


# Columns allowed for ordering the movements list (allowlist guards against
# arbitrary/invalid order_by values reaching the database).
MOVEMENT_ORDER_COLUMNS = {
    "occurred_at": StockMovement.occurred_at,
    "quantity": StockMovement.quantity,
    "total_value": StockMovement.total_value,
    "unit_cost": StockMovement.unit_cost,
}


def list_movements_paginated(
    db: Session,
    *,
    params: PageParams,
    stock_item_id: Optional[UUID] = None,
    movement_type: Optional[MovementType] = None,
    source_module: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> tuple[list[StockMovement], int]:
    """List stock movements applying filters + generic pagination/ordering.

    Returns ``(movements, total)`` where ``total`` is the full filtered count.
    Default order is ``occurred_at desc``. ``params.search`` matches the movement
    description OR the stock item name (ILIKE); ``start_date``/``end_date`` filter
    ``occurred_at``.
    """
    query = db.query(StockMovement)
    if stock_item_id:
        query = query.filter(StockMovement.stock_item_id == stock_item_id)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    if source_module:
        query = query.filter(StockMovement.source_module == source_module)
    if start_date:
        query = query.filter(StockMovement.occurred_at >= start_date)
    if end_date:
        query = query.filter(StockMovement.occurred_at <= end_date)
    if params.search:
        from sqlalchemy import or_

        # Join no item para buscar também pelo nome. Movimentos sempre têm
        # stock_item_id (FK NOT NULL), então inner join é seguro.
        like = f"%{params.search}%"
        query = query.join(StockItem, StockItem.id == StockMovement.stock_item_id)
        query = query.filter(
            or_(StockMovement.description.ilike(like), StockItem.name.ilike(like))
        )

    movements, total = paginate_query(
        query,
        params,
        allowed_order_by=MOVEMENT_ORDER_COLUMNS,
        default_order=StockMovement.occurred_at.desc(),
        tiebreaker=StockMovement.id,
    )
    # Eager load stock_item for serialization
    for m in movements:
        _ = m.stock_item
    return movements, total


def get_movement(db: Session, movement_id: UUID) -> Optional[StockMovement]:
    movement = db.query(StockMovement).filter(StockMovement.id == movement_id).first()
    if movement:
        _ = movement.stock_item
    return movement
