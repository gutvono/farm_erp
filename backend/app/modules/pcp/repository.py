from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.pcp.model import (
    Plot,
    PlotActivity,
    ProductionHarvest,
    ProductionInput,
    ProductionOrder,
    ProductionOrderService,
    ProductionOrderWorker,
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
        hours_spent=data.hours_spent,
        employee_id=data.employee_id,
        quantity_applied=data.quantity_applied,
        quantity_unit=data.quantity_unit,
        result=data.result,
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


def gerar_numero_ordem(db: Session) -> str:
    """OP-{ANO}-{SEQ:03d} — busca maior seq do ano corrente e incrementa."""
    year = datetime.now(timezone.utc).year
    prefix = f"OP-{year}-"
    latest = (
        db.query(ProductionOrder.order_number)
        .filter(ProductionOrder.order_number.like(f"{prefix}%"))
        .order_by(ProductionOrder.order_number.desc())
        .first()
    )
    next_seq = 1
    if latest and latest[0]:
        try:
            next_seq = int(latest[0].split("-")[-1]) + 1
        except (ValueError, IndexError):
            next_seq = 1
    return f"{prefix}{next_seq:03d}"


def create_order(
    db: Session,
    data: ProductionOrderCreate,
    input_cost_map: dict[UUID, Decimal],
    workers_data: list[dict],
    services_data: list[dict],
) -> ProductionOrder:
    """
    Create a ProductionOrder with PLANEJADA status.
    `input_cost_map` maps stock_item_id → unit_cost (resolved by service layer).
    `workers_data`: [{employee_id, salary_snapshot, is_responsible}]
    `services_data`: [{supplier_id, description, amount, due_date}]
    """
    order_number = gerar_numero_ordem(db)
    order = ProductionOrder(
        plot_id=data.plot_id,
        order_number=order_number,
        planned_date=data.planned_date,
        start_date=data.start_date,
        expected_end_date=data.expected_end_date,
        executed_at=None,
        total_sacas=Decimal("0"),
        especial_sacas=Decimal("0"),
        superior_sacas=Decimal("0"),
        tradicional_sacas=Decimal("0"),
        total_cost=Decimal("0"),
        estimated_cost=Decimal("0"),
        realized_cost=Decimal("0"),
        harvest_progress=Decimal("0"),
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

    for w in workers_data:
        db.add(
            ProductionOrderWorker(
                production_order_id=order.id,
                employee_id=w["employee_id"],
                salary_snapshot=w["salary_snapshot"],
                is_responsible=w["is_responsible"],
            )
        )

    for s in services_data:
        db.add(
            ProductionOrderService(
                production_order_id=order.id,
                supplier_id=s["supplier_id"],
                description=s["description"],
                amount=s["amount"],
                due_date=s["due_date"],
            )
        )

    db.flush()

    order.total_cost = total_cost
    db.commit()
    db.refresh(order)
    _ = order.inputs
    _ = order.workers
    _ = order.services
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
        _ = o.harvests
        _ = o.workers
        _ = o.services
    return orders


def list_orders_for_report(db: Session) -> list[ProductionOrder]:
    """All non-deleted orders, ordered by created_at desc, with inputs and harvests eagerly loaded."""
    orders = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.deleted_at.is_(None))
        .order_by(ProductionOrder.created_at.desc())
        .all()
    )
    for o in orders:
        _ = o.inputs
        _ = o.harvests
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
        _ = order.workers
        _ = order.services
    return order


def get_order_with_harvests(db: Session, order_id: UUID) -> Optional[ProductionOrder]:
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
        _ = order.harvests
        _ = order.workers
        _ = order.services
    return order


def has_active_order_for_plot(
    db: Session, plot_id: UUID, exclude_order_id: Optional[UUID] = None
) -> bool:
    """Returns True if the plot already has an order with status em_execucao or pausada."""
    query = db.query(ProductionOrder).filter(
        ProductionOrder.plot_id == plot_id,
        ProductionOrder.status.in_([
            ProductionOrderStatus.EM_EXECUCAO,
            ProductionOrderStatus.PAUSADA,
        ]),
        ProductionOrder.deleted_at.is_(None),
    )
    if exclude_order_id:
        query = query.filter(ProductionOrder.id != exclude_order_id)
    return query.first() is not None


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


