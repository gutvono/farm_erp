import math
import random
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
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
    ProductionEquipmentOut,
    ProductionInputOut,
    ProductionOrderCreate,
    ProductionOrderOut,
    ProductionOrderServiceOut,
    ProductionOrderWorkerOut,
    ProductionPackagingOut,
    ProductionResult,
    ProductionVehicleOut,
)
from app.shared.enums import (
    FinancialCategory,
    MovementType,
    ProductionOrderStatus,
    SystemRole,
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


def _stock_ids_by_role(db: Session, role: SystemRole) -> set[UUID]:
    return set(config_service.get_item_ids_by_role(db, role))


def _quantize3(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _quantize2(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _calcular_custo_workers(
    workers,
    start: Optional[Any],
    end: Optional[Any],
) -> Decimal:
    """SUM(salary_snapshot / 22 × max(1, dias)) para todos os workers."""
    if not start or not end:
        return Decimal("0")
    dias = (end - start).days or 1
    if dias < 0:
        return Decimal("0")
    total = Decimal("0")
    for w in workers:
        total += Decimal(str(w.salary_snapshot)) / Decimal("22") * Decimal(dias)
    return _quantize2(total)


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

    # Coletar todos os stock_ids dos recursos vinculados à ordem
    all_resource_ids = (
        [pi.stock_item_id for pi in data.inputs]
        + [eq.stock_item_id for eq in data.equipments]
        + [vh.stock_item_id for vh in data.vehicles]
        + [pk.stock_item_id for pk in data.packagings]
    )
    smap = _stock_map(db, all_resource_ids)
    maquina_item_ids = _stock_ids_by_role(db, SystemRole.MAQUINA)
    veiculo_item_ids = _stock_ids_by_role(db, SystemRole.VEICULO)
    embalagem_item_ids = _stock_ids_by_role(db, SystemRole.EMBALAGEM)
    insumo_item_ids = _stock_ids_by_role(db, SystemRole.INSUMO)

    # Validate inputs (stock items)
    for pi in data.inputs:
        item = smap.get(pi.stock_item_id)
        if not item or item.deleted_at is not None:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {pi.stock_item_id}",
            )

    # Validate equipments (existência + categoria)
    for eq in data.equipments:
        item = smap.get(eq.stock_item_id)
        if not item or item.deleted_at is not None:
            raise HTTPException(
                status_code=404,
                detail=f"Equipamento não encontrado: {eq.stock_item_id}",
            )
        if item.id not in maquina_item_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Item '{item.name}' não é da categoria Equipamento",
            )

    # Validate vehicles (existência + categoria)
    for vh in data.vehicles:
        item = smap.get(vh.stock_item_id)
        if not item or item.deleted_at is not None:
            raise HTTPException(
                status_code=404,
                detail=f"Veículo não encontrado: {vh.stock_item_id}",
            )
        if item.id not in veiculo_item_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Item '{item.name}' não é da categoria Veículo",
            )

    # Validate packagings (existência + categoria)
    for pk in data.packagings:
        item = smap.get(pk.stock_item_id)
        if not item or item.deleted_at is not None:
            raise HTTPException(
                status_code=404,
                detail=f"Embalagem não encontrada: {pk.stock_item_id}",
            )
        if item.id not in embalagem_item_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Item '{item.name}' não é da categoria Embalagem",
            )

    # Bloqueio de disponibilidade — equipamentos
    committed_eq = pcp_repo.get_committed_equipments(db)
    demand_eq: dict[UUID, int] = {}
    for eq in data.equipments:
        demand_eq[eq.stock_item_id] = (
            demand_eq.get(eq.stock_item_id, 0) + eq.quantity
        )
    for stock_id, demanda in demand_eq.items():
        item = smap[stock_id]
        total = int(item.quantity_on_hand)
        em_uso = committed_eq.get(stock_id, 0)
        disponivel = total - em_uso
        if demanda > disponivel:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Equipamento '{item.name}' indisponível. "
                    f"Existem {total} unidade(s), {em_uso} em uso em outras ordens ativas. "
                    f"Disponível: {disponivel}, solicitado: {demanda}."
                ),
            )

    # Bloqueio de disponibilidade — veículos
    committed_vh = pcp_repo.get_committed_vehicles(db)
    demand_vh: dict[UUID, int] = {}
    for vh in data.vehicles:
        demand_vh[vh.stock_item_id] = (
            demand_vh.get(vh.stock_item_id, 0) + vh.quantity
        )
    for stock_id, demanda in demand_vh.items():
        item = smap[stock_id]
        total = int(item.quantity_on_hand)
        em_uso = committed_vh.get(stock_id, 0)
        disponivel = total - em_uso
        if demanda > disponivel:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Veículo '{item.name}' indisponível. "
                    f"Existem {total} unidade(s), {em_uso} em uso em outras ordens ativas. "
                    f"Disponível: {disponivel}, solicitado: {demanda}."
                ),
            )

    # Validate workers
    responsaveis = [w for w in data.workers if w.is_responsible]
    if len(responsaveis) > 1:
        raise HTTPException(
            status_code=400,
            detail="Apenas um funcionário pode ser marcado como responsável",
        )

    blocked_ids = set(pcp_repo.get_employee_ids_in_active_productions(db))
    employee_objects: list[Employee] = []
    for w in data.workers:
        emp = folha_repo.get_employee(db, w.employee_id)
        if not emp:
            raise HTTPException(
                status_code=404,
                detail=f"Funcionário não encontrado: {w.employee_id}",
            )
        if w.employee_id in blocked_ids:
            raise HTTPException(
                status_code=409,
                detail=f"Funcionário {emp.name} já está em uma ordem de produção ativa",
            )
        employee_objects.append(emp)

    # Validate services (suppliers)
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

    input_cost_map = {
        s.id: Decimal(str(s.unit_cost))
        for s in smap.values()
        if s.id in insumo_item_ids
    }

    workers_data = [
        {
            "employee_id": w.employee_id,
            "salary_snapshot": Decimal(str(emp.base_salary)),
            "is_responsible": w.is_responsible,
        }
        for w, emp in zip(data.workers, employee_objects)
    ]
    services_data = [
        {
            "supplier_id": s.supplier_id,
            "description": s.description,
            "amount": Decimal(str(s.amount)),
            "due_date": s.due_date,
        }
        for s in data.services
    ]
    equipments_data = [
        {"stock_item_id": eq.stock_item_id, "quantity": eq.quantity}
        for eq in data.equipments
    ]
    vehicles_data = [
        {"stock_item_id": vh.stock_item_id, "quantity": vh.quantity}
        for vh in data.vehicles
    ]
    packagings_data = [
        {
            "stock_item_id": pk.stock_item_id,
            "quantity": pk.quantity,
            "unit_cost": Decimal(str(smap[pk.stock_item_id].unit_cost)),
            "subtotal": Decimal(pk.quantity)
            * Decimal(str(smap[pk.stock_item_id].unit_cost)),
        }
        for pk in data.packagings
    ]

    order = pcp_repo.create_order(
        db,
        data,
        input_cost_map,
        workers_data,
        services_data,
        equipments_data,
        vehicles_data,
        packagings_data,
    )

    # Calculate estimated_cost: insumos + workers + serviços + embalagens
    custo_insumos = sum(
        (Decimal(str(pi.subtotal)) for pi in order.inputs), Decimal("0")
    )
    custo_workers = _calcular_custo_workers(
        order.workers, data.start_date, data.expected_end_date
    )
    custo_servicos = sum(
        (Decimal(str(s.amount)) for s in order.services), Decimal("0")
    )
    custo_embalagens = sum(
        (Decimal(str(pk.subtotal)) for pk in order.packagings), Decimal("0")
    )
    estimated = _quantize2(
        custo_insumos + custo_workers + custo_servicos + custo_embalagens
    )
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


