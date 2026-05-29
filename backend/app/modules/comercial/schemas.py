from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.shared.enums import PaymentMethod, SaleStatus


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
    installments: int = Field(default=1, ge=1, le=24)
    first_due_date: Optional[date] = None
    installment_interval_days: int = Field(default=30, ge=1)
    payment_method: PaymentMethod = PaymentMethod.A_VISTA
    shipping_cost: Optional[Decimal] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _validate_installments(self) -> "SaleCreate":
        if self.installments >= 2 and self.first_due_date is None:
            raise ValueError(
                "first_due_date é obrigatório quando installments >= 2"
            )
        if self.payment_method == PaymentMethod.PARCELADO and self.installments < 2:
            raise ValueError(
                "Pagamento parcelado exige installments >= 2"
            )
        return self


class SaleOut(BaseModel):
    id: UUID
    client_id: UUID
    client_name: str
    status: SaleStatus
    total_amount: Decimal
    shipping_cost: Decimal = Decimal("0")
    sold_at: datetime
    delivered_at: Optional[datetime] = None
    notes: Optional[str] = None
    installments: int = 1
    first_due_date: Optional[date] = None
    installment_interval_days: int = 30
    payment_method: str = PaymentMethod.A_VISTA.value
    items: list[SaleItemOut]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, sale) -> "SaleOut":
        payment_method = sale.payment_method
        if payment_method is None:
            payment_method_value = PaymentMethod.A_VISTA.value
        elif hasattr(payment_method, "value"):
            payment_method_value = payment_method.value
        else:
            payment_method_value = payment_method
        return cls(
            id=sale.id,
            client_id=sale.client_id,
            client_name=sale.client.name if sale.client else "",
            status=sale.status,
            total_amount=sale.total_amount,
            shipping_cost=Decimal(str(sale.shipping_cost or 0)),
            sold_at=sale.sold_at,
            delivered_at=sale.delivered_at,
            notes=sale.notes,
            installments=sale.installments or 1,
            first_due_date=sale.first_due_date,
            installment_interval_days=sale.installment_interval_days or 30,
            payment_method=payment_method_value,
            items=[SaleItemOut.from_model(i) for i in sale.items],
            created_at=sale.created_at,
            updated_at=sale.updated_at,
        )


class SaleStatusUpdate(BaseModel):
    status: SaleStatus
