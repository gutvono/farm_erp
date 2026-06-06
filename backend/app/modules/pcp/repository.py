from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.estoque.model import StockItem
from app.modules.folha.model import Employee, JobPosition
from app.modules.pcp.model import (
    Plot,
    PlotActivity,
    ProductionHarvest,
    ProductionInput,
    ProductionOrder,
    ProductionOrderPositionRequirement,
    ProductionOrderResource,
    ProductionOrderService,
)
from app.modules.pcp.schemas import (
    PlotActivityCreate,
    PlotCreate,
    PlotUpdate,
    ProductionOrderCreate,
)
from app.shared.enums import ProductionOrderStatus, SystemRole


# Status "ativos" de uma OP — usados no controle de hectares do talhão (soma de
# hectares_used das OPs ativas não pode exceder total_hectares). Inclui planejada.
ACTIVE_STATUSES = [
    ProductionOrderStatus.PLANEJADA,
    ProductionOrderStatus.EM_PRODUCAO,
    ProductionOrderStatus.EM_EXECUCAO,
    ProductionOrderStatus.PAUSADA,
]

# Status que contam como OP "INICIADA/ocupando" capacidade (Demanda 5.1). Planejar
# é livre → `planejada` NÃO ocupa; `concluida`/`cancelada` liberam. A ocupação de
# recursos reutilizáveis (máquina/veículo) e de pessoas (cargo) é DERIVADA do
# somatório de quantity sobre estas OPs — não há boolean nem campo de "ocupado".
STARTED_STATUSES = [
    ProductionOrderStatus.EM_PRODUCAO,
    ProductionOrderStatus.EM_EXECUCAO,
    ProductionOrderStatus.PAUSADA,
]

# Papéis de recurso REUTILIZÁVEL (ocupam capacidade enquanto a OP está iniciada;
# não são consumidos). Embalagem/insumo são consumíveis e não entram aqui.
REUSABLE_ROLES = [SystemRole.MAQUINA, SystemRole.VEICULO]


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------


