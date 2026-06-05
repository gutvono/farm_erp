from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.estoque import repository as estoque_repo
from app.modules.estoque.model import StockItem, StockMovement
from app.modules.estoque.schemas import (
    InventoryItemOut,
    InventoryOut,
    StockItemCreate,
    StockItemOut,
    StockItemUpdate,
    StockMovementCreate,
    StockMovementOut,
)
from app.modules.financeiro import service as fin_service
from app.shared.enums import FinancialCategory, MovementType
from app.shared.pagination import Page, PageParams


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_item_or_404(db: Session, item_id: UUID) -> StockItem:
    item = estoque_repo.get_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item de estoque não encontrado")
    return item


def _assert_category_exists(db: Session, category_id: UUID) -> None:
    from app.modules.configuracoes import repository as config_repo

    if not config_repo.get_category(db, category_id):
        raise HTTPException(status_code=404, detail="Categoria não encontrada")


def _notify_below_minimum(db: Session, item: StockItem) -> None:
    if Decimal(item.quantity_on_hand) < Decimal(item.minimum_stock):
        from app.modules.dashboard.service import criar_notificacao
        unit_label = item.unit.value if hasattr(item.unit, "value") else str(item.unit)
        criar_notificacao(
            db,
            title=f"Estoque baixo: {item.name}",
            message=(
                f"Quantidade atual ({item.quantity_on_hand} {unit_label}) "
                f"abaixo do mínimo ({item.minimum_stock} {unit_label})"
            ),
            type="warning",
            module="estoque",
        )


# ---------------------------------------------------------------------------
# Stock Items
# ---------------------------------------------------------------------------


def create_item(db: Session, data: StockItemCreate) -> StockItem:
    existing = estoque_repo.get_item_by_sku(db, data.sku)
    if existing:
        raise HTTPException(
            status_code=409, detail=f"SKU '{data.sku}' já está em uso"
        )

    _assert_category_exists(db, data.category_id)

    item = estoque_repo.create_item(db, data)

    # Register internal financial movement (R$0.00 — item cadastrado)
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.AJUSTE,
        amount=Decimal("0"),
        description=f"Item cadastrado no estoque: {item.name}",
        source_module="estoque",
        reference_id=item.id,
    )

    return item


def list_items(
    db: Session,
    *,
    category_id: Optional[UUID] = None,
    role=None,
    below_minimum: bool = False,
) -> list[StockItem]:
    # Filtro por papel (role) é resolvido aqui em ids de itens, via Configurações.
    item_ids: Optional[list[UUID]] = None
    if role is not None:
        from app.modules.configuracoes import service as config_service

        item_ids = config_service.get_item_ids_by_role(db, role)
    return estoque_repo.list_items(
        db,
        category_id=category_id,
        item_ids=item_ids,
        below_minimum=below_minimum,
    )


def get_item(db: Session, item_id: UUID) -> StockItem:
    return _get_item_or_404(db, item_id)


def update_item(db: Session, item_id: UUID, data: StockItemUpdate) -> StockItem:
    _get_item_or_404(db, item_id)
    if data.category_id is not None:
        _assert_category_exists(db, data.category_id)
    item = estoque_repo.update_item(db, item_id, data)
    return item


def soft_delete_item(db: Session, item_id: UUID) -> StockItem:
    _get_item_or_404(db, item_id)
    item = estoque_repo.soft_delete_item(db, item_id)
    return item


# ---------------------------------------------------------------------------
# Stock Movements
# ---------------------------------------------------------------------------


def create_movement(db: Session, data: StockMovementCreate) -> StockMovement:
    _get_item_or_404(db, data.stock_item_id)

    try:
        movement = estoque_repo.create_movement(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    item = estoque_repo.get_item(db, data.stock_item_id)

    # Financial movement
    quantity = Decimal(str(data.quantity))
    unit_cost = Decimal(str(data.unit_cost))

    if data.movement_type == MovementType.ENTRADA and unit_cost > 0:
        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.SAIDA,
            category=FinancialCategory.COMPRA,
            amount=quantity * unit_cost,
            description=f"Entrada de estoque: {item.name}",
            source_module="estoque",
            reference_id=movement.id,
        )
        # Custo médio móvel (moving weighted average): recalculado após a
        # entrada ser persistida. O repository.create_movement já incrementou
        # quantity_on_hand, então o saldo anterior à entrada é
        # (quantity_on_hand - quantity). cmp_antes é o unit_cost atual do item
        # (ainda não atualizado nesta chamada).
        qty_antes = Decimal(str(item.quantity_on_hand)) - quantity
        if qty_antes < 0:
            qty_antes = Decimal("0")
        cmp_antes = Decimal(str(item.unit_cost))
        total_qty = qty_antes + quantity
        if total_qty > 0:
            novo_custo = (
                (qty_antes * cmp_antes + quantity * unit_cost) / total_qty
            ).quantize(Decimal("0.01"))
            item.unit_cost = novo_custo
            db.add(item)
            db.commit()
            db.refresh(item)
    else:
        # saida or zero-cost entrada → internal movement at R$0.00
        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.SAIDA,
            category=FinancialCategory.AJUSTE,
            amount=Decimal("0"),
            description=f"Saída de estoque: {item.name} — {data.description or ''}",
            source_module="estoque",
            reference_id=movement.id,
        )

    # Notify if below minimum
    db.refresh(item)
    _notify_below_minimum(db, item)

    return movement


