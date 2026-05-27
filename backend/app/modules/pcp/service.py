import random
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.estoque import repository as estoque_repo
from app.modules.estoque import service as estoque_service
from app.modules.estoque.model import StockItem
from app.modules.financeiro import service as fin_service
from app.modules.folha import repository as folha_repo
from app.modules.folha.model import Employee
from app.modules.pcp import repository as pcp_repo
from app.modules.pcp.model import (
    Plot,
    PlotActivity,
    ProductionHarvest,
    ProductionOrder,
)
from app.modules.pcp.schemas import (
    ConsumoInsumoItem,
    CustoPrevistoVsRealizadoItem,
    HarvestOut,
    OrdensResumo,
    PCPReportOut,
    PlotActivityCreate,
    PlotCreate,
    PlotUpdate,
    ProducaoPorTalhaoItem,
    ProductionInputOut,
    ProductionOrderCreate,
    ProductionOrderOut,
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
    order = pcp_repo.get_order_with_harvests(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de produção não encontrada")
    return order


def _stock_map(db: Session, stock_ids: list[UUID]) -> dict[UUID, StockItem]:
    if not stock_ids:
        return {}
    rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
    return {s.id: s for s in rows}


def _quantize3(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _quantize2(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _get_employee(db: Session, employee_id: Optional[UUID]) -> Optional[Employee]:
    if not employee_id:
        return None
    return folha_repo.get_employee(db, employee_id)


def _calcular_custo_mao_obra(
    employee: Optional[Employee],
    start: Optional[Any],
    end: Optional[Any],
) -> Decimal:
    """Salário base / 22 dias úteis × dias trabalhados. Mínimo 1 dia."""
    if not employee or not start or not end:
        return Decimal("0")
    dias = (end - start).days or 1
    if dias < 0:
        return Decimal("0")
    return _quantize2(Decimal(str(employee.base_salary)) / Decimal("22") * Decimal(dias))


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


def _serialize_harvests(order: ProductionOrder) -> list[HarvestOut]:
    return [HarvestOut.from_model(h) for h in sorted(order.harvests, key=lambda h: h.harvest_number)]


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
    if data.employee_id and not folha_repo.get_employee(db, data.employee_id):
        raise HTTPException(status_code=404, detail="Funcionário não encontrado")

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

    if data.responsible_employee_id and not folha_repo.get_employee(
        db, data.responsible_employee_id
    ):
        raise HTTPException(status_code=404, detail="Funcionário responsável não encontrado")

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

    # Calculate estimated_cost: insumos + mão de obra estimada
    custo_insumos = Decimal("0")
    for pi in order.inputs:
        custo_insumos += Decimal(str(pi.subtotal))

    employee = _get_employee(db, data.responsible_employee_id)
    custo_mao_obra = _calcular_custo_mao_obra(
        employee, data.start_date, data.expected_end_date
    )

    estimated = _quantize2(custo_insumos + custo_mao_obra)
    pcp_repo.update_order(db, order.id, estimated_cost=estimated)

    return pcp_repo.get_order_with_harvests(db, order.id)


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


def iniciar_producao(db: Session, order_id: UUID) -> ProductionOrder:
    """Changes status from planejada to em_execucao after validating no other active order exists for the plot."""
    order = pcp_repo.get_order_with_harvests(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordem não encontrada")
    if order.status != ProductionOrderStatus.PLANEJADA:
        raise HTTPException(
            status_code=400,
            detail="Somente ordens com status 'Planejada' podem ser iniciadas",
        )
    if pcp_repo.has_active_order_for_plot(db, order.plot_id, exclude_order_id=order_id):
        raise HTTPException(
            status_code=400,
            detail="Talhão já possui uma produção em andamento. Conclua ou cancele a produção atual antes de iniciar uma nova.",
        )
    order.status = ProductionOrderStatus.EM_EXECUCAO
    if not order.start_date:
        from datetime import date
        order.start_date = date.today()
    db.commit()
    return pcp_repo.get_order_with_harvests(db, order_id)


# ---------------------------------------------------------------------------
# Colheita parcial e final
# ---------------------------------------------------------------------------


def _simulate_harvest(
    capacity: Decimal, percentage: Decimal
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    Simula resultado da colheita parcial.
    - base = capacity × (percentage / 100)
    - variação total ±10%: total = base × random(0.90, 1.10)
    - especial: 15–25% / superior: 45–55% / tradicional: restante
    """
    base = Decimal(str(capacity)) * Decimal(str(percentage)) / Decimal("100")
    variation = Decimal(str(random.uniform(0.90, 1.10)))
    total = _quantize2(base * variation)

    especial_pct = Decimal(str(random.uniform(0.15, 0.25)))
    superior_pct = Decimal(str(random.uniform(0.45, 0.55)))

    especial = _quantize2(total * especial_pct)
    superior = _quantize2(total * superior_pct)
    tradicional = _quantize2(total - especial - superior)

    if tradicional < 0:
        tradicional = Decimal("0.00")
        superior = _quantize2(total - especial)
        if superior < 0:
            superior = Decimal("0.00")
            especial = total

    return total, especial, superior, tradicional


def _find_quality_item(db: Session, quality_keyword: str) -> Optional[StockItem]:
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


def registrar_colheita(
    db: Session,
    order_id: UUID,
    percentage_harvested: Decimal,
) -> ProductionResult:
    """
    Registra uma colheita parcial (ou final, se atingir 100% acumulado).
    Consome insumos proporcionalmente, dá entrada do café por qualidade,
    cria ProductionHarvest e acumula o progresso na ordem.
    """
    order = _get_order_or_404(db, order_id)

    if order.status in (
        ProductionOrderStatus.CONCLUIDA,
        ProductionOrderStatus.CANCELADA,
    ):
        raise HTTPException(status_code=400, detail="Ordem já finalizada")

    percentage = Decimal(str(percentage_harvested))
    if percentage <= 0:
        raise HTTPException(
            status_code=400,
            detail="Percentual de colheita deve ser maior que zero",
        )

    progress_atual = Decimal(order.harvest_progress)
    if progress_atual + percentage > Decimal("100"):
        restante = Decimal("100") - progress_atual
        raise HTTPException(
            status_code=400,
            detail=(
                f"Percentual excede o total. Restante para colher: "
                f"{restante.quantize(Decimal('0.01'))}%"
            ),
        )

    plot = _get_plot_or_404(db, order.plot_id)

    # 1. Valida disponibilidade dos insumos proporcionais
    stock_ids = [pi.stock_item_id for pi in order.inputs]
    smap = _stock_map(db, stock_ids)
    consumos_proporcionais: list[tuple[UUID, Decimal, StockItem]] = []
    for pi in order.inputs:
        item = smap.get(pi.stock_item_id)
        if not item:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {pi.stock_item_id}",
            )
        qty_proporcional = _quantize3(
            Decimal(str(pi.quantity)) * percentage / Decimal("100")
        )
        if qty_proporcional <= 0:
            continue
        available = estoque_service.verificar_disponibilidade(
            db, pi.stock_item_id, qty_proporcional
        )
        if not available:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Estoque insuficiente para: {item.name}. "
                    f"Disponível: {item.quantity_on_hand} {item.unit.value}"
                ),
            )
        consumos_proporcionais.append((pi.stock_item_id, qty_proporcional, item))

    order_label = order.order_number or str(order.id)

    # 2. Consome insumos proporcionalmente
    inputs_consumed_snapshot: list[dict[str, Any]] = []
    for stock_item_id, qty, item in consumos_proporcionais:
        estoque_service.registrar_saida(
            db,
            stock_item_id=stock_item_id,
            quantity=qty,
            description=f"Colheita {percentage}% — Ordem {order_label}",
            source_module="pcp",
            reference_id=order.id,
        )
        inputs_consumed_snapshot.append({
            "stock_item_id": str(stock_item_id),
            "name": item.name,
            "quantity": float(qty),
            "unit": item.unit.value if hasattr(item.unit, "value") else str(item.unit),
        })

    # Movimento agregado de consumo (rastreabilidade)
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.PRODUCAO,
        amount=Decimal("0"),
        description=f"Consumo de insumos — Colheita {percentage}% Ordem {order_label}",
        source_module="pcp",
        reference_id=order.id,
    )

    # 3. Simula resultado da colheita parcial
    capacity = Decimal(str(plot.capacity_sacas))
    sacks_total, especial, superior, tradicional = _simulate_harvest(capacity, percentage)

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
            description=f"Colheita {percentage}% — Ordem {order_label} — {cafe_item.name}",
            source_module="pcp",
            reference_id=order.id,
        )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.PRODUCAO,
        amount=Decimal("0"),
        description=(
            f"Café produzido — Colheita {percentage}% Ordem {order_label}: {sacks_total} sacas"
        ),
        source_module="pcp",
        reference_id=order.id,
    )

    novo_progresso = progress_atual + percentage
    is_final = novo_progresso >= Decimal("100")

    # 5. Cria registro de colheita
    harvest = pcp_repo.create_harvest(
        db,
        order_id=order.id,
        percentage_harvested=percentage,
        sacks_total=sacks_total,
        sacks_especial=especial,
        sacks_superior=superior,
        sacks_tradicional=tradicional,
        inputs_consumed=inputs_consumed_snapshot,
        is_final=is_final,
    )

    # 6. Atualiza progresso e totais acumulados na ordem
    pcp_repo.update_order_harvest_progress(
        db,
        order.id,
        additional_percentage=percentage,
        additional_sacks_total=sacks_total,
        additional_sacks_especial=especial,
        additional_sacks_superior=superior,
        additional_sacks_tradicional=tradicional,
    )

    # 7. Se finalizou: calcula realized_cost e registra movimento financeiro
    if is_final:
        reloaded = pcp_repo.get_order_with_harvests(db, order.id)
        custo_insumos = Decimal("0")
        for pi in reloaded.inputs:
            item = estoque_repo.get_item(db, pi.stock_item_id)
            if item:
                custo_insumos += Decimal(str(pi.quantity)) * Decimal(str(item.unit_cost))

        employee = _get_employee(db, reloaded.responsible_employee_id)
        executed_date = (
            reloaded.executed_at.date()
            if reloaded.executed_at
            else datetime.now(timezone.utc).date()
        )
        custo_mao_obra = _calcular_custo_mao_obra(
            employee, reloaded.start_date, executed_date
        )
        realized = _quantize2(custo_insumos + custo_mao_obra)

        pcp_repo.update_order(db, reloaded.id, realized_cost=realized)

        if realized > 0:
            fin_service.registrar_movimento(
                db,
                movement_type=MovementType.SAIDA,
                category=FinancialCategory.PRODUCAO,
                amount=realized,
                description=(
                    f"Custo realizado da safra — Ordem {order_label}"
                ),
                source_module="pcp",
                reference_id=reloaded.id,
            )

    # 8. Verifica insumos abaixo do mínimo
    reloaded = pcp_repo.get_order_with_harvests(db, order.id)
    items_below: list[str] = []
    for pi in reloaded.inputs:
        item = estoque_repo.get_item(db, pi.stock_item_id)
        if item and Decimal(item.quantity_on_hand) < Decimal(item.minimum_stock):
            items_below.append(item.name)

    harvest_out = HarvestOut.from_model(harvest)
    order_out = _serialize_order_model(db, reloaded)

    return ProductionResult(
        order_id=reloaded.id,
        harvest=harvest_out,
        order=order_out,
        items_below_minimum=items_below,
    )


def produzir_safra(db: Session, order_id: UUID) -> ProductionResult:
    """
    Alias de compatibilidade: executa colheita completa (100%) numa única chamada.
    Só permitido se a ordem ainda não foi parcialmente colhida.
    """
    order = _get_order_or_404(db, order_id)
    restante = Decimal("100") - Decimal(order.harvest_progress)
    if restante <= 0:
        raise HTTPException(status_code=400, detail="Ordem já finalizada")
    return registrar_colheita(db, order_id, restante)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _serialize_order_model(db: Session, order: ProductionOrder) -> ProductionOrderOut:
    plot = db.query(Plot).filter(Plot.id == order.plot_id).first()
    plot_name = plot.name if plot else ""
    employee_name: Optional[str] = None
    if order.responsible_employee_id:
        employee = folha_repo.get_employee(db, order.responsible_employee_id)
        if employee:
            employee_name = employee.name
    inputs_out = _serialize_inputs(db, order)
    harvests_out = _serialize_harvests(order)
    return ProductionOrderOut.from_model(
        order,
        plot_name=plot_name,
        inputs=inputs_out,
        harvests=harvests_out,
        responsible_employee_name=employee_name,
    )


def serialize_order(db: Session, order: ProductionOrder) -> dict:
    return _serialize_order_model(db, order).model_dump(mode="json")


def serialize_activity(db: Session, activity: PlotActivity) -> dict:
    from app.modules.pcp.schemas import PlotActivityOut

    plot = db.query(Plot).filter(Plot.id == activity.plot_id).first()
    plot_name = plot.name if plot else ""
    employee_name: Optional[str] = None
    if activity.employee_id:
        employee = folha_repo.get_employee(db, activity.employee_id)
        if employee:
            employee_name = employee.name
    return PlotActivityOut.from_model(
        activity, plot_name=plot_name, employee_name=employee_name
    ).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Relatórios
# ---------------------------------------------------------------------------


def gerar_relatorios(db: Session) -> PCPReportOut:
    """Consolida produção por talhão, consumo de insumos, status e custos."""
    orders = pcp_repo.list_orders_for_report(db)
    today = datetime.now(timezone.utc).date()
    final_statuses = {
        ProductionOrderStatus.CONCLUIDA,
        ProductionOrderStatus.CANCELADA,
    }

    # --- Produção por talhão (ordens concluídas) ---
    producao: dict[UUID, dict[str, Any]] = {}
    plot_cache: dict[UUID, Plot] = {}
    for o in orders:
        if o.status != ProductionOrderStatus.CONCLUIDA:
            continue
        if o.plot_id not in plot_cache:
            plot = db.query(Plot).filter(Plot.id == o.plot_id).first()
            plot_cache[o.plot_id] = plot
        plot = plot_cache[o.plot_id]
        if not plot:
            continue
        entry = producao.setdefault(
            o.plot_id,
            {
                "plot_id": o.plot_id,
                "plot_name": plot.name,
                "total_sacas": Decimal("0"),
                "especial_sacas": Decimal("0"),
                "superior_sacas": Decimal("0"),
                "tradicional_sacas": Decimal("0"),
                "orders_count": 0,
            },
        )
        entry["total_sacas"] += Decimal(o.total_sacas)
        entry["especial_sacas"] += Decimal(o.especial_sacas)
        entry["superior_sacas"] += Decimal(o.superior_sacas)
        entry["tradicional_sacas"] += Decimal(o.tradicional_sacas)
        entry["orders_count"] += 1

    producao_items = [ProducaoPorTalhaoItem(**v) for v in producao.values()]
    producao_items.sort(key=lambda r: r.plot_name)

    # --- Consumo de insumos por item (de todas as ordens não canceladas) ---
    consumo: dict[UUID, dict[str, Any]] = {}
    for o in orders:
        if o.status == ProductionOrderStatus.CANCELADA:
            continue
        for pi in o.inputs:
            stock_item = estoque_repo.get_item(db, pi.stock_item_id)
            if not stock_item:
                continue
            entry = consumo.setdefault(
                pi.stock_item_id,
                {
                    "stock_item_id": pi.stock_item_id,
                    "stock_item_name": stock_item.name,
                    "unit": stock_item.unit.value
                    if hasattr(stock_item.unit, "value")
                    else str(stock_item.unit),
                    "total_quantity": Decimal("0"),
                    "total_cost": Decimal("0"),
                },
            )
            entry["total_quantity"] += Decimal(pi.quantity)
            entry["total_cost"] += Decimal(pi.subtotal)

    consumo_items = [ConsumoInsumoItem(**v) for v in consumo.values()]
    consumo_items.sort(key=lambda c: c.stock_item_name)

    # --- Resumo de status ---
    resumo = OrdensResumo()
    for o in orders:
        status_val = o.status.value if hasattr(o.status, "value") else str(o.status)
        if hasattr(resumo, status_val):
            setattr(resumo, status_val, getattr(resumo, status_val) + 1)
        if (
            o.expected_end_date is not None
            and o.expected_end_date < today
            and o.status not in final_statuses
        ):
            resumo.atrasadas += 1

    # --- Custo previsto vs realizado ---
    custos: list[CustoPrevistoVsRealizadoItem] = []
    for o in orders:
        plot = plot_cache.get(o.plot_id)
        if plot is None:
            plot = db.query(Plot).filter(Plot.id == o.plot_id).first()
            plot_cache[o.plot_id] = plot
        estimated = Decimal(o.estimated_cost)
        realized = Decimal(o.realized_cost)
        custos.append(
            CustoPrevistoVsRealizadoItem(
                order_id=o.id,
                order_number=o.order_number,
                plot_name=plot.name if plot else "",
                status=o.status,
                estimated_cost=estimated,
                realized_cost=realized,
                diferenca=_quantize2(realized - estimated),
            )
        )

    return PCPReportOut(
        producao_por_talhao=producao_items,
        consumo_insumos=consumo_items,
        ordens_resumo=resumo,
        custo_previsto_vs_realizado=custos,
        generated_at=datetime.now(timezone.utc),
    )