def get_employee_ids_in_active_productions(db: Session) -> list[UUID]:
    """
    Retorna IDs de funcionários em ordens ativas (não concluídas/canceladas).
    Usado para bloquear seleção no frontend.
    """
    active_statuses = [
        ProductionOrderStatus.PLANEJADA,
        ProductionOrderStatus.EM_PRODUCAO,
        ProductionOrderStatus.EM_EXECUCAO,
        ProductionOrderStatus.PAUSADA,
    ]
    rows = (
        db.query(ProductionOrderWorker.employee_id)
        .join(
            ProductionOrder,
            ProductionOrder.id == ProductionOrderWorker.production_order_id,
        )
        .filter(
            ProductionOrder.status.in_(active_statuses),
            ProductionOrder.deleted_at.is_(None),
        )
        .all()
    )
    return [r.employee_id for r in rows]


def set_service_accounts_payable(
    db: Session, service_id: UUID, accounts_payable_id: UUID
) -> None:
    service = (
        db.query(ProductionOrderService)
        .filter(ProductionOrderService.id == service_id)
        .first()
    )
    if service:
        service.accounts_payable_id = accounts_payable_id
        db.add(service)


def soft_delete_order(db: Session, order_id: UUID) -> Optional[ProductionOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    order.deleted_at = datetime.now(timezone.utc)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


# ---------------------------------------------------------------------------
# Production Harvests
# ---------------------------------------------------------------------------


def create_harvest(
    db: Session,
    *,
    order_id: UUID,
    percentage_harvested: Decimal,
    sacks_total: Decimal,
    sacks_especial: Decimal,
    sacks_superior: Decimal,
    sacks_tradicional: Decimal,
    inputs_consumed: list[dict[str, Any]],
    is_final: bool,
) -> ProductionHarvest:
    """Cria registro de colheita parcial. harvest_number = total atual + 1."""
    current_count = (
        db.query(func.count(ProductionHarvest.id))
        .filter(ProductionHarvest.production_order_id == order_id)
        .scalar()
        or 0
    )
    harvest = ProductionHarvest(
        production_order_id=order_id,
        harvest_number=current_count + 1,
        percentage_harvested=percentage_harvested,
        sacks_total=sacks_total,
        sacks_especial=sacks_especial,
        sacks_superior=sacks_superior,
        sacks_tradicional=sacks_tradicional,
        inputs_consumed=inputs_consumed,
        is_final=is_final,
    )
    db.add(harvest)
    db.commit()
    db.refresh(harvest)
    return harvest


def update_order_harvest_progress(
    db: Session,
    order_id: UUID,
    *,
    additional_percentage: Decimal,
    additional_sacks_total: Decimal,
    additional_sacks_especial: Decimal,
    additional_sacks_superior: Decimal,
    additional_sacks_tradicional: Decimal,
) -> Optional[ProductionOrder]:
    """
    Acumula totais e progresso na ordem. Se atingir 100%, marca como concluida
    e preenche executed_at.
    """
    order = get_order(db, order_id)
    if not order:
        return None
    order.harvest_progress = Decimal(order.harvest_progress) + additional_percentage
    order.total_sacas = Decimal(order.total_sacas) + additional_sacks_total
    order.especial_sacas = Decimal(order.especial_sacas) + additional_sacks_especial
    order.superior_sacas = Decimal(order.superior_sacas) + additional_sacks_superior
    order.tradicional_sacas = (
        Decimal(order.tradicional_sacas) + additional_sacks_tradicional
    )
    if Decimal(order.harvest_progress) >= Decimal("100"):
        order.status = ProductionOrderStatus.CONCLUIDA
        order.executed_at = datetime.now(timezone.utc)
    elif order.status == ProductionOrderStatus.PLANEJADA:
        order.status = ProductionOrderStatus.EM_EXECUCAO
    db.add(order)
    db.commit()
    db.refresh(order)
    return order