def create_plot(db: Session, data: PlotCreate) -> Plot:
    plot = Plot(
        name=data.name,
        location=data.location,
        variety=data.variety,
        capacity_sacas=data.capacity_sacas,
        total_hectares=data.total_hectares,
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


def get_active_hectares_for_plot(
    db: Session, plot_id: UUID, exclude_order_id: Optional[UUID] = None
) -> Decimal:
    """Soma de `hectares_used` das OPs ativas (não concluídas/canceladas) de um talhão."""
    query = db.query(func.coalesce(func.sum(ProductionOrder.hectares_used), 0)).filter(
        ProductionOrder.plot_id == plot_id,
        ProductionOrder.status.in_(ACTIVE_STATUSES),
        ProductionOrder.deleted_at.is_(None),
    )
    if exclude_order_id:
        query = query.filter(ProductionOrder.id != exclude_order_id)
    return Decimal(str(query.scalar() or 0))


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
    requirements_data: list[dict],
    resources_data: list[dict],
    services_data: list[dict],
) -> ProductionOrder:
    """
    Create a ProductionOrder with PLANEJADA status.
    `input_cost_map` maps stock_item_id → unit_cost (resolved by service layer).
    `requirements_data`: [{position_id, quantity, contract_type}]
    `resources_data`: [{stock_item_id, resource_role, quantity, accumulated_hours}]
    `services_data`: [{supplier_id, description, amount, due_date}]
    """
    order_number = gerar_numero_ordem(db)
    order = ProductionOrder(
        plot_id=data.plot_id,
        order_number=order_number,
        hectares_used=data.hectares_used,
        planned_date=data.planned_date,
        start_date=data.start_date,
        expected_end_date=data.expected_end_date,
        executed_at=None,
        total_sacas=Decimal("0"),
        industria_sacas=Decimal("0"),
        embalagem_sacas=Decimal("0"),
        descarte_sacas=Decimal("0"),
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

    for req in requirements_data:
        db.add(
            ProductionOrderPositionRequirement(
                production_order_id=order.id,
                position_id=req["position_id"],
                quantity=req["quantity"],
                contract_type=req["contract_type"],
            )
        )

    for res in resources_data:
        db.add(
            ProductionOrderResource(
                production_order_id=order.id,
                stock_item_id=res["stock_item_id"],
                resource_role=res["resource_role"],
                quantity=res.get("quantity"),
                accumulated_hours=res.get("accumulated_hours", Decimal("0")),
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
    _eager_load(order)
    return order


def _eager_load(order: ProductionOrder) -> None:
    _ = order.inputs
    _ = order.harvests
    _ = order.position_requirements
    _ = order.resources
    _ = order.services


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
        _eager_load(o)
    return orders


def list_orders_for_report(db: Session) -> list[ProductionOrder]:
    """All non-deleted orders, ordered by created_at desc, eagerly loaded."""
    orders = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.deleted_at.is_(None))
        .order_by(ProductionOrder.created_at.desc())
        .all()
    )
    for o in orders:
        _eager_load(o)
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
        _eager_load(order)
    return order


def get_order_with_harvests(db: Session, order_id: UUID) -> Optional[ProductionOrder]:
    return get_order(db, order_id)


def get_started_resource_usage(
    db: Session, *, exclude_order_id: Optional[UUID] = None
) -> dict[UUID, Decimal]:
    """Ocupação DERIVADA de recursos reutilizáveis (máquina/veículo): por
    stock_item_id, a soma de `quantity` em OPs JÁ INICIADAS.

    `quantity` nulo conta como 1 (um recurso = uma unidade). Planejar não ocupa.
    """
    query = (
        db.query(
            ProductionOrderResource.stock_item_id,
            func.coalesce(func.sum(func.coalesce(ProductionOrderResource.quantity, 1)), 0),
        )
        .join(
            ProductionOrder,
            ProductionOrder.id == ProductionOrderResource.production_order_id,
        )
        .filter(
            ProductionOrderResource.resource_role.in_(REUSABLE_ROLES),
            ProductionOrder.status.in_(STARTED_STATUSES),
            ProductionOrder.deleted_at.is_(None),
        )
    )
    if exclude_order_id:
        query = query.filter(ProductionOrder.id != exclude_order_id)
    query = query.group_by(ProductionOrderResource.stock_item_id)
    return {row[0]: Decimal(str(row[1])) for row in query.all()}


def get_started_position_usage(
    db: Session, *, exclude_order_id: Optional[UUID] = None
) -> dict[UUID, Decimal]:
    """Ocupação DERIVADA de pessoas por cargo: por position_id, a soma de
    `quantity` dos requisitos em OPs JÁ INICIADAS. Planejar não ocupa."""
    query = (
        db.query(
            ProductionOrderPositionRequirement.position_id,
            func.coalesce(func.sum(ProductionOrderPositionRequirement.quantity), 0),
        )
        .join(
            ProductionOrder,
            ProductionOrder.id
            == ProductionOrderPositionRequirement.production_order_id,
        )
        .filter(
            ProductionOrder.status.in_(STARTED_STATUSES),
            ProductionOrder.deleted_at.is_(None),
        )
    )
    if exclude_order_id:
        query = query.filter(ProductionOrder.id != exclude_order_id)
    query = query.group_by(ProductionOrderPositionRequirement.position_id)
    return {row[0]: Decimal(str(row[1])) for row in query.all()}


def count_active_headcount_by_position(db: Session, position_id: UUID) -> int:
    """TOTAL de pessoas de um cargo: funcionários ATIVOS (is_active, não deletados)
    com aquele `position_id`."""
    return (
        db.query(Employee)
        .filter(
            Employee.position_id == position_id,
            Employee.is_active.is_(True),
            Employee.deleted_at.is_(None),
        )
        .count()
    )


def list_active_positions(db: Session) -> list[JobPosition]:
    return (
        db.query(JobPosition)
        .filter(JobPosition.deleted_at.is_(None))
        .order_by(JobPosition.name.asc())
        .all()
    )


def get_resource(
    db: Session, order_id: UUID, resource_id: UUID
) -> Optional[ProductionOrderResource]:
    return (
        db.query(ProductionOrderResource)
        .filter(
            ProductionOrderResource.id == resource_id,
            ProductionOrderResource.production_order_id == order_id,
        )
        .first()
    )


def increment_resource_hours(
    db: Session, resource: ProductionOrderResource, hours: Decimal
) -> ProductionOrderResource:
    """Soma `hours` ao `accumulated_hours` do recurso (incremental, null-safe)."""
    resource.accumulated_hours = Decimal(str(resource.accumulated_hours)) + hours
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


def update_order(db: Session, order_id: UUID, **kwargs) -> Optional[ProductionOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    for key, value in kwargs.items():
        setattr(order, key, value)
    db.add(order)
    db.commit()
    db.refresh(order)
    _eager_load(order)
    return order


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
    hectares_harvested: Decimal,
    sacks_total: Decimal,
    sacks_industria: Decimal,
    sacks_embalagem: Decimal,
    sacks_descarte: Decimal,
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
        hectares_harvested=hectares_harvested,
        sacks_total=sacks_total,
        sacks_industria=sacks_industria,
        sacks_embalagem=sacks_embalagem,
        sacks_descarte=sacks_descarte,
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
    additional_sacks_industria: Decimal,
    additional_sacks_embalagem: Decimal,
    additional_sacks_descarte: Decimal,
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
    order.industria_sacas = Decimal(order.industria_sacas) + additional_sacks_industria
    order.embalagem_sacas = Decimal(order.embalagem_sacas) + additional_sacks_embalagem
    order.descarte_sacas = Decimal(order.descarte_sacas) + additional_sacks_descarte
    if Decimal(order.harvest_progress) >= Decimal("100"):
        order.status = ProductionOrderStatus.CONCLUIDA
        order.executed_at = datetime.now(timezone.utc)
    elif order.status == ProductionOrderStatus.PLANEJADA:
        order.status = ProductionOrderStatus.EM_EXECUCAO
    db.add(order)
    db.commit()
    db.refresh(order)
    return order
