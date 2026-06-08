from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.shared.enums import (
    PaymentMethod,
    PurchaseOrderReceiptStatus,
    PurchaseOrderStatus,
    QuotationStatus,
)


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    document: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    # Endereço legado (texto livre) — mantido por compatibilidade.
    address: Optional[str] = Field(default=None, max_length=500)
    # Endereço estruturado (Demanda 6). A busca por CEP (ViaCEP) é feita no
    # front; o backend só persiste o que recebe.
    cep: Optional[str] = Field(default=None, max_length=9)
    street: Optional[str] = Field(default=None, max_length=255)
    number: Optional[str] = Field(default=None, max_length=20)
    complement: Optional[str] = Field(default=None, max_length=120)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=120)
    state: Optional[str] = Field(default=None, max_length=2)
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    document: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=500)
    cep: Optional[str] = Field(default=None, max_length=9)
    street: Optional[str] = Field(default=None, max_length=255)
    number: Optional[str] = Field(default=None, max_length=20)
    complement: Optional[str] = Field(default=None, max_length=120)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=120)
    state: Optional[str] = Field(default=None, max_length=2)
    notes: Optional[str] = None


class SupplierOut(BaseModel):
    id: UUID
    name: str
    document: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    cep: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Supplier Items (catálogo do fornecedor)
# ---------------------------------------------------------------------------


class SupplierItemCreate(BaseModel):
    stock_item_id: UUID
    unit_price: Decimal = Field(gt=0)


class SupplierItemUpdate(BaseModel):
    unit_price: Optional[Decimal] = Field(default=None, gt=0)
    is_active: Optional[bool] = None


class SupplierItemOut(BaseModel):
    id: UUID
    supplier_id: UUID
    stock_item_id: UUID
    stock_item_name: str
    stock_item_sku: str
    unit_price: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, item) -> "SupplierItemOut":
        stock_item = getattr(item, "stock_item", None)
        return cls(
            id=item.id,
            supplier_id=item.supplier_id,
            stock_item_id=item.stock_item_id,
            stock_item_name=stock_item.name if stock_item else "",
            stock_item_sku=stock_item.sku if stock_item else "",
            unit_price=item.unit_price,
            is_active=item.is_active,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )


class SupplierForStockItemOut(BaseModel):
    """Fornecedor que vende um item (dropdown produto-primeiro)."""

    supplier_id: UUID
    supplier_name: str
    unit_price: Decimal

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
    items: list[PurchaseOrderItemCreate] = Field(default_factory=list)
    ordered_at: Optional[datetime] = None
    order_type: str = Field(default="produto")
    service_description: Optional[str] = None
    total_amount: Optional[Decimal] = Field(default=None, ge=0)
    shipping_cost: Optional[Decimal] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _validate_order_type(self) -> "PurchaseOrderCreate":
        if self.order_type not in ("produto", "servico"):
            raise ValueError("order_type deve ser 'produto' ou 'servico'")
        if self.order_type == "servico":
            if not self.service_description:
                raise ValueError(
                    "service_description é obrigatório para ordens de serviço"
                )
            if self.total_amount is None or self.total_amount <= 0:
                raise ValueError(
                    "total_amount é obrigatório e deve ser maior que zero para ordens de serviço"
                )
            # shipping_cost não se aplica a ordens de serviço
            self.shipping_cost = None
        else:
            if not self.items:
                raise ValueError(
                    "items é obrigatório para ordens de produto (mínimo 1 item)"
                )
        return self


class ApproveOrderRequest(BaseModel):
    payment_method: PaymentMethod
    installments: int = Field(default=1, ge=1, le=24)
    first_due_date: Optional[date] = None
    installment_interval_days: int = Field(default=30, ge=1)

    @model_validator(mode="after")
    def _validate_payment_method(self) -> "ApproveOrderRequest":
        if self.payment_method == PaymentMethod.PARCELADO:
            if self.installments < 2:
                raise ValueError(
                    "Pagamento parcelado exige installments >= 2"
                )
            if self.first_due_date is None:
                raise ValueError(
                    "first_due_date é obrigatório para pagamento parcelado"
                )
        return self


class PurchaseOrderOut(BaseModel):
    id: UUID
    supplier_id: UUID
    supplier_name: str
    status: PurchaseOrderStatus
    total_amount: Decimal
    shipping_cost: Decimal = Decimal("0")
    receipt_total_amount: Decimal = Decimal("0")
    financial_approval_note: Optional[str] = None
    ordered_at: datetime
    received_at: Optional[datetime] = None
    notes: Optional[str] = None
    order_type: str = "produto"
    service_description: Optional[str] = None
    payment_method: Optional[str] = None
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
            shipping_cost=Decimal(str(order.shipping_cost or 0)),
            receipt_total_amount=order.receipt_total_amount or Decimal("0"),
            financial_approval_note=order.financial_approval_note,
            ordered_at=order.ordered_at,
            received_at=order.received_at,
            notes=order.notes,
            order_type=order.order_type or "produto",
            service_description=order.service_description,
            payment_method=(
                order.payment_method.value
                if order.payment_method is not None
                and hasattr(order.payment_method, "value")
                else order.payment_method
            ),
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
    shipping_cost: Decimal = Decimal("0")
    receipt_total_amount: Decimal
    financial_approval_note: Optional[str] = None
    ordered_at: datetime
    received_at: Optional[datetime] = None
    notes: Optional[str] = None
    order_type: str = "produto"
    service_description: Optional[str] = None
    payment_method: Optional[str] = None
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
            shipping_cost=Decimal(str(order.shipping_cost or 0)),
            receipt_total_amount=order.receipt_total_amount,
            financial_approval_note=order.financial_approval_note,
            ordered_at=order.ordered_at,
            received_at=order.received_at,
            notes=order.notes,
            order_type=order.order_type or "produto",
            service_description=order.service_description,
            payment_method=(
                order.payment_method.value
                if order.payment_method is not None
                and hasattr(order.payment_method, "value")
                else order.payment_method
            ),
            installments=order.installments or 1,
            first_due_date=order.first_due_date,
            installment_interval_days=order.installment_interval_days or 30,
            items=[PurchaseOrderItemOut.from_model(i) for i in order.items],
            receipts=[PurchaseOrderReceiptItemOut.from_model(r) for r in order.receipts],
            created_at=order.created_at,
            updated_at=order.updated_at,
        )


