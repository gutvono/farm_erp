from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.compras.model import Supplier
from app.modules.configuracoes import service as config_service
from app.modules.estoque import repository as estoque_repo
from app.modules.estoque import service as estoque_service
from app.modules.estoque.model import StockItem
from app.modules.financeiro import service as fin_service
from app.modules.folha import repository as folha_repo
from app.modules.pcp import repository as pcp_repo
from app.modules.pcp.model import (
    Plot,
    PlotActivity,
    ProductionOrder,
)
from app.modules.pcp.schemas import (
    ConsumoInsumoItem,
    CustoDiscriminado,
    CustoPrevistoVsRealizadoItem,
    HarvestCreate,
    HarvestOut,
    OrdensResumo,
    PCPReportOut,
    PlotActivityCreate,
    PlotCreate,
    PlotUpdate,
    PositionRequirementOut,
    ProducaoPorTalhaoItem,
    ProductionInputOut,
    ProductionOrderCreate,
    ProductionOrderOut,
    ProductionOrderServiceOut,
    ProductionOrderUpdate,
    ProductionResourceOut,
    ProductionResult,
)
from app.shared.enums import (
    FinancialCategory,
    MovementType,
    ProductionOrderStatus,
    SystemRole,
)


# Papéis válidos para recursos da OP e os que se comportam como RESERVA exclusiva.
RESOURCE_ROLES = {SystemRole.MAQUINA, SystemRole.VEICULO, SystemRole.EMBALAGEM}
RESERVABLE_ROLES = [SystemRole.MAQUINA, SystemRole.VEICULO]
_RESERVABLE_ROLE_VALUES = {r.value for r in RESERVABLE_ROLES}


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
    ids = list({sid for sid in stock_ids})
    if not ids:
        return {}
    rows = db.query(StockItem).filter(StockItem.id.in_(ids)).all()
    return {s.id: s for s in rows}


