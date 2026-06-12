from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import AccountReceivableStatus, InvoiceStatus


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


class InvoiceParcelaOut(BaseModel):
    """Parcela da nota = uma conta a receber (`accounts_receivable`) ligada à
    nota por `invoice_id`. É o 'bloco de cobrança' da NF (Demanda 9.0): a venda
    parcelada tem 1 nota + N parcelas, todas vivendo na AR."""

    id: UUID
    number: str
    installment_number: int
    installment_total: int
    due_date: date
    amount: Decimal
    amount_received: Decimal
    status: AccountReceivableStatus
    payment_method: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_receivable(cls, ar) -> "InvoiceParcelaOut":
        return cls(
            id=ar.id,
            number=ar.number,
            installment_number=ar.installment_number or 1,
            installment_total=ar.installment_total or 1,
            due_date=ar.due_date,
            amount=ar.amount,
            amount_received=ar.amount_received,
            status=ar.status,
            payment_method=ar.payment_method,
        )


class InvoiceOut(BaseModel):
    id: UUID
    number: str
    client_id: Optional[UUID] = None
    client_name: str
    sale_id: Optional[UUID] = None
    issue_date: date
    due_date: Optional[date] = None
    # Cabeçalho de valores da NF (Demanda 9.C): `subtotal` = Σ itens a preço de
    # tabela; `discount_amount` = desconto lido da VENDA vinculada (fonte única —
    # `sales.discount_amount`), 0 para nota sem venda/sem desconto; `total_amount`
    # = total líquido da nota. A NF exibe Subtotal → Desconto → Total líquido.
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
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
    # Bloco de cobrança (Demanda 9.0): as parcelas da nota, derivadas das AR por
    # `invoice_id`. Vazio para notas sem AR (transporte/serviço/etc.).
    parcelas: list[InvoiceParcelaOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(
        cls, invoice, client_name: str, parcelas=None, discount_amount=Decimal("0")
    ) -> "InvoiceOut":
        """Serializa a nota. ``parcelas`` é a lista de AR (não canceladas) ligadas
        à nota por `invoice_id`; quando informada, o `status` é **derivado**: a
        nota nasce `emitida` e vira `paga` somente quando TODAS as parcelas estão
        quitadas (nunca por parcela). `cancelada` é preservado. Sem parcelas, o
        status do banco é mantido.

        ``discount_amount`` vem da VENDA vinculada (`sales.discount_amount`),
        fonte única do desconto — 0 para nota sem venda/sem desconto. O `subtotal`
        (Σ itens a preço de tabela) é derivado dos próprios itens da nota."""
        ar_list = sorted(
            parcelas or [], key=lambda r: (r.installment_number or 1)
        )

        status = invoice.status
        if status != InvoiceStatus.CANCELADA and ar_list:
            all_quitadas = all(
                r.status == AccountReceivableStatus.QUITADO for r in ar_list
            )
            status = InvoiceStatus.PAGA if all_quitadas else InvoiceStatus.EMITIDA

        subtotal = sum(
            (Decimal(str(i.subtotal)) for i in invoice.items), Decimal("0")
        )

        return cls(
            id=invoice.id,
            number=invoice.number,
            client_id=invoice.client_id,
            client_name=client_name,
            sale_id=invoice.sale_id,
            issue_date=invoice.issue_date,
            due_date=invoice.due_date,
            subtotal=subtotal,
            discount_amount=Decimal(str(discount_amount or 0)),
            total_amount=invoice.total_amount,
            status=status,
            notes=invoice.notes,
            invoice_type=invoice.invoice_type or "venda",
            installment_number=invoice.installment_number,
            installment_total=invoice.installment_total,
            parent_invoice_id=invoice.parent_invoice_id,
            cancelled_at=invoice.cancelled_at,
            cancellation_reason=invoice.cancellation_reason,
            items=[InvoiceItemOut.model_validate(i) for i in invoice.items],
            parcelas=[InvoiceParcelaOut.from_receivable(r) for r in ar_list],
            created_at=invoice.created_at,
            updated_at=invoice.updated_at,
        )


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus


class InvoiceCancel(BaseModel):
    reason: Optional[str] = None