def listar_funcionarios_em_producao(db: Session) -> list[UUID]:
    return pcp_repo.get_employee_ids_in_active_productions(db)


def _listar_recursos_em_uso(
    db: Session,
    role: SystemRole,
    committed: dict[UUID, int],
) -> list[dict]:
    item_ids = _stock_ids_by_role(db, role)
    if not item_ids:
        return []
    items = (
        db.query(StockItem)
        .filter(
            StockItem.id.in_(item_ids),
            StockItem.deleted_at.is_(None),
        )
        .order_by(StockItem.name.asc())
        .all()
    )
    result: list[dict] = []
    for item in items:
        total = int(item.quantity_on_hand)
        em_uso = int(committed.get(item.id, 0))
        result.append(
            {
                "stock_item_id": str(item.id),
                "name": item.name,
                "unit": item.unit.value if hasattr(item.unit, "value") else str(item.unit),
                "total": total,
                "committed": em_uso,
                "available": total - em_uso,
            }
        )
    return result


def listar_equipamentos_em_uso(db: Session) -> list[dict]:
    committed = pcp_repo.get_committed_equipments(db)
    return _listar_recursos_em_uso(db, SystemRole.MAQUINA, committed)


def listar_veiculos_em_uso(db: Session) -> list[dict]:
    committed = pcp_repo.get_committed_vehicles(db)
    return _listar_recursos_em_uso(db, SystemRole.VEICULO, committed)


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

    # Cria contas a pagar para cada serviço externo da ordem
    order_reloaded = pcp_repo.get_order_with_harvests(db, order_id)
    for svc in order_reloaded.services:
        if svc.accounts_payable_id is not None:
            continue  # já criado (segurança)
        ap = fin_service.criar_conta_pagar(
            db,
            description=f"Serviço externo — Ordem {order_reloaded.order_number}: {svc.description}",
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
    # Demanda 3: a categoria deixou de ser enum fixo. "Itens de café" (o produto
    # final da produção) passam a ser resolvidos pelo PAPEL `produto_final` da
    # categoria (via Configurações), preservando a semântica anterior
    # da categoria Cafe no modelo legado). A refatoracao profunda do PCP e a Demanda 5.
    from app.modules.configuracoes import service as config_service

    item_ids = config_service.get_item_ids_by_role(db, SystemRole.PRODUTO_FINAL)
    if not item_ids:
        return None
    items = (
        db.query(StockItem)
        .filter(
            StockItem.id.in_(item_ids),
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
    stock_ids = [pi.stock_item_id for pi in order.inputs] + [
        pk.stock_item_id for pk in order.packagings
    ]
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

    # 1b. Valida disponibilidade das embalagens proporcionais (qty inteira)
    consumos_embalagens: list[tuple[UUID, int, StockItem]] = []
    for pk in order.packagings:
        item = smap.get(pk.stock_item_id)
        if not item:
            raise HTTPException(
                status_code=404,
                detail=f"Embalagem não encontrada: {pk.stock_item_id}",
            )
        qty_int = math.ceil(
            int(pk.quantity) * float(percentage) / 100.0
        )
        if qty_int <= 0:
            continue
        if not estoque_service.verificar_disponibilidade(
            db, pk.stock_item_id, Decimal(qty_int)
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Estoque insuficiente para embalagem: {item.name}. "
                    f"Disponível: {item.quantity_on_hand} {item.unit.value}"
                ),
            )
        consumos_embalagens.append((pk.stock_item_id, qty_int, item))

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

    # 2b. Consome embalagens (quantidade inteira arredondada para cima)
    for stock_item_id, qty_int, item in consumos_embalagens:
        estoque_service.registrar_saida(
            db,
            stock_item_id=stock_item_id,
            quantity=Decimal(qty_int),
            description=f"Colheita {percentage}% — Ordem {order_label} (embalagem)",
            source_module="pcp",
            reference_id=order.id,
        )
        inputs_consumed_snapshot.append({
            "stock_item_id": str(stock_item_id),
            "name": item.name,
            "quantity": qty_int,
            "unit": item.unit.value if hasattr(item.unit, "value") else str(item.unit),
            "type": "embalagem",
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
        custo_insumos = sum(
            (
                Decimal(str(pi.quantity))
                * Decimal(str(estoque_repo.get_item(db, pi.stock_item_id).unit_cost))
                for pi in reloaded.inputs
                if estoque_repo.get_item(db, pi.stock_item_id)
            ),
            Decimal("0"),
        )
        executed_date = (
            reloaded.executed_at.date()
            if reloaded.executed_at
            else datetime.now(timezone.utc).date()
        )
        custo_workers = _calcular_custo_workers(
            reloaded.workers, reloaded.start_date, executed_date
        )
        custo_servicos = sum(
            (Decimal(str(s.amount)) for s in reloaded.services), Decimal("0")
        )
        custo_embalagens = sum(
            (Decimal(str(pk.subtotal)) for pk in reloaded.packagings), Decimal("0")
        )
        realized = _quantize2(
            custo_insumos + custo_workers + custo_servicos + custo_embalagens
        )

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
    inputs_out = _serialize_inputs(db, order)
    harvests_out = _serialize_harvests(order)

    workers_out = [
        ProductionOrderWorkerOut(
            id=w.id,
            employee_id=w.employee_id,
            employee_name=w.employee.name if w.employee else "",
            salary_snapshot=w.salary_snapshot,
            is_responsible=w.is_responsible,
        )
        for w in order.workers
    ]

    # supplier_name resolvido por query (não há relationship em ProductionOrderService)
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

    # Carrega stock_items dos novos recursos para nome/unit
    resource_stock_ids = (
        [eq.stock_item_id for eq in order.equipments]
        + [vh.stock_item_id for vh in order.vehicles]
        + [pk.stock_item_id for pk in order.packagings]
    )
    smap_resources = _stock_map(db, resource_stock_ids)

    def _name(stock_id):
        item = smap_resources.get(stock_id)
        return item.name if item else ""

    def _unit(stock_id):
        item = smap_resources.get(stock_id)
        return item.unit.value if item else ""

    equipments_out = [
        ProductionEquipmentOut.from_model(
            eq,
            stock_item_name=_name(eq.stock_item_id),
            unit=_unit(eq.stock_item_id),
        )
        for eq in order.equipments
    ]
    vehicles_out = [
        ProductionVehicleOut.from_model(
            vh,
            stock_item_name=_name(vh.stock_item_id),
            unit=_unit(vh.stock_item_id),
        )
        for vh in order.vehicles
    ]
    packagings_out = [
        ProductionPackagingOut.from_model(
            pk,
            stock_item_name=_name(pk.stock_item_id),
            unit=_unit(pk.stock_item_id),
        )
        for pk in order.packagings
    ]

    return ProductionOrderOut.from_model(
        order,
        plot_name=plot_name,
        inputs=inputs_out,
        harvests=harvests_out,
        workers=workers_out,
        services=services_out,
        equipments=equipments_out,
        vehicles=vehicles_out,
        packagings=packagings_out,
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
