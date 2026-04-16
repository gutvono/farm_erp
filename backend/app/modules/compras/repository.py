from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.compras.model import PurchaseOrder, PurchaseOrderItem, Supplier
from app.modules.compras.schemas import PurchaseOrderCreate, SupplierCreate, SupplierUpdate
from app.modules.estoque.model import StockItem
from app.shared.enums import PurchaseOrderStatus


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


def create_supplier(db: Session, data: SupplierCreate) -> Supplier:
    supplier = Supplier(
        name=data.name,
        document=data.document,
        email=data.email,
        phone=data.phone,
        address=data.address,
        notes=data.notes,
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


def list_suppliers(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 100,
) -> list[Supplier]:
    return (
        db.query(Supplier)
        .filter(Supplier.deleted_at.is_(None))
        .order_by(Supplier.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_supplier(db: Session, supplier_id: UUID) -> Optional[Supplier]:
    return (
        db.query(Supplier)
        .filter(Supplier.id == supplier_id, Supplier.deleted_at.is_(None))
        .first()
    )


def update_supplier(db: Session, supplier_id: UUID, data: SupplierUpdate) -> Optional[Supplier]:
    supplier = get_supplier(db, supplier_id)
    if not supplier:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


def soft_delete_supplier(db: Session, supplier_id: UUID) -> Optional[Supplier]:
    supplier = get_supplier(db, supplier_id)
    if not supplier:
        return None
    supplier.deleted_at = datetime.now(timezone.utc)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


# ---------------------------------------------------------------------------
# Purchase Orders
# ---------------------------------------------------------------------------


def create_order(db: Session, data: PurchaseOrderCreate) -> PurchaseOrder:
    ordered_at = data.ordered_at or datetime.now(timezone.utc)
    total_amount = sum(
        Decimal(str(item.quantity)) * Decimal(str(item.unit_price))
        for item in data.items
    )

    order = PurchaseOrder(
        supplier_id=data.supplier_id,
        total_amount=total_amount,
        ordered_at=ordered_at,
        notes=data.notes,
    )
    db.add(order)
    db.flush()  # get order.id before creating items

    for item_data in data.items:
        qty = Decimal(str(item_data.quantity))
        price = Decimal(str(item_data.unit_price))
        order_item = PurchaseOrderItem(
            purchase_order_id=order.id,
            stock_item_id=item_data.stock_item_id,
            description=item_data.description,
            quantity=qty,
            unit_price=price,
            subtotal=qty * price,
        )
        db.add(order_item)

    db.commit()
    db.refresh(order)
    _load_relations(db, order)
    return order


def list_orders(
    db: Session,
    *,
    status: Optional[PurchaseOrderStatus] = None,
    supplier_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[PurchaseOrder]:
    query = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.deleted_at.is_(None))
    )
    if status:
        query = query.filter(PurchaseOrder.status == status)
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    orders = (
        query.order_by(PurchaseOrder.ordered_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for order in orders:
        _load_relations(db, order)
    return orders


def get_order(db: Session, order_id: UUID) -> Optional[PurchaseOrder]:
    order = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == order_id, PurchaseOrder.deleted_at.is_(None))
        .first()
    )
    if order:
        _load_relations(db, order)
    return order


def update_order_status(
    db: Session, order_id: UUID, status: PurchaseOrderStatus
) -> Optional[PurchaseOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    order.status = status
    if status == PurchaseOrderStatus.CONCLUIDA:
        order.received_at = datetime.now(timezone.utc)
    db.add(order)
    db.commit()
    db.refresh(order)
    _load_relations(db, order)
    return order


def soft_delete_order(db: Session, order_id: UUID) -> Optional[PurchaseOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    order.deleted_at = datetime.now(timezone.utc)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_relations(db: Session, order: PurchaseOrder) -> None:
    """Eager-load supplier and stock_item name for each item (PurchaseOrderItem has no stock_item relationship)."""
    _ = order.supplier
    stock_ids = [item.stock_item_id for item in order.items]
    stock_map: dict = {}
    if stock_ids:
        rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in rows}
    for item in order.items:
        # Attach a transient stock_item attribute so PurchaseOrderItemOut.from_model() works
        item.__dict__["stock_item"] = stock_map.get(item.stock_item_id)
