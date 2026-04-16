import random
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.estoque import service as estoque_service
from app.modules.estoque.model import StockItem
from app.modules.financeiro import service as fin_service
from app.modules.pcp import repository as pcp_repo
from app.modules.pcp.model import Plot, PlotActivity, ProductionOrder
from app.modules.pcp.schemas import (
    PlotActivityCreate,
    PlotCreate,
    PlotUpdate,
    ProductionInputOut,
    ProductionOrderCreate,
    ProductionResult,
)
from app.shared.enums import (
    FinancialCategory,
    MovementType,
    ProductionOrderStatus,
    StockCategory,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_plot_or_404(db: Session, plot_id: UUID) -> Plot:
    plot = pcp_repo.get_plot(db, plot_id)
    if not plot:
        raise HTTPException(status_code=404, detail="Talhão não encontrado")
    return plot


def _get_order_or_404(db: Session, order_id: UUID) -> ProductionOrder:
    order = pcp_repo.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de produção não encontrada")
    return order


def _stock_map(db: Session, stock_ids: list[UUID]) -> dict[UUID, StockItem]:
    if not stock_ids:
        return {}
    rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
    return {s.id: s for s in rows}


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _serialize_inputs(db: Session, order: ProductionOrder) -> list[ProductionInputOut]:
    stock_ids = [pi.stock_item_id for pi in order.inputs]
    smap = _stock_map(db, stock_ids)
    return [
        ProductionInputOut.from_model(
            pi,
            stock_item_name=smap[pi.stock_item_id].name if pi.stock_item_id in smap else "",
            unit=(smap[pi.stock_item_id].unit.value if pi.stock_item_id in smap else ""),
        )
        for pi in order.inputs
    ]


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------


def create_plot(db: Session, data: PlotCreate) -> Plot:
    return pcp_repo.create_plot(db, data)


def list_plots(db: Session, skip: int = 0, limit: int = 100) -> list[Plot]:
    return pcp_repo.list_plots(db, skip=skip, limit=limit)


def get_plot(db: Session, plot_id: UUID) -> Plot:
    return _get_plot_or_404(db, plot_id)


def update_plot(db: Session, plot_id: UUID, data: PlotUpdate) -> Plot:
    _get_plot_or_404(db, plot_id)
    plot = pcp_repo.update_plot(db, plot_id, data)
    return plot


def soft_delete_plot(db: Session, plot_id: UUID) -> Plot:
    _get_plot_or_404(db, plot_id)
    return pcp_repo.soft_delete_plot(db, plot_id)


# ---------------------------------------------------------------------------
# Plot Activities
# ---------------------------------------------------------------------------


def add_activity(db: Session, data: PlotActivityCreate) -> PlotActivity:
    plot = _get_plot_or_404(db, data.plot_id)

    activity = pcp_repo.create_activity(db, data)

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.PRODUCAO,
        amount=Decimal(str(activity.cost)),
        description=f"Atividade no talhão {plot.name}: {activity.activity_type.value}",
        source_module="pcp",
        reference_id=plot.id,
    )

    return activity


def list_activities(
    db: Session,
    *,
    plot_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[PlotActivity]:
    return pcp_repo.list_activities(db, plot_id=plot_id, skip=skip, limit=limit)


# ---------------------------------------------------------------------------
# Production Orders
# ---------------------------------------------------------------------------


def create_order(db: Session, data: ProductionOrderCreate) -> ProductionOrder:
    _get_plot_or_404(db, data.plot_id)

    stock_ids = [pi.stock_item_id for pi in data.inputs]
    smap = _stock_map(db, stock_ids)
    for pi in data.inputs:
        item = smap.get(pi.stock_item_id)
        if not item or item.deleted_at is not None:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {pi.stock_item_id}",
            )

    input_cost_map = {s.id: Decimal(str(s.unit_cost)) for s in smap.values()}

    order = pcp_repo.create_order(db, data, input_cost_map)
    return order


def list_orders(
    db: Session,
    *,
    status: Optional[ProductionOrderStatus] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[ProductionOrder]:
    return pcp_repo.list_orders(db, status=status, skip=skip, limit=limit)


def get_order(db: Session, order_id: UUID) -> ProductionOrder:
    return _get_order_or_404(db, order_id)


def soft_delete_order(db: Session, order_id: UUID) -> ProductionOrder:
    order = _get_order_or_404(db, order_id)
    if order.status != ProductionOrderStatus.PLANEJADA:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens com status 'Planejada' podem ser excluídas",
        )
    return pcp_repo.soft_delete_order(db, order_id)


# ---------------------------------------------------------------------------
# Produzir Safra — método central do módulo
# ---------------------------------------------------------------------------


