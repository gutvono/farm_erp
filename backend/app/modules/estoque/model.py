from sqlalchemy import Column, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import (
    MovementType,
    StockCategory,
    StockUnit,
    sa_enum_values,
)


class StockItem(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "stock_items"

    sku = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    # Categoria agora é FK (`category_id` → stock_categories). Um item tem UMA
    # categoria (decisão D2). FK NOT NULL após o backfill da migration 0015.
    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("stock_categories.id", name="fk_stock_items_category"),
        nullable=False,
        index=True,
    )
    # DEPRECATED: categoria como enum livre. Rebaixada a NULLABLE na migration
    # 0015; o DROP físico da coluna + do tipo `stock_category` fica para o passo
    # Backend (após o código parar de lê-la). Não usar em código novo.
    category = Column(
        SAEnum(
            StockCategory,
            name="stock_category",
            values_callable=sa_enum_values,
        ),
        nullable=True,
        index=True,
    )
    unit = Column(
        SAEnum(StockUnit, name="stock_unit", values_callable=sa_enum_values),
        nullable=False,
        default=StockUnit.UNIDADE,
    )
    minimum_stock = Column(Numeric(12, 3), nullable=False, default=0)
    unit_cost = Column(Numeric(12, 2), nullable=False, default=0)
    quantity_on_hand = Column(Numeric(12, 3), nullable=False, default=0)
    hourly_cost = Column(Numeric(10, 2), nullable=True)
    description = Column(Text, nullable=True)

    movements = relationship("StockMovement", back_populates="stock_item")

    def __repr__(self) -> str:
        return f"<StockItem {self.sku} {self.name}>"


class StockMovement(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        # Ordenação default da aba Movimentações (occurred_at desc). Ver migration
        # 0011_add_sort_indexes.
        Index("idx_stock_movements_occurred_at", "occurred_at"),
    )

    stock_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("stock_items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_type = Column(
        SAEnum(
            MovementType,
            name="stock_movement_type",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        index=True,
    )
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False, default=0)
    total_value = Column(Numeric(12, 2), nullable=False, default=0)
    description = Column(String(500), nullable=True)
    source_module = Column(String(50), nullable=True, index=True)
    reference_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False)

    stock_item = relationship("StockItem", back_populates="movements")