def _quantize3(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _quantize2(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _unit_value(item: Optional[StockItem]) -> str:
    if not item:
        return ""
    return item.unit.value if hasattr(item.unit, "value") else str(item.unit)


def _role_value(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


def _dias(start: Optional[date], end: Optional[date]) -> int:
    """Dias entre início e fim (mín. 1). Base do rateio diário do salário."""
    if not start or not end:
        return 1
    return max(1, (end - start).days)


# ---------------------------------------------------------------------------
# Custo discriminado (insumos / pessoal / máquinas-veículos / embalagens / serviços)
# ---------------------------------------------------------------------------


def _custo_insumos(inputs, fraction: Decimal) -> Decimal:
    total = sum(
        (Decimal(str(pi.subtotal)) * fraction for pi in inputs), Decimal("0")
    )
    return _quantize2(total)


def _custo_pessoal(requirements, start: Optional[date], end: Optional[date]) -> Decimal:
    """Σ(quantity × job_position.base_salary / 22 × max(1, dias))."""
    dias = _dias(start, end)
    total = Decimal("0")
    for req in requirements:
        base = Decimal(str(req.position.base_salary)) if req.position else Decimal("0")
        total += Decimal(req.quantity) * base / Decimal("22") * Decimal(dias)
    return _quantize2(total)


def _custo_maquinas(resources, smap: dict[UUID, StockItem]) -> Decimal:
    """Σ(accumulated_hours × stock_item.hourly_cost) das máquinas/veículos."""
    total = Decimal("0")
    for r in resources:
        if _role_value(r.resource_role) not in _RESERVABLE_ROLE_VALUES:
            continue
        item = smap.get(r.stock_item_id)
        hourly = (
            Decimal(str(item.hourly_cost))
            if item and item.hourly_cost is not None
            else Decimal("0")
        )
        total += Decimal(str(r.accumulated_hours)) * hourly
    return _quantize2(total)


def _custo_embalagens(
    resources, smap: dict[UUID, StockItem], fraction: Decimal
) -> Decimal:
    """Σ(quantity × fraction × unit_cost) das embalagens (consumo proporcional)."""
    total = Decimal("0")
    for r in resources:
        if _role_value(r.resource_role) != SystemRole.EMBALAGEM.value:
            continue
        if r.quantity is None:
            continue
        item = smap.get(r.stock_item_id)
        unit_cost = Decimal(str(item.unit_cost)) if item else Decimal("0")
        total += Decimal(str(r.quantity)) * fraction * unit_cost
    return _quantize2(total)


def _custo_servicos(services) -> Decimal:
    total = sum((Decimal(str(s.amount)) for s in services), Decimal("0"))
    return _quantize2(total)


def _custo_estimado(db: Session, order: ProductionOrder) -> Decimal:
    """Custo previsto (fração 100%): insumos + pessoal + máquinas + embalagens + serviços."""
    smap = _stock_map(
        db,
        [pi.stock_item_id for pi in order.inputs]
        + [r.stock_item_id for r in order.resources],
    )
    insumos = _custo_insumos(order.inputs, Decimal("1"))
    pessoal = _custo_pessoal(
        order.position_requirements, order.start_date, order.expected_end_date
    )
    maquinas = _custo_maquinas(order.resources, smap)
    embalagens = _custo_embalagens(order.resources, smap, Decimal("1"))
    servicos = _custo_servicos(order.services)
    return _quantize2(insumos + pessoal + maquinas + embalagens + servicos)


def _custo_realizado_discriminado(
    db: Session, order: ProductionOrder
) -> CustoDiscriminado:
    """Custo realizado discriminado, derivado do estado atual da OP.

    Usa a fração colhida (`harvest_progress/100`) para insumos/embalagens e as
    horas acumuladas para máquinas/veículos. OP sem progresso e não concluída
    ainda não realizou custo → tudo zero.
    """
    progress = Decimal(str(order.harvest_progress))
    if progress <= 0 and order.status != ProductionOrderStatus.CONCLUIDA:
        return CustoDiscriminado()

    fraction = progress / Decimal("100")
    end_date = (
        order.executed_at.date()
        if order.executed_at
        else datetime.now(timezone.utc).date()
    )
    smap = _stock_map(
        db,
        [pi.stock_item_id for pi in order.inputs]
        + [r.stock_item_id for r in order.resources],
    )
    insumos = _custo_insumos(order.inputs, fraction)
    pessoal = _custo_pessoal(
        order.position_requirements, order.start_date, end_date
    )
    maquinas = _custo_maquinas(order.resources, smap)
    embalagens = _custo_embalagens(order.resources, smap, fraction)
    servicos = _custo_servicos(order.services)
    total = _quantize2(insumos + pessoal + maquinas + embalagens + servicos)
    return CustoDiscriminado(
        insumos=insumos,
        pessoal=pessoal,
        maquinas=maquinas,
        embalagens=embalagens,
        servicos=servicos,
        total=total,
    )


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
    return pcp_repo.update_plot(db, plot_id, data)


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
# Recursos / insumos disponíveis (selects do front)
# ---------------------------------------------------------------------------


def insumos_disponiveis(db: Session) -> list[StockItem]:
    """Itens de estoque elegíveis como INSUMO da OP (papel `insumo`)."""
    item_ids = config_service.get_item_ids_by_role(db, SystemRole.INSUMO)
    if not item_ids:
        return []
    return (
        db.query(StockItem)
        .filter(StockItem.id.in_(item_ids), StockItem.deleted_at.is_(None))
        .order_by(StockItem.name.asc())
        .all()
    )


def recursos_disponiveis(
    db: Session, role: SystemRole
) -> list[tuple[StockItem, Decimal]]:
    """Itens do papel informado com a quantidade disponível (Demanda 5.1).

    `available_quantity = quantity_on_hand − Σ(quantity em OPs JÁ INICIADAS)` para
    máquina/veículo (reutilizáveis). Para embalagem (consumo), disponível = saldo
    em estoque. Retorna pares `(item, disponível)` — nada é ocultado.
    """
    if role not in RESOURCE_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Papel inválido para recurso (use maquina, veiculo ou embalagem)",
        )
    item_ids = config_service.get_item_ids_by_role(db, role)
    if not item_ids:
        return []
    usage: dict[UUID, Decimal] = {}
    if role in RESERVABLE_ROLES:
        usage = pcp_repo.get_started_resource_usage(db)
    items = (
        db.query(StockItem)
        .filter(StockItem.id.in_(item_ids), StockItem.deleted_at.is_(None))
        .order_by(StockItem.name.asc())
        .all()
    )
    result: list[tuple[StockItem, Decimal]] = []
    for it in items:
        on_hand = Decimal(str(it.quantity_on_hand))
        available = on_hand - usage.get(it.id, Decimal("0"))
        result.append((it, available))
    return result


def cargos_disponiveis(db: Session) -> list[dict[str, Any]]:
    """Cargos com headcount total e disponível (Demanda 5.1).

    `available = nº de funcionários ativos do cargo − Σ(quantity em OPs iniciadas)`.
    """
    positions = pcp_repo.list_active_positions(db)
    usage = pcp_repo.get_started_position_usage(db)
    out: list[dict[str, Any]] = []
    for p in positions:
        total = pcp_repo.count_active_headcount_by_position(db, p.id)
        used = usage.get(p.id, Decimal("0"))
        out.append(
            {
                "position_id": str(p.id),
                "position_name": p.name,
                "base_salary": str(p.base_salary),
                "total_headcount": total,
                "used": str(used.normalize()),
                "available_quantity": str((Decimal(total) - used).normalize()),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Production Orders
# ---------------------------------------------------------------------------


def _validate_hectares(
    db: Session,
    plot: Plot,
    hectares_used: Decimal,
    exclude_order_id: Optional[UUID] = None,
) -> None:
    usados = pcp_repo.get_active_hectares_for_plot(
        db, plot.id, exclude_order_id=exclude_order_id
    )
    total = Decimal(str(plot.total_hectares))
    disponivel = total - usados
    if Decimal(str(hectares_used)) > disponivel:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Hectares excedem o disponível no talhão. "
                f"Disponível: {disponivel.quantize(Decimal('0.01'))} ha "
                f"(total {total.quantize(Decimal('0.01'))} ha, "
                f"em uso {usados.quantize(Decimal('0.01'))} ha)"
            ),
        )


def _build_requirements_data(db: Session, data: ProductionOrderCreate) -> list[dict]:
    requirements_data: list[dict] = []
    for req in data.position_requirements:
        position = folha_repo.get_position(db, req.position_id)
        if not position:
            raise HTTPException(
                status_code=404,
                detail=f"Cargo não encontrado: {req.position_id}",
            )
        requirements_data.append(
            {
                "position_id": req.position_id,
                "quantity": req.quantity,
                "contract_type": req.contract_type,
            }
        )
    return requirements_data


def _build_resources_data(db: Session, data: ProductionOrderCreate) -> list[dict]:
    """Valida e normaliza os recursos da OP no PLANEJAMENTO.

    Planejar é LIVRE (Demanda 5.1): valida apenas existência+papel+quantity. NÃO
    há reserva exclusiva nem teto de capacidade aqui — o bloqueio por capacidade
    real acontece no INICIAR. Reutilizáveis (máquina/veículo) guardam a quantidade
    de unidades usadas (default 1); embalagem (consumo) exige quantity > 0.
    """
    resources_data: list[dict] = []
    eligible_by_role: dict[str, set[UUID]] = {}

    for res in data.resources:
        role = res.resource_role
        if role not in RESOURCE_ROLES:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Papel de recurso inválido (use maquina, veiculo ou embalagem)"
                ),
            )
        role_key = role.value
        if role_key not in eligible_by_role:
            eligible_by_role[role_key] = set(
                config_service.get_item_ids_by_role(db, role)
            )
        if res.stock_item_id not in eligible_by_role[role_key]:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Item de estoque não pertence ao papel '{role_key}': "
                    f"{res.stock_item_id}"
                ),
            )

        if role in RESERVABLE_ROLES:
            # Reutilizável: quantidade de unidades usadas (default 1) + horas.
            qty = res.quantity if res.quantity is not None else Decimal("1")
            if Decimal(str(qty)) <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="Quantidade do recurso deve ser maior que zero",
                )
            accumulated = res.hours if res.hours is not None else Decimal("0")
            resources_data.append(
                {
                    "stock_item_id": res.stock_item_id,
                    "resource_role": role,
                    "quantity": Decimal(str(qty)),
                    "accumulated_hours": Decimal(str(accumulated)),
                }
            )
        else:  # embalagem (consumo)
            if res.quantity is None or Decimal(str(res.quantity)) <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="Embalagem requer quantidade maior que zero",
                )
            resources_data.append(
                {
                    "stock_item_id": res.stock_item_id,
                    "resource_role": role,
                    "quantity": res.quantity,
                    "accumulated_hours": Decimal("0"),
                }
            )

    return resources_data


