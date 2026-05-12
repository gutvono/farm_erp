from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.shared.enums import PurchaseOrderReceiptStatus, PurchaseOrderStatus


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
    installments: int = Field(default=1, ge=1, le=24)
    first_due_date: Optional[date] = None
    installment_interval_days: int = Field(default=30, ge=1)

    @model_validator(mode="after")
    def _validate_installments(self) -> "PurchaseOrderCreate":
        if self.installments >= 2 and self.first_due_date is None:
            raise ValueError(
                "first_due_date é obrigatório quando installments >= 2"
            )
        return self


class PurchaseOrderOut(BaseModel):
    id: UUID
    supplier_id: UUID
    supplier_name: str
    status: PurchaseOrderStatus
    total_amount: Decimal
    receipt_total_amount: Decimal = Decimal("0")
    financial_approval_note: Optional[str] = None
    ordered_at: datetime
    received_at: Optional[datetime] = None
    notes: Optional[str] = None
    installments: int = 1
    first_due_date: Optional[date] = None
    installment_interval_days: int = 30
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
            receipt_total_amount=order.receipt_total_amount or Decimal("0"),
            financial_approval_note=order.financial_approval_note,
            ordered_at=order.ordered_at,
            received_at=order.received_at,
            notes=order.notes,
            installments=order.installments or 1,
            first_due_date=order.first_due_date,
            installment_interval_days=order.installment_interval_days or 30,
            items=[PurchaseOrderItemOut.from_model(i) for i in order.items],
            created_at=order.created_at,
            updated_at=order.updated_at,
        )


class PurchaseOrderStatusUpdate(BaseModel):
    status: PurchaseOrderStatus


# ---------------------------------------------------------------------------
# Approval / Receipt flow
# ---------------------------------------------------------------------------


class PurchaseOrderCancelRequest(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class PurchaseOrderReceiptItem(BaseModel):
    purchase_order_item_id: UUID
    quantity_accepted: Decimal = Field(ge=0)
    quantity_rejected: Decimal = Field(ge=0)
    rejection_reason: Optional[str] = Field(default=None, max_length=2000)


class PurchaseOrderReceiptFinalize(BaseModel):
    items: list[PurchaseOrderReceiptItem] = Field(min_length=1)


class PurchaseOrderReceiptItemOut(BaseModel):
    id: UUID
    purchase_order_id: UUID
    purchase_order_item_id: UUID
    stock_item_id: UUID
    stock_item_name: str
    quantity_ordered: Decimal
    quantity_accepted: Decimal
    quantity_rejected: Decimal
    unit_price: Decimal
    rejection_reason: Optional[str] = None
    status: PurchaseOrderReceiptStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, receipt) -> "PurchaseOrderReceiptItemOut":
        order_item = receipt.purchase_order_item
        stock_item = getattr(order_item, "stock_item", None) if order_item else None
        return cls(
            id=receipt.id,
            purchase_order_id=receipt.purchase_order_id,
            purchase_order_item_id=receipt.purchase_order_item_id,
            stock_item_id=order_item.stock_item_id if order_item else None,
            stock_item_name=stock_item.name if stock_item else "",
            quantity_ordered=receipt.quantity_ordered,
            quantity_accepted=receipt.quantity_accepted,
            quantity_rejected=receipt.quantity_rejected,
            unit_price=order_item.unit_price if order_item else Decimal("0"),
            rejection_reason=receipt.rejection_reason,
            status=receipt.status,
            created_at=receipt.created_at,
            updated_at=receipt.updated_at,
        )


class PurchaseOrderWithReceipts(BaseModel):
    id: UUID
    supplier_id: UUID
    supplier_name: str
    status: PurchaseOrderStatus
    total_amount: Decimal
    receipt_total_amount: Decimal
    financial_approval_note: Optional[str] = None
    ordered_at: datetime
    received_at: Optional[datetime] = None
    notes: Optional[str] = None
    installments: int = 1
    first_due_date: Optional[date] = None
    installment_interval_days: int = 30
    items: list[PurchaseOrderItemOut]
    receipts: list[PurchaseOrderReceiptItemOut]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, order) -> "PurchaseOrderWithReceipts":
        return cls(
            id=order.id,
            supplier_id=order.supplier_id,
            supplier_name=order.supplier.name if order.supplier else "",
            status=order.status,
            total_amount=order.total_amount,
            receipt_total_amount=order.receipt_total_amount,
            financial_approval_note=order.financial_approval_note,
            ordered_at=order.ordered_at,
            received_at=order.received_at,
            notes=order.notes,
            installments=order.installments or 1,
            first_due_date=order.first_due_date,
            installment_interval_days=order.installment_interval_days or 30,
            items=[PurchaseOrderItemOut.from_model(i) for i in order.items],
            receipts=[PurchaseOrderReceiptItemOut.from_model(r) for r in order.receipts],
            created_at=order.created_at,
            updated_at=order.updated_at,
        )
