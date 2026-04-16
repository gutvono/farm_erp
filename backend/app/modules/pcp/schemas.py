from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import LaborType, PlotActivityType, ProductionOrderStatus


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------


class PlotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    variety: str = Field(min_length=1, max_length=100)
    capacity_sacas: Decimal = Field(ge=0)
    notes: Optional[str] = None


class PlotUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    variety: Optional[str] = Field(default=None, min_length=1, max_length=100)
    capacity_sacas: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None


class PlotOut(BaseModel):
    id: UUID
    name: str
    location: Optional[str] = None
    variety: str
    capacity_sacas: Decimal
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Plot Activities
# ---------------------------------------------------------------------------


class PlotActivityCreate(BaseModel):
    plot_id: UUID
    activity_type: PlotActivityType
    activity_date: date
    labor_type: LaborType = LaborType.INTERNA
    cost: Decimal = Field(default=Decimal("0"), ge=0)
    details: Optional[str] = None


class PlotActivityOut(BaseModel):
    id: UUID
    plot_id: UUID
    plot_name: str
    activity_type: PlotActivityType
    activity_date: date
    labor_type: LaborType
    cost: Decimal
    details: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, activity, plot_name: str) -> "PlotActivityOut":
        return cls(
            id=activity.id,
            plot_id=activity.plot_id,
            plot_name=plot_name,
            activity_type=activity.activity_type,
            activity_date=activity.activity_date,
            labor_type=activity.labor_type,
            cost=activity.cost,
            details=activity.details,
            created_at=activity.created_at,
            updated_at=activity.updated_at,
        )


# ---------------------------------------------------------------------------
# Production Inputs
# ---------------------------------------------------------------------------


class ProductionInputCreate(BaseModel):
    stock_item_id: UUID
    quantity: Decimal = Field(gt=0)


class ProductionInputOut(BaseModel):
    id: UUID
    stock_item_id: UUID
    stock_item_name: str
    unit: str
    quantity: Decimal
    unit_cost: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, pi, stock_item_name: str, unit: str) -> "ProductionInputOut":
        return cls(
            id=pi.id,
            stock_item_id=pi.stock_item_id,
            stock_item_name=stock_item_name,
            unit=unit,
            quantity=pi.quantity,
            unit_cost=pi.unit_cost,
            subtotal=pi.subtotal,
        )


# ---------------------------------------------------------------------------
# Production Orders
# ---------------------------------------------------------------------------


class ProductionOrderCreate(BaseModel):
    plot_id: UUID
    planned_date: Optional[date] = None
    notes: Optional[str] = None
    inputs: list[ProductionInputCreate] = Field(default_factory=list)


class ProductionOrderOut(BaseModel):
    id: UUID
    plot_id: UUID
    plot_name: str
    planned_date: Optional[date] = None
    executed_at: Optional[datetime] = None
    total_sacas: Decimal
    especial_sacas: Decimal
    superior_sacas: Decimal
    tradicional_sacas: Decimal
    total_cost: Decimal
    status: ProductionOrderStatus
    notes: Optional[str] = None
    inputs: list[ProductionInputOut]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(
        cls,
        order,
        plot_name: str,
        inputs: list[ProductionInputOut],
    ) -> "ProductionOrderOut":
        return cls(
            id=order.id,
            plot_id=order.plot_id,
            plot_name=plot_name,
            planned_date=order.planned_date,
            executed_at=order.executed_at,
            total_sacas=order.total_sacas,
            especial_sacas=order.especial_sacas,
            superior_sacas=order.superior_sacas,
            tradicional_sacas=order.tradicional_sacas,
            total_cost=order.total_cost,
            status=order.status,
            notes=order.notes,
            inputs=inputs,
            created_at=order.created_at,
            updated_at=order.updated_at,
        )


class ProductionResult(BaseModel):
    order_id: UUID
    total_sacas: Decimal
    especial_sacas: Decimal
    superior_sacas: Decimal
    tradicional_sacas: Decimal
    inputs_consumed: list[ProductionInputOut]
    items_below_minimum: list[str]
    executed_at: datetime
