from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import (
    PaymentMethod,
    PurchaseOrderReceiptStatus,
    PurchaseOrderStatus,
    QuotationStatus,
    sa_enum_values,
)


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
    __table_args__ = (
        # Ordenação default da lista de Compras (ordered_at desc). Ver migration
        # 0011_add_sort_indexes.
        Index("idx_purchase_orders_ordered_at", "ordered_at"),
    )

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
    shipping_cost = Column(Numeric(12, 2), nullable=True, default=0)
    ordered_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    financial_approval_note = Column(Text, nullable=True)
    receipt_total_amount = Column(Numeric(10, 2), nullable=False, default=0)
    installments = Column(Integer, nullable=False, default=1)
    first_due_date = Column(Date, nullable=True)
    installment_interval_days = Column(Integer, nullable=False, default=30)
    order_type = Column(String(10), nullable=False, default="produto")
    service_description = Column(Text, nullable=True)
    payment_method = Column(
        SAEnum(PaymentMethod, name="payment_method", values_callable=sa_enum_values),
        nullable=True,
    )

    supplier = relationship("Supplier", back_populates="purchase_orders")
    items = relationship(
        "PurchaseOrderItem",
        back_populates="purchase_order",
        cascade="all, delete-orphan",
    )
    receipts = relationship(
        "PurchaseOrderReceipt",
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


class PurchaseOrderReceipt(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "purchase_order_receipts"

    purchase_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purchase_order_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_order_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity_ordered = Column(Numeric(10, 3), nullable=False)
    quantity_accepted = Column(Numeric(10, 3), nullable=False, default=0)
    quantity_rejected = Column(Numeric(10, 3), nullable=False, default=0)
    rejection_reason = Column(Text, nullable=True)
    status = Column(
        SAEnum(
            PurchaseOrderReceiptStatus,
            name="purchase_order_receipt_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=PurchaseOrderReceiptStatus.PENDENTE,
    )

    purchase_order = relationship("PurchaseOrder", back_populates="receipts")
    purchase_order_item = relationship("PurchaseOrderItem")


class Quotation(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "quotations"
    __table_args__ = (
        Index("idx_quotations_status", "status"),
        Index("idx_quotations_purchase_order_id", "purchase_order_id"),
    )

    order_type = Column(String(10), nullable=False, default="produto")
    status = Column(
        SAEnum(
            QuotationStatus,
            name="quotation_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=QuotationStatus.EM_ANDAMENTO,
    )
    service_description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    cancellation_note = Column(Text, nullable=True)
    winning_proposal_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "quotation_proposals.id",
            ondelete="SET NULL",
            name="fk_q_winning_proposal",
            use_alter=True,
        ),
        nullable=True,
    )
    purchase_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "purchase_orders.id",
            ondelete="SET NULL",
            name="fk_q_purchase_order",
        ),
        nullable=True,
    )

    items = relationship(
        "QuotationItem",
        back_populates="quotation",
        cascade="all, delete-orphan",
    )
    proposals = relationship(
        "QuotationProposal",
        back_populates="quotation",
        cascade="all, delete-orphan",
        foreign_keys="QuotationProposal.quotation_id",
    )
    winning_proposal = relationship(
        "QuotationProposal",
        foreign_keys=[winning_proposal_id],
        uselist=False,
        viewonly=True,
    )
    purchase_order = relationship("PurchaseOrder", foreign_keys=[purchase_order_id])


class QuotationItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "quotation_items"
    __table_args__ = (
        Index("idx_qi_quotation_id", "quotation_id"),
        Index("idx_qi_stock_item_id", "stock_item_id"),
    )

    quotation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quotations.id", ondelete="CASCADE"),
        nullable=False,
    )
    stock_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("stock_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = Column(Numeric(12, 3), nullable=False)

    quotation = relationship("Quotation", back_populates="items")
    stock_item = relationship("StockItem")


class QuotationProposal(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "quotation_proposals"
    __table_args__ = (
        UniqueConstraint(
            "quotation_id", "supplier_id", name="uq_qp_quotation_supplier"
        ),
        Index("idx_qp_quotation_id", "quotation_id"),
        Index("idx_qp_supplier_id", "supplier_id"),
    )

    quotation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quotations.id", ondelete="CASCADE"),
        nullable=False,
    )
    supplier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
    )
    total_price = Column(Numeric(12, 2), nullable=True)
    notes = Column(Text, nullable=True)

    quotation = relationship(
        "Quotation",
        back_populates="proposals",
        foreign_keys=[quotation_id],
    )
    supplier = relationship("Supplier")
    proposal_items = relationship(
        "QuotationProposalItem",
        back_populates="proposal",
        cascade="all, delete-orphan",
    )


class QuotationProposalItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "quotation_proposal_items"
    __table_args__ = (
        UniqueConstraint(
            "proposal_id", "quotation_item_id", name="uq_qpi_proposal_item"
        ),
        Index("idx_qpi_proposal_id", "proposal_id"),
        Index("idx_qpi_quotation_item_id", "quotation_item_id"),
    )

    proposal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quotation_proposals.id", ondelete="CASCADE"),
        nullable=False,
    )
    quotation_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quotation_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    unit_price = Column(Numeric(12, 2), nullable=False)

    proposal = relationship("QuotationProposal", back_populates="proposal_items")
    quotation_item = relationship("QuotationItem")
