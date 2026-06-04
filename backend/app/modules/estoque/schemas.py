from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import MovementType, StockUnit


# ---------------------------------------------------------------------------
# Stock Items
# ---------------------------------------------------------------------------


class StockItemCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    category_id: UUID
    unit: StockUnit = StockUnit.UNIDADE
    minimum_stock: Decimal = Field(default=Decimal("0"), ge=0)
    unit_cost: Decimal = Field(default=Decimal("0"), ge=0)
    hourly_cost: Optional[Decimal] = Field(default=None, ge=0)
    description: Optional[str] = None


class StockItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category_id: Optional[UUID] = None
    unit: Optional[StockUnit] = None
    minimum_stock: Optional[Decimal] = Field(default=None, ge=0)
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)
    hourly_cost: Optional[Decimal] = Field(default=None, ge=0)
    description: Optional[str] = None


class StockItemOut(BaseModel):
    id: UUID
    sku: str
    name: str
    category_id: UUID
    category_name: str
    unit: StockUnit
    minimum_stock: Decimal
    unit_cost: Decimal
    hourly_cost: Optional[Decimal] = None
    quantity_on_hand: Decimal
    description: Optional[str] = None
    is_below_minimum: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, item) -> "StockItemOut":
        category = item.category
        data = {
            "id": item.id,
            "sku": item.sku,
            "name": item.name,
            "category_id": item.category_id,
            "category_name": category.name if category else "",
            "unit": item.unit,
            "minimum_stock": item.minimum_stock,
            "unit_cost": item.unit_cost,
            "hourly_cost": item.hourly_cost,
            "quantity_on_hand": item.quantity_on_hand,
            "description": item.description,
            "is_below_minimum": Decimal(item.quantity_on_hand) < Decimal(item.minimum_stock),
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        return cls(**data)


# ---------------------------------------------------------------------------
# Stock Movements
# ---------------------------------------------------------------------------


class StockMovementCreate(BaseModel):
    stock_item_id: UUID
    movement_type: MovementType
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(default=Decimal("0"), ge=0)
    description: Optional[str] = Field(default=None, max_length=500)
    source_module: str = Field(default="manual", max_length=50)
    reference_id: Optional[UUID] = None
    occurred_at: Optional[datetime] = None


class StockMovementOut(BaseModel):
    id: UUID
    stock_item_id: UUID
    stock_item_name: str
    movement_type: MovementType
    quantity: Decimal
    unit_cost: Decimal
    total_value: Decimal
    description: Optional[str] = None
    source_module: Optional[str] = None
    reference_id: Optional[UUID] = None
    occurred_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, movement) -> "StockMovementOut":
        return cls(
            id=movement.id,
            stock_item_id=movement.stock_item_id,
            stock_item_name=movement.stock_item.name if movement.stock_item else "",
            movement_type=movement.movement_type,
            quantity=movement.quantity,
            unit_cost=movement.unit_cost,
            total_value=movement.total_value,
            description=movement.description,
            source_module=movement.source_module,
            reference_id=movement.reference_id,
            occurred_at=movement.occurred_at,
            created_at=movement.created_at,
        )


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


class InventoryItemOut(BaseModel):
    id: UUID
    sku: str
    name: str
    category_id: UUID
    category_name: str
    unit: StockUnit
    quantity_on_hand: Decimal
    unit_cost: Decimal
    total_value: Decimal
    is_below_minimum: bool

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, item) -> "InventoryItemOut":
        qty = Decimal(item.quantity_on_hand)
        cost = Decimal(item.unit_cost)
        category = item.category
        return cls(
            id=item.id,
            sku=item.sku,
            name=item.name,
            category_id=item.category_id,
            category_name=category.name if category else "",
            unit=item.unit,
            quantity_on_hand=qty,
            unit_cost=cost,
            total_value=qty * cost,
            is_below_minimum=qty < Decimal(item.minimum_stock),
        )


class InventoryOut(BaseModel):
    items: list[InventoryItemOut]
    total_value: Decimal
    generated_at: datetime