def create_order(db: Session, data: ProductionOrderCreate) -> ProductionOrder:
    plot = _get_plot_or_404(db, data.plot_id)

    # P2 — controle de hectares.
    _validate_hectares(db, plot, data.hectares_used)

    # Insumos: itens devem existir E pertencer ao papel `insumo`.
    stock_ids = [pi.stock_item_id for pi in data.inputs]
    smap = _stock_map(db, stock_ids)
    insumo_ids = set(config_service.get_item_ids_by_role(db, SystemRole.INSUMO))
    for pi in data.inputs:
        item = smap.get(pi.stock_item_id)
        if not item or item.deleted_at is not None:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {pi.stock_item_id}",
            )
        if pi.stock_item_id not in insumo_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Item '{item.name}' não pertence ao papel 'insumo' e não pode "
                    f"ser usado como insumo da ordem"
                ),
            )

    # P3 — requisitos por cargo.
    requirements_data = _build_requirements_data(db, data)

    # P4 — recursos (máquinas/veículos/embalagens).
    resources_data = _build_resources_data(db, data)

    # Serviços externos (fornecedores).
    for s in data.services:
        supplier = (
            db.query(Supplier)
            .filter(Supplier.id == s.supplier_id, Supplier.deleted_at.is_(None))
            .first()
        )
        if not supplier:
            raise HTTPException(
                status_code=404,
                detail=f"Fornecedor não encontrado: {s.supplier_id}",
            )

    input_cost_map = {s.id: Decimal(str(s.unit_cost)) for s in smap.values()}
    services_data = [
        {
            "supplier_id": s.supplier_id,
            "description": s.description,
            "amount": Decimal(str(s.amount)),
            "due_date": s.due_date,
        }
        for s in data.services
    ]

    order = pcp_repo.create_order(
        db, data, input_cost_map, requirements_data, resources_data, services_data
    )

    estimated = _custo_estimado(db, order)
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


