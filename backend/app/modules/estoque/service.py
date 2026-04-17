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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_item_or_404(db: Session, item_id: UUID) -> StockItem:
    item = estoque_repo.get_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item de estoque não encontrado")
    return item


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


def list_items(db: Session, *, category=None, below_minimum: bool = False) -> list[StockItem]:
    return estoque_repo.list_items(db, category=category, below_minimum=below_minimum)


def get_item(db: Session, item_id: UUID) -> StockItem:
    return _get_item_or_404(db, item_id)


def update_item(db: Session, item_id: UUID, data: StockItemUpdate) -> StockItem:
    _get_item_or_404(db, item_id)
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


def list_movements(
    db: Session,
    *,
    stock_item_id: Optional[UUID] = None,
    movement_type: Optional[MovementType] = None,
    source_module: Optional[str] = None,
    order_by: str = "created_at",
    order_dir: str = "desc",
) -> list[StockMovement]:
    return estoque_repo.list_movements(
        db,
        stock_item_id=stock_item_id,
        movement_type=movement_type,
        source_module=source_module,
        order_by=order_by,
        order_dir=order_dir,
    )


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
    description: str = "",
    source_module: str = "manual",
    reference_id: Optional[UUID] = None,
) -> StockMovement:
    """Register stock withdrawal. Called by Comercial and PCP."""
    data = StockMovementCreate(
        stock_item_id=stock_item_id,
        movement_type=MovementType.SAIDA,
        quantity=quantity,
        unit_cost=Decimal("0"),
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
