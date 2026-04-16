from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import SaleStatus


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    document: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    document: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = None


class ClientOut(BaseModel):
    id: UUID
    name: str
    document: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_delinquent: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Sale Items
# ---------------------------------------------------------------------------


class SaleItemCreate(BaseModel):
    stock_item_id: UUID
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    description: Optional[str] = Field(default=None, max_length=255)


class SaleItemOut(BaseModel):
    id: UUID
    stock_item_id: UUID
    stock_item_name: str
    description: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, item) -> "SaleItemOut":
        return cls(
            id=item.id,
            stock_item_id=item.stock_item_id,
            stock_item_name=item.stock_item.name if item.stock_item else "",
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=item.subtotal,
        )


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------


class SaleCreate(BaseModel):
    client_id: UUID
    notes: Optional[str] = None
    sold_at: Optional[datetime] = None
    items: list[SaleItemCreate] = Field(min_length=1)


class SaleOut(BaseModel):
    id: UUID
    client_id: UUID
    client_name: str
    status: SaleStatus
    total_amount: Decimal
    sold_at: datetime
    delivered_at: Optional[datetime] = None
    notes: Optional[str] = None
    items: list[SaleItemOut]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, sale) -> "SaleOut":
        return cls(
            id=sale.id,
            client_id=sale.client_id,
            client_name=sale.client.name if sale.client else "",
            status=sale.status,
            total_amount=sale.total_amount,
            sold_at=sale.sold_at,
            delivered_at=sale.delivered_at,
            notes=sale.notes,
            items=[SaleItemOut.from_model(i) for i in sale.items],
            created_at=sale.created_at,
            updated_at=sale.updated_at,
        )


class SaleStatusUpdate(BaseModel):
    status: SaleStatus
