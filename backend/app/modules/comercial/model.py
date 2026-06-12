from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import PaymentMethod, SaleStatus, sa_enum_values


class Client(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "clients"

    name = Column(String(255), nullable=False, index=True)
    document = Column(String(32), nullable=True, index=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(32), nullable=True)
    # Endereço legado (texto livre). Mantido por compatibilidade; os campos
    # estruturados abaixo são a fonte da verdade do endereço a partir da Demanda 7.
    address = Column(String(500), nullable=True)
    # Endereço estruturado (Demanda 7, espelha o fornecedor da D6). Todos NULL em
    # linhas pré-existentes — não há backfill por parsing do `address` (texto
    # livre, parsing não confiável); quem popula de verdade é o seed/cadastro.
    cep = Column(String(9), nullable=True)
    street = Column(String(255), nullable=True)
    number = Column(String(20), nullable=True)
    complement = Column(String(120), nullable=True)
    neighborhood = Column(String(120), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(2), nullable=True)
    is_delinquent = Column(Boolean, nullable=False, default=False, index=True)
    notes = Column(Text, nullable=True)

    sales = relationship("Sale", back_populates="client")

    def __repr__(self) -> str:
        return f"<Client {self.name}>"


class Sale(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "sales"
    __table_args__ = (
        # Ordenação default da lista de Vendas (sold_at desc). Ver migration
        # 0011_add_sort_indexes.
        Index("idx_sales_sold_at", "sold_at"),
    )

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
    # Desconto de cabeçalho (Demanda 9.C): percentual informado na venda e o valor
    # em R$ resultante. total_amount já é o LÍQUIDO (subtotal − discount_amount); o
    # preço unitário dos itens permanece intacto (desconto sobre o total, não por item).
    discount_percent = Column(Numeric(5, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0)
    shipping_cost = Column(Numeric(12, 2), nullable=True, default=0)
    sold_at = Column(DateTime(timezone=True), nullable=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    installments = Column(Integer, nullable=False, default=1)
    first_due_date = Column(Date, nullable=True)
    installment_interval_days = Column(Integer, nullable=False, default=30)
    payment_method = Column(
        SAEnum(PaymentMethod, name="payment_method", values_callable=sa_enum_values),
        nullable=True,
        default=PaymentMethod.A_VISTA,
    )

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
