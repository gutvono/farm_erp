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
    client_id: UUID
    client_name: str
    sale_id: Optional[UUID] = None
    issue_date: date
    due_date: Optional[date] = None
    total_amount: Decimal
    status: InvoiceStatus
    notes: Optional[str] = None
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
            items=[InvoiceItemOut.model_validate(i) for i in invoice.items],
            created_at=invoice.created_at,
            updated_at=invoice.updated_at,
        )


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus
