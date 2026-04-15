from sqlalchemy import Column, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import (
    AccountPayableStatus,
    AccountReceivableStatus,
    FinancialCategory,
    MovementType,
    sa_enum_values,
)


class FinancialMovement(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "financial_movements"

    movement_type = Column(
        SAEnum(
            MovementType,
            name="financial_movement_type",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        index=True,
    )
    category = Column(
        SAEnum(
            FinancialCategory,
            name="financial_category",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=FinancialCategory.OUTRO,
        index=True,
    )
    amount = Column(Numeric(12, 2), nullable=False, default=0)
    description = Column(String(500), nullable=False)
    source_module = Column(String(50), nullable=True, index=True)
    reference_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False, index=True)


class AccountPayable(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "accounts_payable"

    number = Column(String(32), unique=True, nullable=False, index=True)
    supplier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    purchase_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    description = Column(String(500), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(
        SAEnum(
            AccountPayableStatus,
            name="account_payable_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=AccountPayableStatus.EM_ABERTO,
        index=True,
    )
    notes = Column(Text, nullable=True)


class AccountReceivable(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "accounts_receivable"

    number = Column(String(32), unique=True, nullable=False, index=True)
    client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sale_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invoice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    description = Column(String(500), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    amount_received = Column(Numeric(12, 2), nullable=False, default=0)
    due_date = Column(Date, nullable=False, index=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(
        SAEnum(
            AccountReceivableStatus,
            name="account_receivable_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=AccountReceivableStatus.EM_ABERTO,
        index=True,
    )
    notes = Column(Text, nullable=True)
