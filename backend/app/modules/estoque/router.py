from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.estoque import service as estoque_service
from app.modules.estoque.schemas import (
    InventoryOut,
    StockItemCreate,
    StockItemOut,
    StockItemUpdate,
    StockMovementCreate,
    StockMovementOut,
)
from app.shared.enums import MovementType, StockCategory
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Stock Items
# ---------------------------------------------------------------------------


@router.get("/itens", response_model=SuccessResponse)
def list_items(
    category: Optional[StockCategory] = None,
    below_minimum: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    items = estoque_service.list_items(db, category=category, below_minimum=below_minimum)
    data = [StockItemOut.from_model(i).model_dump(mode="json") for i in items]
    return success("Itens listados com sucesso", data)


@router.post("/itens", response_model=SuccessResponse, status_code=201)
def create_item(
    body: StockItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    item = estoque_service.create_item(db, body)
    return success("Item criado com sucesso", StockItemOut.from_model(item).model_dump(mode="json"))


@router.get("/itens/{item_id}", response_model=SuccessResponse)
def get_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    item = estoque_service.get_item(db, item_id)
    return success("Item obtido com sucesso", StockItemOut.from_model(item).model_dump(mode="json"))


@router.put("/itens/{item_id}", response_model=SuccessResponse)
def update_item(
    item_id: UUID,
    body: StockItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    item = estoque_service.update_item(db, item_id, body)
    return success(
        "Item atualizado com sucesso",
        StockItemOut.from_model(item).model_dump(mode="json"),
    )


@router.delete("/itens/{item_id}", response_model=SuccessResponse)
def delete_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    estoque_service.soft_delete_item(db, item_id)
    return success("Item removido com sucesso")


# ---------------------------------------------------------------------------
# Stock Movements
# ---------------------------------------------------------------------------


@router.get("/movimentacoes", response_model=SuccessResponse)
def list_movements(
    stock_item_id: Optional[UUID] = None,
    movement_type: Optional[MovementType] = None,
    source_module: Optional[str] = None,
    order_by: str = "created_at",
    order_dir: str = "desc",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    movements = estoque_service.list_movements(
        db,
        stock_item_id=stock_item_id,
        movement_type=movement_type,
        source_module=source_module,
        order_by=order_by,
        order_dir=order_dir,
    )
    data = [StockMovementOut.from_model(m).model_dump(mode="json") for m in movements]
    return success("Movimentações listadas com sucesso", data)


@router.post("/movimentacoes", response_model=SuccessResponse, status_code=201)
def create_movement(
    body: StockMovementCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    movement = estoque_service.create_movement(db, body)
    return success(
        "Movimentação registrada com sucesso",
        StockMovementOut.from_model(movement).model_dump(mode="json"),
    )


@router.get("/movimentacoes/{movement_id}", response_model=SuccessResponse)
def get_movement(
    movement_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    movement = estoque_service.get_movement(db, movement_id)
    return success(
        "Movimentação obtida com sucesso",
        StockMovementOut.from_model(movement).model_dump(mode="json"),
    )


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


@router.get("/inventario", response_model=SuccessResponse)
def get_inventory(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    inventory = estoque_service.get_inventory(db)
    return success("Inventário obtido com sucesso", inventory.model_dump(mode="json"))