def update_order(
    db: Session, order_id: UUID, data: ProductionOrderUpdate
) -> ProductionOrder:
    """Atualiza campos editáveis e aplica incrementos de horas por recurso."""
    order = _get_order_or_404(db, order_id)
    if order.status in (
        ProductionOrderStatus.CONCLUIDA,
        ProductionOrderStatus.CANCELADA,
    ):
        raise HTTPException(
            status_code=400, detail="Ordem finalizada não pode ser atualizada"
        )

    # Incrementos de horas (null-safe): valor informado é SOMADO ao acumulado.
    for inc in data.resource_hours:
        if inc.hours is None:
            continue
        resource = pcp_repo.get_resource(db, order_id, inc.resource_id)
        if not resource:
            raise HTTPException(
                status_code=404,
                detail=f"Recurso não encontrado na ordem: {inc.resource_id}",
            )
        pcp_repo.increment_resource_hours(
            db, resource, Decimal(str(inc.hours))
        )

    fields = data.model_dump(exclude_unset=True, exclude={"resource_hours"})
    if fields:
        pcp_repo.update_order(db, order_id, **fields)

    # Recalcula custos com o novo estado (horas, datas).
    reloaded = pcp_repo.get_order_with_harvests(db, order_id)
    estimated = _custo_estimado(db, reloaded)
    update_kwargs: dict[str, Any] = {"estimated_cost": estimated}
    if reloaded.status == ProductionOrderStatus.CONCLUIDA:
        update_kwargs["realized_cost"] = _custo_realizado_discriminado(
            db, reloaded
        ).total
    pcp_repo.update_order(db, order_id, **update_kwargs)

    return pcp_repo.get_order_with_harvests(db, order_id)


def soft_delete_order(db: Session, order_id: UUID) -> ProductionOrder:
    order = _get_order_or_404(db, order_id)
    if order.status != ProductionOrderStatus.PLANEJADA:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens com status 'Planejada' podem ser excluídas",
        )
    return pcp_repo.soft_delete_order(db, order_id)


def _check_capacity_for_start(db: Session, order: ProductionOrder) -> None:
    """Bloqueia (409) o INICIAR quando falta capacidade real para recursos
    reutilizáveis (máquina/veículo) ou pessoas (cargo).

    disponível = TOTAL − Σ(quantity do mesmo item/cargo em OPs JÁ INICIADAS).
    TOTAL: item = quantity_on_hand; cargo = nº de funcionários ativos do cargo.
    A própria OP está planejada → não conta contra si mesma (exclude_order_id).
    Consumíveis (insumo/embalagem) não entram aqui.
    """
    shortfalls: list[str] = []

    # --- Recursos reutilizáveis (máquina/veículo) ---
    res_usage = pcp_repo.get_started_resource_usage(db, exclude_order_id=order.id)
    needs_by_item: dict[UUID, Decimal] = {}
    for r in order.resources:
        if _role_value(r.resource_role) not in _RESERVABLE_ROLE_VALUES:
            continue
        qty = Decimal(str(r.quantity)) if r.quantity is not None else Decimal("1")
        needs_by_item[r.stock_item_id] = needs_by_item.get(
            r.stock_item_id, Decimal("0")
        ) + qty
    for item_id, need in needs_by_item.items():
        item = estoque_repo.get_item(db, item_id)
        total = Decimal(str(item.quantity_on_hand)) if item else Decimal("0")
        disponivel = total - res_usage.get(item_id, Decimal("0"))
        if need > disponivel:
            nome = item.name if item else str(item_id)
            shortfalls.append(
                f"{nome}: requer {need.normalize()}, disponível {disponivel.normalize()}"
            )

    # --- Pessoas por cargo ---
    pos_usage = pcp_repo.get_started_position_usage(db, exclude_order_id=order.id)
    needs_by_pos: dict[UUID, Decimal] = {}
    for req in order.position_requirements:
        needs_by_pos[req.position_id] = needs_by_pos.get(
            req.position_id, Decimal("0")
        ) + Decimal(req.quantity)
    for pos_id, need in needs_by_pos.items():
        total = Decimal(pcp_repo.count_active_headcount_by_position(db, pos_id))
        disponivel = total - pos_usage.get(pos_id, Decimal("0"))
        if need > disponivel:
            position = folha_repo.get_position(db, pos_id)
            nome = position.name if position else str(pos_id)
            shortfalls.append(
                f"Cargo {nome}: requer {need.normalize()}, "
                f"disponível {disponivel.normalize()}"
            )

    if shortfalls:
        raise HTTPException(
            status_code=409,
            detail="Capacidade insuficiente para iniciar — " + "; ".join(shortfalls),
        )


