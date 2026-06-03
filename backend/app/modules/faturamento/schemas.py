from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import InvoiceStatus


# ---------------------------------------------------------------------------
# Invoice Items
# ---------------------------------------------------------------------------


class InvoiceItemCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)


class InvoiceItemOut(BaseModel):
    id: UUID
    description: str
    quantity: Decimal
    unit_price: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


class InvoiceCreate(BaseModel):
    client_id: UUID
    notes: Optional[str] = None
    due_date: Optional[date] = None
    items: list[InvoiceItemCreate] = Field(min_length=1)


class InvoiceOut(BaseModel):
    id: UUID
    number: str
    client_id: Optional[UUID] = None
    client_name: str
    sale_id: Optional[UUID] = None
    issue_date: date
    due_date: Optional[date] = None
    total_amount: Decimal
    status: InvoiceStatus
    notes: Optional[str] = None
    invoice_type: str = "venda"
    installment_number: Optional[int] = None
    installment_total: Optional[int] = None
    parent_invoice_id: Optional[UUID] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    items: list[InvoiceItemOut]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, invoice, client_name: str) -> "InvoiceOut":
        return cls(
            id=invoice.id,
            number=invoice.number,
            client_id=invoice.client_id,
            client_name=client_name,
            sale_id=invoice.sale_id,
            issue_date=invoice.issue_date,
            due_date=invoice.due_date,
            total_amount=invoice.total_amount,
            status=invoice.status,
            notes=invoice.notes,
            invoice_type=invoice.invoice_type or "venda",
            installment_number=invoice.installment_number,
            installment_total=invoice.installment_total,
            parent_invoice_id=invoice.parent_invoice_id,
            cancelled_at=invoice.cancelled_at,
            cancellation_reason=invoice.cancellation_reason,
            items=[InvoiceItemOut.model_validate(i) for i in invoice.items],
            created_at=invoice.created_at,
            updated_at=invoice.updated_at,
        )


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus


class InvoiceCancel(BaseModel):
    reason: Optional[str] = None