def _simulate_harvest(capacity: Decimal) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    Distribui sacas entre qualidades conforme algoritmo do módulo:
    - total = capacity × random(0.90, 1.10)
    - especial: 15–25%
    - superior: 45–55%
    - tradicional: resto (garante soma exata)
    """
    variation = Decimal(str(random.uniform(0.90, 1.10)))
    total = _quantize(Decimal(str(capacity)) * variation)

    especial_pct = Decimal(str(random.uniform(0.15, 0.25)))
    superior_pct = Decimal(str(random.uniform(0.45, 0.55)))

    especial = _quantize(total * especial_pct)
    superior = _quantize(total * superior_pct)
    tradicional = _quantize(total - especial - superior)

    if tradicional < 0:
        tradicional = Decimal("0.000")
        superior = _quantize(total - especial)
        if superior < 0:
            superior = Decimal("0.000")
            especial = total

    return total, especial, superior, tradicional


def _find_quality_item(
    db: Session, quality_keyword: str
) -> Optional[StockItem]:
    items = (
        db.query(StockItem)
        .filter(
            StockItem.category == StockCategory.CAFE,
            StockItem.deleted_at.is_(None),
        )
        .all()
    )
    keyword = quality_keyword.lower()
    for item in items:
        if keyword in item.name.lower():
            return item
    return None


def produzir_safra(db: Session, order_id: UUID) -> ProductionResult:
    order = _get_order_or_404(db, order_id)

    if order.status in (
        ProductionOrderStatus.CONCLUIDA,
        ProductionOrderStatus.CANCELADA,
    ):
        raise HTTPException(status_code=400, detail="Ordem já finalizada")

    plot = _get_plot_or_404(db, order.plot_id)

    # 1. Valida disponibilidade dos insumos
    stock_ids = [pi.stock_item_id for pi in order.inputs]
    smap = _stock_map(db, stock_ids)
    for pi in order.inputs:
        item = smap.get(pi.stock_item_id)
        if not item:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {pi.stock_item_id}",
            )
        available = estoque_service.verificar_disponibilidade(
            db, pi.stock_item_id, Decimal(str(pi.quantity))
        )
        if not available:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Estoque insuficiente para: {item.name}. "
                    f"Disponível: {item.quantity_on_hand} {item.unit.value}"
                ),
            )

    # 2. Consome os insumos do estoque
    for pi in order.inputs:
        item = smap[pi.stock_item_id]
        estoque_service.registrar_saida(
            db,
            stock_item_id=pi.stock_item_id,
            quantity=Decimal(str(pi.quantity)),
            description=f"Produção de safra #{order.id} — {item.name}",
            source_module="pcp",
            reference_id=order.id,
        )

    # Movimento agregado de consumo (rastreabilidade)
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.PRODUCAO,
        amount=Decimal("0"),
        description=f"Consumo de insumos — Safra #{order.id}",
        source_module="pcp",
        reference_id=order.id,
    )

    # 3. Simula resultado de produção
    capacity = Decimal(str(plot.capacity_sacas))
    total, especial, superior, tradicional = _simulate_harvest(capacity)

    # 4. Insere café produzido no estoque (por qualidade)
    quality_distribution = [
        ("especial", especial),
        ("superior", superior),
        ("tradicional", tradicional),
    ]
    for keyword, quantity in quality_distribution:
        if quantity <= 0:
            continue
        cafe_item = _find_quality_item(db, keyword)
        if not cafe_item:
            continue
        estoque_service.registrar_entrada(
            db,
            stock_item_id=cafe_item.id,
            quantity=quantity,
            unit_cost=Decimal("0"),
            description=f"Produção de safra #{order.id} — {cafe_item.name}",
            source_module="pcp",
            reference_id=order.id,
        )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.PRODUCAO,
        amount=Decimal("0"),
        description=f"Café produzido — Safra #{order.id}: {total} sacas",
        source_module="pcp",
        reference_id=order.id,
    )

    # 5. Atualiza a ordem
    executed_at = datetime.now(timezone.utc)
    pcp_repo.update_order(
        db,
        order.id,
        status=ProductionOrderStatus.CONCLUIDA,
        executed_at=executed_at,
        total_sacas=total,
        especial_sacas=especial,
        superior_sacas=superior,
        tradicional_sacas=tradicional,
    )

    # 6. Recarrega a ordem após múltiplos commits (expiry do __dict__)
    reloaded = pcp_repo.get_order(db, order.id)

    # 7. Verifica insumos abaixo do mínimo após consumo
    items_below: list[str] = []
    for pi in reloaded.inputs:
        item = db.query(StockItem).filter(StockItem.id == pi.stock_item_id).first()
        if item and Decimal(item.quantity_on_hand) < Decimal(item.minimum_stock):
            items_below.append(item.name)

    inputs_out = _serialize_inputs(db, reloaded)

    return ProductionResult(
        order_id=reloaded.id,
        total_sacas=reloaded.total_sacas,
        especial_sacas=reloaded.especial_sacas,
        superior_sacas=reloaded.superior_sacas,
        tradicional_sacas=reloaded.tradicional_sacas,
        inputs_consumed=inputs_out,
        items_below_minimum=items_below,
        executed_at=reloaded.executed_at,
    )


# ---------------------------------------------------------------------------
# Serialization helpers (used by router)
# ---------------------------------------------------------------------------


def serialize_order(db: Session, order: ProductionOrder) -> dict:
    from app.modules.pcp.schemas import ProductionOrderOut

    plot = db.query(Plot).filter(Plot.id == order.plot_id).first()
    plot_name = plot.name if plot else ""
    inputs_out = _serialize_inputs(db, order)
    return ProductionOrderOut.from_model(order, plot_name, inputs_out).model_dump(mode="json")


def serialize_activity(db: Session, activity: PlotActivity) -> dict:
    from app.modules.pcp.schemas import PlotActivityOut

    plot = db.query(Plot).filter(Plot.id == activity.plot_id).first()
    plot_name = plot.name if plot else ""
    return PlotActivityOut.from_model(activity, plot_name).model_dump(mode="json")
