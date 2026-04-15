from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import SaleStatus, sa_enum_values


class Client(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "clients"

    name = Column(String(255), nullable=False, index=True)
    document = Column(String(32), nullable=True, index=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(32), nullable=True)
    address = Column(String(500), nullable=True)
    is_delinquent = Column(Boolean, nullable=False, default=False, index=True)
    notes = Column(Text, nullable=True)

    sales = relationship("Sale", back_populates="client")

    def __repr__(self) -> str:
        return f"<Client {self.name}>"


class Sale(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "sales"

    client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status = Column(
        SAEnum(SaleStatus, name="sale_status", values_callable=sa_enum_values),
        nullable=False,
        default=SaleStatus.REALIZADA,
        index=True,
    )
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    sold_at = Column(DateTime(timezone=True), nullable=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    client = relationship("Client", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")


class SaleItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sale_items"

    sale_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stock_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("stock_items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    description = Column(String(255), nullable=True)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)

    sale = relationship("Sale", back_populates="items")
