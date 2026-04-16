from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.pcp.model import (
    Plot,
    PlotActivity,
    ProductionInput,
    ProductionOrder,
)
from app.modules.pcp.schemas import (
    PlotActivityCreate,
    PlotCreate,
    PlotUpdate,
    ProductionOrderCreate,
)
from app.shared.enums import ProductionOrderStatus


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------


def create_plot(db: Session, data: PlotCreate) -> Plot:
    plot = Plot(
        name=data.name,
        location=data.location,
        variety=data.variety,
        capacity_sacas=data.capacity_sacas,
        notes=data.notes,
    )
    db.add(plot)
    db.commit()
    db.refresh(plot)
    return plot


def list_plots(db: Session, skip: int = 0, limit: int = 100) -> list[Plot]:
    return (
        db.query(Plot)
        .filter(Plot.deleted_at.is_(None))
        .order_by(Plot.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_plot(db: Session, plot_id: UUID) -> Optional[Plot]:
    return (
        db.query(Plot)
        .filter(Plot.id == plot_id, Plot.deleted_at.is_(None))
        .first()
    )


def update_plot(db: Session, plot_id: UUID, data: PlotUpdate) -> Optional[Plot]:
    plot = get_plot(db, plot_id)
    if not plot:
        return None
    fields = data.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(plot, key, value)
    db.add(plot)
    db.commit()
    db.refresh(plot)
    return plot


def soft_delete_plot(db: Session, plot_id: UUID) -> Optional[Plot]:
    plot = get_plot(db, plot_id)
    if not plot:
        return None
    plot.deleted_at = datetime.now(timezone.utc)
    db.add(plot)
    db.commit()
    db.refresh(plot)
    return plot


# ---------------------------------------------------------------------------
# Plot Activities
# ---------------------------------------------------------------------------


def create_activity(db: Session, data: PlotActivityCreate) -> PlotActivity:
    activity = PlotActivity(
        plot_id=data.plot_id,
        activity_type=data.activity_type,
        activity_date=data.activity_date,
        labor_type=data.labor_type,
        cost=data.cost,
        details=data.details,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


def list_activities(
    db: Session,
    *,
    plot_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[PlotActivity]:
    query = db.query(PlotActivity).filter(PlotActivity.deleted_at.is_(None))
    if plot_id:
        query = query.filter(PlotActivity.plot_id == plot_id)
    return (
        query.order_by(PlotActivity.activity_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Production Orders
# ---------------------------------------------------------------------------


def create_order(
    db: Session,
    data: ProductionOrderCreate,
    input_cost_map: dict[UUID, Decimal],
) -> ProductionOrder:
    """
    Create a ProductionOrder with PLANEJADA status.
    `input_cost_map` maps stock_item_id → unit_cost (resolved by service layer).
    """
    order = ProductionOrder(
        plot_id=data.plot_id,
        planned_date=data.planned_date,
        executed_at=None,
        total_sacas=Decimal("0"),
        especial_sacas=Decimal("0"),
        superior_sacas=Decimal("0"),
        tradicional_sacas=Decimal("0"),
        total_cost=Decimal("0"),
        status=ProductionOrderStatus.PLANEJADA,
        notes=data.notes,
    )
    db.add(order)
    db.flush()

    total_cost = Decimal("0")
    for pi in data.inputs:
        unit_cost = input_cost_map.get(pi.stock_item_id, Decimal("0"))
        subtotal = Decimal(str(pi.quantity)) * unit_cost
        db.add(
            ProductionInput(
                production_order_id=order.id,
                stock_item_id=pi.stock_item_id,
                quantity=pi.quantity,
                unit_cost=unit_cost,
                subtotal=subtotal,
            )
        )
        total_cost += subtotal

    order.total_cost = total_cost
    db.commit()
    db.refresh(order)
    _ = order.inputs
    return order


def list_orders(
    db: Session,
    *,
    status: Optional[ProductionOrderStatus] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[ProductionOrder]:
    query = db.query(ProductionOrder).filter(ProductionOrder.deleted_at.is_(None))
    if status:
        query = query.filter(ProductionOrder.status == status)
    orders = (
        query.order_by(ProductionOrder.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for o in orders:
        _ = o.inputs
    return orders


def get_order(db: Session, order_id: UUID) -> Optional[ProductionOrder]:
    order = (
        db.query(ProductionOrder)
        .filter(
            ProductionOrder.id == order_id,
            ProductionOrder.deleted_at.is_(None),
        )
        .first()
    )
    if order:
        _ = order.inputs
    return order


def update_order(db: Session, order_id: UUID, **kwargs) -> Optional[ProductionOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    for key, value in kwargs.items():
        setattr(order, key, value)
    db.add(order)
    db.commit()
    db.refresh(order)
    _ = order.inputs
    return order


def soft_delete_order(db: Session, order_id: UUID) -> Optional[ProductionOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    order.deleted_at = datetime.now(timezone.utc)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order