def iniciar_producao(db: Session, order_id: UUID) -> ProductionOrder:
    """Muda o status de planejada para em_execucao e cria as contas a pagar dos serviços."""
    order = pcp_repo.get_order_with_harvests(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordem não encontrada")
    if order.status != ProductionOrderStatus.PLANEJADA:
        raise HTTPException(
            status_code=400,
            detail="Somente ordens com status 'Planejada' podem ser iniciadas",
        )
    # Demanda 5.1 — bloqueio por capacidade real (recursos reutilizáveis + pessoas).
    # (Não há trava de "uma produção por talhão": o talhão comporta várias OPs dentro
    # do limite de hectares, validado no criar.)
    _check_capacity_for_start(db, order)
    order.status = ProductionOrderStatus.EM_EXECUCAO
    if not order.start_date:
        order.start_date = date.today()
    db.commit()

    # Cria contas a pagar para cada serviço externo da ordem.
    order_reloaded = pcp_repo.get_order_with_harvests(db, order_id)
    for svc in order_reloaded.services:
        if svc.accounts_payable_id is not None:
            continue
        ap = fin_service.criar_conta_pagar(
            db,
            description=(
                f"Serviço externo — Ordem {order_reloaded.order_number}: "
                f"{svc.description}"
            ),
            amount=Decimal(str(svc.amount)),
            due_date=svc.due_date,
            supplier_id=svc.supplier_id,
            source_module="pcp",
            reference_id=order_reloaded.id,
        )
        pcp_repo.set_service_accounts_payable(db, svc.id, ap.id)
    db.commit()

    return pcp_repo.get_order_with_harvests(db, order_id)


# ---------------------------------------------------------------------------
# Colheita determinística por destino + pragas
# ---------------------------------------------------------------------------


def registrar_colheita(
    db: Session, order_id: UUID, data: HarvestCreate
) -> ProductionResult:
    """
    Registra uma colheita parcial (ou final, ao atingir 100% acumulado).

    Consome insumos e embalagens proporcionalmente, dá entrada das sacas por
    destino (indústria/embalagem/descarte) nos itens-destino configurados,
    aplica incrementos de horas e acumula o progresso na ordem.
    """
    order = _get_order_or_404(db, order_id)

    if order.status in (
        ProductionOrderStatus.CONCLUIDA,
        ProductionOrderStatus.CANCELADA,
    ):
        raise HTTPException(status_code=400, detail="Ordem já finalizada")

    percentage = Decimal(str(data.percentage_harvested))
    progress_atual = Decimal(str(order.harvest_progress))
    if progress_atual + percentage > Decimal("100"):
        restante = Decimal("100") - progress_atual
        raise HTTPException(
            status_code=400,
            detail=(
                f"Percentual excede o total. Restante para colher: "
                f"{restante.quantize(Decimal('0.01'))}%"
            ),
        )

    sacks_industria = Decimal(str(data.sacks_industria))
    sacks_embalagem = Decimal(str(data.sacks_embalagem))
    sacks_descarte = Decimal(str(data.sacks_descarte))
    sacks_total = sacks_industria + sacks_embalagem + sacks_descarte

    order_label = order.order_number or str(order.id)
    fraction = percentage / Decimal("100")

    # 1. Valida disponibilidade dos insumos e embalagens proporcionais.
    consumos: list[tuple[UUID, Decimal, StockItem, str]] = []  # (id, qty, item, kind)
    res_smap = _stock_map(
        db,
        [pi.stock_item_id for pi in order.inputs]
        + [r.stock_item_id for r in order.resources],
    )
    for pi in order.inputs:
        item = res_smap.get(pi.stock_item_id)
        if not item:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {pi.stock_item_id}",
            )
        qty = _quantize3(Decimal(str(pi.quantity)) * fraction)
        if qty > 0:
            consumos.append((pi.stock_item_id, qty, item, "insumo"))
    for r in order.resources:
        if _role_value(r.resource_role) != SystemRole.EMBALAGEM.value:
            continue
        if r.quantity is None:
            continue
        item = res_smap.get(r.stock_item_id)
        if not item:
            raise HTTPException(
                status_code=404,
                detail=f"Item de embalagem não encontrado: {r.stock_item_id}",
            )
        qty = _quantize3(Decimal(str(r.quantity)) * fraction)
        if qty > 0:
            consumos.append((r.stock_item_id, qty, item, "embalagem"))

    for stock_item_id, qty, item, _kind in consumos:
        if not estoque_service.verificar_disponibilidade(db, stock_item_id, qty):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Estoque insuficiente para: {item.name}. "
                    f"Disponível: {item.quantity_on_hand} {_unit_value(item)}"
                ),
            )

    # 2. Valida itens-destino para os destinos com sacas > 0.
    destinos = config_service.get_harvest_destination_item_ids(db)
    destino_pairs = [
        ("industria", sacks_industria),
        ("embalagem", sacks_embalagem),
        ("descarte", sacks_descarte),
    ]
    labels = {
        "industria": "indústria",
        "embalagem": "embalagem",
        "descarte": "descarte",
    }
    for key, sacks in destino_pairs:
        if sacks > 0 and not destinos.get(key):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Item-destino de {labels[key]} não configurado em Configurações"
                ),
            )

    # 3. Consome insumos e embalagens proporcionalmente (baixa no estoque).
    inputs_consumed_snapshot: list[dict[str, Any]] = []
    for stock_item_id, qty, item, kind in consumos:
        estoque_service.registrar_saida(
            db,
            stock_item_id=stock_item_id,
            quantity=qty,
            description=f"Colheita {percentage}% — Ordem {order_label} ({kind})",
            source_module="pcp",
            reference_id=order.id,
        )
        inputs_consumed_snapshot.append(
            {
                "stock_item_id": str(stock_item_id),
                "name": item.name,
                "quantity": float(qty),
                "unit": _unit_value(item),
                "kind": kind,
            }
        )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.PRODUCAO,
        amount=Decimal("0"),
        description=(
            f"Consumo de insumos/embalagens — Colheita {percentage}% Ordem {order_label}"
        ),
        source_module="pcp",
        reference_id=order.id,
    )

    # 4. Dá entrada das sacas por destino nos itens-destino configurados.
    for key, sacks in destino_pairs:
        if sacks <= 0:
            continue
        estoque_service.registrar_entrada(
            db,
            stock_item_id=destinos[key],
            quantity=sacks,
            unit_cost=Decimal("0"),
            description=(
                f"Colheita {percentage}% — Ordem {order_label} — {labels[key]}"
            ),
            source_module="pcp",
            reference_id=order.id,
        )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.PRODUCAO,
        amount=Decimal("0"),
        description=(
            f"Café produzido — Colheita {percentage}% Ordem {order_label}: "
            f"{sacks_total} sacas"
        ),
        source_module="pcp",
        reference_id=order.id,
    )

    # 5. Incrementos de horas de máquina/veículo (null-safe).
    for inc in data.resource_hours:
        if inc.hours is None:
            continue
        resource = pcp_repo.get_resource(db, order.id, inc.resource_id)
        if not resource:
            raise HTTPException(
                status_code=404,
                detail=f"Recurso não encontrado na ordem: {inc.resource_id}",
            )
        pcp_repo.increment_resource_hours(db, resource, Decimal(str(inc.hours)))

    novo_progresso = progress_atual + percentage
    is_final = novo_progresso >= Decimal("100")
    hectares_harvested = _quantize2(
        Decimal(str(order.hectares_used)) * fraction
    )

    # 6. Cria registro de colheita.
    harvest = pcp_repo.create_harvest(
        db,
        order_id=order.id,
        percentage_harvested=percentage,
        hectares_harvested=hectares_harvested,
        sacks_total=sacks_total,
        sacks_industria=sacks_industria,
        sacks_embalagem=sacks_embalagem,
        sacks_descarte=sacks_descarte,
        inputs_consumed=inputs_consumed_snapshot,
        is_final=is_final,
    )

    # 7. Atualiza progresso e totais acumulados na ordem.
    pcp_repo.update_order_harvest_progress(
        db,
        order.id,
        additional_percentage=percentage,
        additional_sacks_total=sacks_total,
        additional_sacks_industria=sacks_industria,
        additional_sacks_embalagem=sacks_embalagem,
        additional_sacks_descarte=sacks_descarte,
    )

    # 8. Se finalizou: calcula realized_cost e registra movimento financeiro.
    if is_final:
        reloaded = pcp_repo.get_order_with_harvests(db, order.id)
        realized = _custo_realizado_discriminado(db, reloaded).total
        pcp_repo.update_order(db, reloaded.id, realized_cost=realized)
        if realized > 0:
            fin_service.registrar_movimento(
                db,
                movement_type=MovementType.SAIDA,
                category=FinancialCategory.PRODUCAO,
                amount=realized,
                description=f"Custo realizado da safra — Ordem {order_label}",
                source_module="pcp",
                reference_id=reloaded.id,
            )

    # 9. Verifica insumos abaixo do mínimo.
    reloaded = pcp_repo.get_order_with_harvests(db, order.id)
    items_below: list[str] = []
    for pi in reloaded.inputs:
        item = estoque_repo.get_item(db, pi.stock_item_id)
        if item and Decimal(item.quantity_on_hand) < Decimal(item.minimum_stock):
            items_below.append(item.name)

    return ProductionResult(
        order_id=reloaded.id,
        harvest=HarvestOut.from_model(harvest),
        order=_serialize_order_model(db, reloaded),
        items_below_minimum=items_below,
    )


