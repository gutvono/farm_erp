from sqlalchemy import Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import PurchaseOrderStatus, sa_enum_values


class Supplier(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "suppliers"

    name = Column(String(255), nullable=False, index=True)
    document = Column(String(32), nullable=True, index=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(32), nullable=True)
    address = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)

    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")

    def __repr__(self) -> str:
        return f"<Supplier {self.name}>"


class PurchaseOrder(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "purchase_orders"

    supplier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status = Column(
        SAEnum(
            PurchaseOrderStatus,
            name="purchase_order_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=PurchaseOrderStatus.EM_ANDAMENTO,
        index=True,
    )
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    ordered_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    supplier = relationship("Supplier", back_populates="purchase_orders")
    items = relationship(
        "PurchaseOrderItem",
        back_populates="purchase_order",
        cascade="all, delete-orphan",
    )


class PurchaseOrderItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "purchase_order_items"

    purchase_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
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

    purchase_order = relationship("PurchaseOrder", back_populates="items")