def list_movements_paginated(
    db: Session,
    *,
    params: PageParams,
    stock_item_id: Optional[UUID] = None,
    movement_type: Optional[MovementType] = None,
    source_module: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Page[StockMovementOut]:
    movements, total = estoque_repo.list_movements_paginated(
        db,
        params=params,
        stock_item_id=stock_item_id,
        movement_type=movement_type,
        source_module=source_module,
        start_date=start_date,
        end_date=end_date,
    )
    items = [StockMovementOut.from_model(m) for m in movements]
    return Page.create(items=items, total=total, params=params)


def get_movement(db: Session, movement_id: UUID) -> StockMovement:
    movement = estoque_repo.get_movement(db, movement_id)
    if not movement:
        raise HTTPException(status_code=404, detail="Movimentação não encontrada")
    return movement


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


def get_inventory(db: Session) -> InventoryOut:
    items = estoque_repo.get_inventory(db)
    inventory_items = [InventoryItemOut.from_model(i) for i in items]
    total = sum(i.total_value for i in inventory_items)
    return InventoryOut(
        items=inventory_items,
        total_value=total,
        generated_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Public functions for cross-module use
# ---------------------------------------------------------------------------


def obter_ou_criar_item_avariado(db: Session, original: StockItem) -> StockItem:
    """Get (or create) the damaged-stock counterpart of an item.

    Used by Faturamento when cancelling a return NF (`devolucao`): rejected
    goods re-enter stock as a damaged item. The damaged item is identified by a
    standardized SKU ``"{sku_original}-AVARIADO"``; if it already exists it is
    reused (idempotent — never duplicates), otherwise it is created with the
    same unit/category and ``unit_cost=0``.
    """
    damaged_sku = f"{original.sku}-AVARIADO"
    existing = estoque_repo.get_item_by_sku(db, damaged_sku)
    if existing:
        return existing
    data = StockItemCreate(
        sku=damaged_sku,
        name=f"{original.name} (AVARIADO)",
        category_id=original.category_id,
        unit=original.unit,
        minimum_stock=Decimal("0"),
        unit_cost=Decimal("0"),
    )
    return create_item(db, data)


def registrar_entrada(
    db: Session,
    stock_item_id: UUID,
    quantity: Decimal,
    unit_cost: Decimal = Decimal("0"),
    description: str = "",
    source_module: str = "manual",
    reference_id: Optional[UUID] = None,
) -> StockMovement:
    """Register stock entry. Called by Compras and PCP."""
    data = StockMovementCreate(
        stock_item_id=stock_item_id,
        movement_type=MovementType.ENTRADA,
        quantity=quantity,
        unit_cost=unit_cost,
        description=description or "Entrada de estoque",
        source_module=source_module,
        reference_id=reference_id,
    )
    return create_movement(db, data)


def registrar_saida(
    db: Session,
    stock_item_id: UUID,
    quantity: Decimal,
    unit_cost: Decimal = Decimal("0"),
    description: str = "",
    source_module: str = "manual",
    reference_id: Optional[UUID] = None,
) -> StockMovement:
    """Register stock withdrawal. Called by Comercial and PCP.

    O parâmetro ``unit_cost`` permite registrar o CMP do item no movimento de
    saída (usado pelo Comercial para viabilizar o cálculo de CMV). O default é
    R$0, preservando o comportamento de saídas internas do PCP (custo rastreado
    na ordem de produção) e chamadas manuais.
    """
    data = StockMovementCreate(
        stock_item_id=stock_item_id,
        movement_type=MovementType.SAIDA,
        quantity=quantity,
        unit_cost=unit_cost,
        description=description or "Saída de estoque",
        source_module=source_module,
        reference_id=reference_id,
    )
    return create_movement(db, data)


def verificar_disponibilidade(
    db: Session,
    stock_item_id: UUID,
    quantity: Decimal,
) -> bool:
    """Check if there is enough stock. Called by Comercial before confirming a sale."""
    item = estoque_repo.get_item(db, stock_item_id)
    if not item:
        return False
    return Decimal(item.quantity_on_hand) >= Decimal(str(quantity))