def encerrar_ordem(db: Session, order_id: UUID, reason: str) -> ProductionOrder:
    """Encerra a OP antes de 100% (praga): marca concluida, grava o motivo,
    libera os recursos e a área restante (não consome o restante de insumos)."""
    order = _get_order_or_404(db, order_id)
    if order.status in (
        ProductionOrderStatus.CONCLUIDA,
        ProductionOrderStatus.CANCELADA,
    ):
        raise HTTPException(status_code=400, detail="Ordem já finalizada")

    realized = _custo_realizado_discriminado(db, order).total
    pcp_repo.update_order(
        db,
        order_id,
        status=ProductionOrderStatus.CONCLUIDA,
        early_closed_reason=reason,
        executed_at=datetime.now(timezone.utc),
        realized_cost=realized,
    )
    if realized > 0:
        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.SAIDA,
            category=FinancialCategory.PRODUCAO,
            amount=realized,
            description=(
                f"Custo realizado (encerramento por praga) — "
                f"Ordem {order.order_number or order.id}"
            ),
            source_module="pcp",
            reference_id=order_id,
        )

    return pcp_repo.get_order_with_harvests(db, order_id)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _serialize_inputs(
    db: Session, order: ProductionOrder, smap: dict[UUID, StockItem]
) -> list[ProductionInputOut]:
    out: list[ProductionInputOut] = []
    for pi in order.inputs:
        item = smap.get(pi.stock_item_id)
        out.append(
            ProductionInputOut.from_model(
                pi,
                stock_item_name=item.name if item else "",
                sku=item.sku if item else "",
                unit=_unit_value(item),
            )
        )
    return out


