from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.shared.enums import (
    AccountPayableStatus,
    AccountReceivableStatus,
    FinancialCategory,
    MovementType,
    PaymentMethod,
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
    payment_method: Optional[PaymentMethod] = None


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
    installment_number: Optional[int] = None
    installment_total: Optional[int] = None
    payment_method: Optional[str] = None
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
    payment_method: Optional[PaymentMethod] = None


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
    installment_number: Optional[int] = None
    installment_total: Optional[int] = None
    payment_method: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @computed_field
    @property
    def is_overdue(self) -> bool:
        """Vencida (Demanda 9.A): venc. < hoje, com saldo em aberto e não
        cancelada. Quitada ou cancelada nunca é vencida — derivado na leitura."""
        status = getattr(self.status, "value", self.status)
        if status == AccountReceivableStatus.CANCELADA.value:
            return False
        if Decimal(self.amount_received) >= Decimal(self.amount):
            return False
        return self.due_date < date.today()

    @computed_field
    @property
    def days_overdue(self) -> int:
        """Dias de atraso (`hoje - due_date`) quando vencida; senão 0."""
        if not self.is_overdue:
            return 0
        return max(0, (date.today() - self.due_date).days)


class ReceivePaymentRequest(BaseModel):
    amount: Decimal = Field(gt=0)
    received_at: Optional[datetime] = None
    notes: Optional[str] = None
    # Encargo por atraso (Demanda 9.B): override opcional do valor pré-calculado.
    # Só se aplica à baixa que QUITA uma parcela vencida. `0` = perdão. Ausente =
    # usa o cálculo automático (multa + juros) das taxas em Configurações.
    encargo: Optional[Decimal] = Field(default=None, ge=0)


class EncargoOut(BaseModel):
    """Breakdown do encargo por atraso de uma conta a receber (Demanda 9.B).
    `0` em tudo quando a parcela não está vencida."""

    receivable_id: UUID
    number: str
    saldo: Decimal
    dias_atraso: int
    multa: Decimal
    juros: Decimal
    total: Decimal


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


class PaymentMethodUpdate(BaseModel):
    payment_method: PaymentMethod


class PayrollApprovalRefuse(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class PixPaymentInfo(BaseModel):
    pix_key: str
    pix_code: str
    amount: Decimal
    description: str


class BoletoPaymentInfo(BaseModel):
    boleto_number: str
    barcode: str
    due_date: str
    amount: Decimal
    beneficiary: str
    payer: str


class DefaulterItem(BaseModel):
    client_id: UUID
    client_name: str
    receivable_id: UUID
    receivable_number: str
    amount: Decimal
    amount_received: Decimal
    due_date: date

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Receivables report (Demanda 10 — consumido pelo Comercial via Service)
# ---------------------------------------------------------------------------


class AgingBucketOut(BaseModel):
    """Faixa de aging por dias de atraso, com o saldo vencido acumulado."""

    bucket: str  # "1-30" | "31-60" | "61-90" | "90+"
    amount: Decimal


class ReceivablesReportOut(BaseModel):
    """Fatia de recebíveis do Relatório de Vendas (Demanda 10). Lida **via service
    do Financeiro** (regra de arquitetura travada: o Comercial é consumidor, não
    consulta `accounts_receivable` direto).

    - `received_in_period`: Σ amount_received de AR com received_at ∈ [start, end];
    - `to_receive_in_period`: Σ saldo de AR em aberto com due_date ∈ [start, end];
    - `overdue_total` + `aging`: AR vencidas (due_date < hoje, em aberto) — foto de
      inadimplência **na data de hoje**, NÃO limitada ao período do relatório."""

    start: date
    end: date
    received_in_period: Decimal
    to_receive_in_period: Decimal
    overdue_total: Decimal
    aging: list[AgingBucketOut]