# ---------------------------------------------------------------------------
# Quotations — entrada (Create / Update / Actions)
# ---------------------------------------------------------------------------


class QuotationItemCreate(BaseModel):
    stock_item_id: UUID
    quantity: Decimal = Field(gt=0)


class QuotationCreate(BaseModel):
    order_type: str = Field(default="produto")
    service_description: Optional[str] = None
    notes: Optional[str] = None
    items: list[QuotationItemCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_order_type(self) -> "QuotationCreate":
        if self.order_type not in ("produto", "servico"):
            raise ValueError("order_type deve ser 'produto' ou 'servico'")
        if self.order_type == "servico":
            if not self.service_description:
                raise ValueError(
                    "service_description é obrigatório para cotações de serviço"
                )
            if self.items:
                raise ValueError(
                    "Cotações de serviço não devem ter itens de estoque"
                )
        else:
            if not self.items:
                raise ValueError(
                    "items é obrigatório para cotações de produto (mínimo 1 item)"
                )
        return self


class QuotationProposalItemCreate(BaseModel):
    quotation_item_id: UUID
    unit_price: Decimal = Field(ge=0)


class QuotationProposalCreate(BaseModel):
    supplier_id: UUID
    total_price: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None
    proposal_items: list[QuotationProposalItemCreate] = Field(default_factory=list)


class QuotationProposalUpdate(BaseModel):
    supplier_id: Optional[UUID] = None
    total_price: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None
    proposal_items: Optional[list[QuotationProposalItemCreate]] = None


class SelectWinnerRequest(BaseModel):
    proposal_id: UUID


class CancelQuotationRequest(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class RealizeOrderRequest(BaseModel):
    shipping_cost: Optional[Decimal] = Field(default=None, ge=0)
    ordered_at: Optional[datetime] = None
    notes: Optional[str] = None
    # Forma de pagamento / parcelamento opcionais — quando informados, são
    # propagados para a Ordem de Compra gerada (relevante para serviço, cuja
    # conta a pagar é gerada já no realizar-pedido via complete_service_order).
    payment_method: Optional[PaymentMethod] = None
    installments: int = Field(default=1, ge=1, le=24)
    first_due_date: Optional[date] = None
    installment_interval_days: int = Field(default=30, ge=1)


# ---------------------------------------------------------------------------
# Quotations — saída (Out)
# ---------------------------------------------------------------------------


class QuotationItemOut(BaseModel):
    id: UUID
    stock_item_id: UUID
    stock_item_name: str
    quantity: Decimal

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, item) -> "QuotationItemOut":
        return cls(
            id=item.id,
            stock_item_id=item.stock_item_id,
            stock_item_name=item.stock_item.name if item.stock_item else "",
            quantity=item.quantity,
        )


class QuotationProposalItemOut(BaseModel):
    id: UUID
    proposal_id: UUID
    quotation_item_id: UUID
    unit_price: Decimal

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, item) -> "QuotationProposalItemOut":
        return cls(
            id=item.id,
            proposal_id=item.proposal_id,
            quotation_item_id=item.quotation_item_id,
            unit_price=item.unit_price,
        )


class QuotationProposalOut(BaseModel):
    id: UUID
    quotation_id: UUID
    supplier_id: UUID
    supplier_name: str
    total_price: Optional[Decimal] = None
    notes: Optional[str] = None
    proposal_items: list[QuotationProposalItemOut]

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, proposal) -> "QuotationProposalOut":
        return cls(
            id=proposal.id,
            quotation_id=proposal.quotation_id,
            supplier_id=proposal.supplier_id,
            supplier_name=proposal.supplier.name if proposal.supplier else "",
            total_price=proposal.total_price,
            notes=proposal.notes,
            proposal_items=[
                QuotationProposalItemOut.from_model(i) for i in proposal.proposal_items
            ],
        )


class QuotationOut(BaseModel):
    id: UUID
    order_type: str
    status: QuotationStatus
    service_description: Optional[str] = None
    notes: Optional[str] = None
    cancellation_note: Optional[str] = None
    winning_proposal_id: Optional[UUID] = None
    purchase_order_id: Optional[UUID] = None
    items: list[QuotationItemOut]
    proposals: list[QuotationProposalOut]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, quotation) -> "QuotationOut":
        return cls(
            id=quotation.id,
            order_type=quotation.order_type or "produto",
            status=quotation.status,
            service_description=quotation.service_description,
            notes=quotation.notes,
            cancellation_note=quotation.cancellation_note,
            winning_proposal_id=quotation.winning_proposal_id,
            purchase_order_id=quotation.purchase_order_id,
            items=[QuotationItemOut.from_model(i) for i in quotation.items],
            proposals=[QuotationProposalOut.from_model(p) for p in quotation.proposals],
            created_at=quotation.created_at,
            updated_at=quotation.updated_at,
        )
