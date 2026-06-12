from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.financeiro.schemas import ReceivablesReportOut
from app.shared.enums import PaymentMethod, SaleStatus


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    document: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    # Endereço legado (texto livre) — mantido por compatibilidade.
    address: Optional[str] = Field(default=None, max_length=500)
    # Endereço estruturado (Demanda 7, espelha o fornecedor da D6). A busca por
    # CEP (ViaCEP) é feita no front; o backend só persiste o que recebe.
    cep: Optional[str] = Field(default=None, max_length=9)
    street: Optional[str] = Field(default=None, max_length=255)
    number: Optional[str] = Field(default=None, max_length=20)
    complement: Optional[str] = Field(default=None, max_length=120)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=120)
    state: Optional[str] = Field(default=None, max_length=2)
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
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


class ClientOut(BaseModel):
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
    is_delinquent: bool
    # Inadimplência derivada (Demanda 9.A): `has_overdue` = tem ≥1 parcela
    # vencida (calculado na leitura). `is_delinquent_effective` = flag manual
    # (override D7) OU vencida. `is_delinquent` (manual) é preservado.
    has_overdue: bool = False
    is_delinquent_effective: bool = False
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, client, has_overdue: bool = False) -> "ClientOut":
        out = cls.model_validate(client)
        out.has_overdue = has_overdue
        out.is_delinquent_effective = bool(client.is_delinquent) or has_overdue
        return out


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
    # Desconto de cabeçalho (Demanda 9.C): percentual sobre o subtotal dos itens.
    # O preço unitário/tabela de cada item permanece intacto; o desconto é aplicado
    # no total da venda (não por item). Só %, 0–100.
    discount_percent: Decimal = Field(default=0, ge=0, le=100)

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
    # Desconto de cabeçalho (Demanda 9.C). `items_subtotal` é o subtotal BRUTO
    # dos itens (soma a preço de tabela), exposto para que NF e front montem
    # Subtotal → Desconto → Total líquido sem recomputar. `total_amount` já é o
    # LÍQUIDO (items_subtotal − discount_amount + frete).
    items_subtotal: Decimal = Decimal("0")
    discount_percent: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
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
            items_subtotal=sum(
                (Decimal(str(i.subtotal)) for i in sale.items), Decimal("0")
            ),
            discount_percent=Decimal(str(sale.discount_percent or 0)),
            discount_amount=Decimal(str(sale.discount_amount or 0)),
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


class SaleCancelRequest(BaseModel):
    """Corpo (opcional) da ação 'Cancelar venda'. ``reason`` é o motivo do
    cancelamento, registrado nas NFs estornadas."""

    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Sales report (Demanda 10) — operacional (Comercial) + recebíveis (Financeiro)
# ---------------------------------------------------------------------------


class SalesReportKPIs(BaseModel):
    """KPIs de topo do relatório (e do headline do dashboard). `faturamento` e
    `ticket_medio` são líquidos (sobre `total_amount`, pós-desconto D9);
    canceladas excluídas."""

    faturamento: Decimal
    num_vendas: int
    ticket_medio: Decimal


class SalesStatusItem(BaseModel):
    status: str
    count: int
    total: Decimal


class SalesMixItem(BaseModel):
    """Categoria do mix: ``a_vista`` ou ``parcelado`` (installments > 1)."""

    category: str
    count: int
    total: Decimal


class SalesTimeseriesItem(BaseModel):
    period: str
    count: int
    total: Decimal


class TopProductItem(BaseModel):
    stock_item_id: UUID
    name: str
    quantity: Decimal
    total: Decimal


class TopClientItem(BaseModel):
    client_id: UUID
    name: str
    num_vendas: int
    total: Decimal


class SalesReportOut(BaseModel):
    """Relatório de Vendas por período (Demanda 10). Combina a fatia operacional
    (vendas/itens, via repository do Comercial) com a fatia de recebíveis (lida
    via service do Financeiro). Canceladas só aparecem em `by_status`."""

    start: date
    end: date
    granularity: str
    kpis: SalesReportKPIs
    by_status: list[SalesStatusItem]
    mix: list[SalesMixItem]
    timeseries: list[SalesTimeseriesItem]
    top_products: list[TopProductItem]
    top_clients: list[TopClientItem]
    receivables: ReceivablesReportOut
