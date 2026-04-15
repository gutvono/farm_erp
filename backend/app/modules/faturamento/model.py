from sqlalchemy import Column, Date, ForeignKey, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import InvoiceStatus, sa_enum_values


class Invoice(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "invoices"

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
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=True)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    status = Column(
        SAEnum(
            InvoiceStatus,
            name="invoice_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=InvoiceStatus.EMITIDA,
        index=True,
    )
    notes = Column(Text, nullable=True)

    items = relationship(
        "InvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
    )


class InvoiceItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "invoice_items"

    invoice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description = Column(String(500), nullable=False)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="items")