def _serialize_resources(
    db: Session, order: ProductionOrder, smap: dict[UUID, StockItem]
) -> list[ProductionResourceOut]:
    out: list[ProductionResourceOut] = []
    for r in order.resources:
        item = smap.get(r.stock_item_id)
        hourly = item.hourly_cost if item else None
        if _role_value(r.resource_role) in _RESERVABLE_ROLE_VALUES and hourly is not None:
            cost = _quantize2(Decimal(str(r.accumulated_hours)) * Decimal(str(hourly)))
        else:
            cost = Decimal("0.00")
        out.append(
            ProductionResourceOut(
                id=r.id,
                stock_item_id=r.stock_item_id,
                stock_item_name=item.name if item else "",
                sku=item.sku if item else "",
                unit=_unit_value(item),
                resource_role=r.resource_role,
                quantity=r.quantity,
                accumulated_hours=r.accumulated_hours,
                hourly_cost=hourly,
                cost=cost,
            )
        )
    return out


def _serialize_requirements(
    db: Session, order: ProductionOrder
) -> list[PositionRequirementOut]:
    out: list[PositionRequirementOut] = []
    for req in order.position_requirements:
        position = req.position
        out.append(
            PositionRequirementOut(
                id=req.id,
                position_id=req.position_id,
                position_name=position.name if position else "",
                quantity=req.quantity,
                contract_type=req.contract_type,
                base_salary=position.base_salary if position else Decimal("0"),
            )
        )
    return out


