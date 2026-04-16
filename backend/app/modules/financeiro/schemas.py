from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import (
    AccountPayableStatus,
    AccountReceivableStatus,
    FinancialCategory,
    MovementType,
)


# ---------------------------------------------------------------------------
# Financial Movements
# ---------------------------------------------------------------------------


class FinancialMovementCreate(BaseModel):
    movement_type: MovementType
    category: FinancialCategory = FinancialCategory.OUTRO
    amount: Decimal = Field(ge=0)
    description: str = Field(min_length=1, max_length=500)
    source_module: Optional[str] = Field(default=None, max_length=50)
    reference_id: Optional[UUID] = None
    occurred_at: Optional[datetime] = None


class FinancialMovementOut(BaseModel):
    id: UUID
    movement_type: MovementType
    category: FinancialCategory
    amount: Decimal
    description: str
    source_module: Optional[str] = None
    reference_id: Optional[UUID] = None
    occurred_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


# ---------------------------------------------------------------------------
# Accounts Payable
# ---------------------------------------------------------------------------


class AccountPayableCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0)
    due_date: date
    supplier_id: Optional[UUID] = None
    purchase_order_id: Optional[UUID] = None
    notes: Optional[str] = None


class AccountPayableUpdate(BaseModel):
    description: Optional[str] = Field(default=None, min_length=1, max_length=500)
    amount: Optional[Decimal] = Field(default=None, gt=0)
    due_date: Optional[date] = None
    supplier_id: Optional[UUID] = None
    notes: Optional[str] = None


class AccountPayableOut(BaseModel):
    id: UUID
    number: str
    supplier_id: Optional[UUID] = None
    purchase_order_id: Optional[UUID] = None
    description: str
    amount: Decimal
    due_date: date
    paid_at: Optional[datetime] = None
    status: AccountPayableStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class PayPayableRequest(BaseModel):
    paid_at: Optional[datetime] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Accounts Receivable
# ---------------------------------------------------------------------------


class AccountReceivableCreate(BaseModel):
    client_id: UUID
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0)
    due_date: date
    sale_id: Optional[UUID] = None
    invoice_id: Optional[UUID] = None
    notes: Optional[str] = None


class AccountReceivableUpdate(BaseModel):
    description: Optional[str] = Field(default=None, min_length=1, max_length=500)
    amount: Optional[Decimal] = Field(default=None, gt=0)
    due_date: Optional[date] = None
    notes: Optional[str] = None


class AccountReceivableOut(BaseModel):
    id: UUID
    number: str
    client_id: UUID
    sale_id: Optional[UUID] = None
    invoice_id: Optional[UUID] = None
    description: str
    amount: Decimal
    amount_received: Decimal
    due_date: date
    received_at: Optional[datetime] = None
    status: AccountReceivableStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class ReceivePaymentRequest(BaseModel):
    amount: Decimal = Field(gt=0)
    received_at: Optional[datetime] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


class BalanceOut(BaseModel):
    total_entradas: Decimal
    total_saidas: Decimal
    saldo: Decimal


class CashFlowItem(BaseModel):
    period: str
    entradas: Decimal
    saidas: Decimal
    saldo: Decimal


class CashFlowOut(BaseModel):
    items: list[CashFlowItem]
    total_entradas: Decimal
    total_saidas: Decimal
    saldo: Decimal


class DefaulterItem(BaseModel):
    client_id: UUID
    client_name: str
    receivable_id: UUID
    receivable_number: str
    amount: Decimal
    amount_received: Decimal
    due_date: date

    model_config = ConfigDict(from_attributes=True)
