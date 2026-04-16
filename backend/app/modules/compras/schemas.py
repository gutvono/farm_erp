from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import PurchaseOrderStatus


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    document: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    document: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = None


class SupplierOut(BaseModel):
    id: UUID
    name: str
    document: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Purchase Order Items
# ---------------------------------------------------------------------------


class PurchaseOrderItemCreate(BaseModel):
    stock_item_id: UUID
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    description: Optional[str] = Field(default=None, max_length=255)


class PurchaseOrderItemOut(BaseModel):
    id: UUID
    stock_item_id: UUID
    stock_item_name: str
    description: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, item) -> "PurchaseOrderItemOut":
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
# Purchase Orders
# ---------------------------------------------------------------------------


class PurchaseOrderCreate(BaseModel):
    supplier_id: UUID
    notes: Optional[str] = None
    items: list[PurchaseOrderItemCreate] = Field(min_length=1)
    ordered_at: Optional[datetime] = None


class PurchaseOrderOut(BaseModel):
    id: UUID
    supplier_id: UUID
    supplier_name: str
    status: PurchaseOrderStatus
    total_amount: Decimal
    ordered_at: datetime
    received_at: Optional[datetime] = None
    notes: Optional[str] = None
    items: list[PurchaseOrderItemOut]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, order) -> "PurchaseOrderOut":
        return cls(
            id=order.id,
            supplier_id=order.supplier_id,
            supplier_name=order.supplier.name if order.supplier else "",
            status=order.status,
            total_amount=order.total_amount,
            ordered_at=order.ordered_at,
            received_at=order.received_at,
            notes=order.notes,
            items=[PurchaseOrderItemOut.from_model(i) for i in order.items],
            created_at=order.created_at,
            updated_at=order.updated_at,
        )


class PurchaseOrderStatusUpdate(BaseModel):
    status: PurchaseOrderStatus