def _serialize_order_model(db: Session, order: ProductionOrder) -> ProductionOrderOut:
    plot = db.query(Plot).filter(Plot.id == order.plot_id).first()
    plot_name = plot.name if plot else ""

    smap = _stock_map(
        db,
        [pi.stock_item_id for pi in order.inputs]
        + [r.stock_item_id for r in order.resources],
    )
    inputs_out = _serialize_inputs(db, order, smap)
    resources_out = _serialize_resources(db, order, smap)
    requirements_out = _serialize_requirements(db, order)
    harvests_out = [
        HarvestOut.from_model(h)
        for h in sorted(order.harvests, key=lambda h: h.harvest_number)
    ]

    supplier_ids = [s.supplier_id for s in order.services]
    suppliers_map = (
        {
            s.id: s
            for s in db.query(Supplier).filter(Supplier.id.in_(supplier_ids)).all()
        }
        if supplier_ids
        else {}
    )
    services_out = [
        ProductionOrderServiceOut(
            id=s.id,
            supplier_id=s.supplier_id,
            supplier_name=suppliers_map[s.supplier_id].name
            if s.supplier_id in suppliers_map
            else "",
            description=s.description,
            amount=s.amount,
            due_date=s.due_date,
            accounts_payable_id=s.accounts_payable_id,
        )
        for s in order.services
    ]

    return ProductionOrderOut.from_model(
        order,
        plot_name=plot_name,
        inputs=inputs_out,
        harvests=harvests_out,
        position_requirements=requirements_out,
        resources=resources_out,
        services=services_out,
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
    """Consolida produção por talhão, consumo de insumos, status e custos
    (discriminados por tipo)."""
    orders = pcp_repo.list_orders_for_report(db)
    today = datetime.now(timezone.utc).date()
    final_statuses = {
        ProductionOrderStatus.CONCLUIDA,
        ProductionOrderStatus.CANCELADA,
    }

    # --- Produção por talhão (ordens concluídas) — por destino ---
    producao: dict[UUID, dict[str, Any]] = {}
    plot_cache: dict[UUID, Plot] = {}
    for o in orders:
        if o.status != ProductionOrderStatus.CONCLUIDA:
            continue
        if o.plot_id not in plot_cache:
            plot_cache[o.plot_id] = (
                db.query(Plot).filter(Plot.id == o.plot_id).first()
            )
        plot = plot_cache[o.plot_id]
        if not plot:
            continue
        entry = producao.setdefault(
            o.plot_id,
            {
                "plot_id": o.plot_id,
                "plot_name": plot.name,
                "total_sacas": Decimal("0"),
                "industria_sacas": Decimal("0"),
                "embalagem_sacas": Decimal("0"),
                "descarte_sacas": Decimal("0"),
                "orders_count": 0,
            },
        )
        entry["total_sacas"] += Decimal(o.total_sacas)
        entry["industria_sacas"] += Decimal(o.industria_sacas)
        entry["embalagem_sacas"] += Decimal(o.embalagem_sacas)
        entry["descarte_sacas"] += Decimal(o.descarte_sacas)
        entry["orders_count"] += 1

    producao_items = [ProducaoPorTalhaoItem(**v) for v in producao.values()]
    producao_items.sort(key=lambda r: r.plot_name)

    # --- Consumo de insumos por item (ordens não canceladas) ---
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
                    "unit": _unit_value(stock_item),
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

    # --- Custo previsto vs realizado (com custo realizado discriminado) ---
    custos: list[CustoPrevistoVsRealizadoItem] = []
    safra = {
        "insumos": Decimal("0"),
        "pessoal": Decimal("0"),
        "maquinas": Decimal("0"),
        "embalagens": Decimal("0"),
        "servicos": Decimal("0"),
        "total": Decimal("0"),
    }
    for o in orders:
        plot = plot_cache.get(o.plot_id)
        if plot is None:
            plot = db.query(Plot).filter(Plot.id == o.plot_id).first()
            plot_cache[o.plot_id] = plot
        estimated = Decimal(o.estimated_cost)
        realized = Decimal(o.realized_cost)
        discriminado = _custo_realizado_discriminado(db, o)
        if o.status != ProductionOrderStatus.CANCELADA:
            safra["insumos"] += discriminado.insumos
            safra["pessoal"] += discriminado.pessoal
            safra["maquinas"] += discriminado.maquinas
            safra["embalagens"] += discriminado.embalagens
            safra["servicos"] += discriminado.servicos
            safra["total"] += discriminado.total
        custos.append(
            CustoPrevistoVsRealizadoItem(
                order_id=o.id,
                order_number=o.order_number,
                plot_name=plot.name if plot else "",
                status=o.status,
                estimated_cost=estimated,
                realized_cost=realized,
                diferenca=_quantize2(realized - estimated),
                custo_realizado_discriminado=discriminado,
            )
        )

    custo_safra = CustoDiscriminado(
        insumos=_quantize2(safra["insumos"]),
        pessoal=_quantize2(safra["pessoal"]),
        maquinas=_quantize2(safra["maquinas"]),
        embalagens=_quantize2(safra["embalagens"]),
        servicos=_quantize2(safra["servicos"]),
        total=_quantize2(safra["total"]),
    )

    return PCPReportOut(
        producao_por_talhao=producao_items,
        consumo_insumos=consumo_items,
        ordens_resumo=resumo,
        custo_previsto_vs_realizado=custos,
        custo_safra_discriminado=custo_safra,
        generated_at=datetime.now(timezone.utc),
    )
