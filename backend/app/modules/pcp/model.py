from sqlalchemy import Column, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import (
    LaborType,
    PlotActivityType,
    ProductionOrderStatus,
    sa_enum_values,
)


class Plot(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "plots"

    name = Column(String(255), nullable=False, index=True)
    location = Column(String(255), nullable=True)
    variety = Column(String(100), nullable=False)
    capacity_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    notes = Column(Text, nullable=True)

    production_orders = relationship("ProductionOrder", back_populates="plot")
    activities = relationship("PlotActivity", back_populates="plot")


class ProductionOrder(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "production_orders"

    plot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("plots.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    planned_date = Column(Date, nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)
    total_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    especial_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    superior_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    tradicional_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    total_cost = Column(Numeric(12, 2), nullable=False, default=0)
    status = Column(
        SAEnum(
            ProductionOrderStatus,
            name="production_order_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=ProductionOrderStatus.PLANEJADA,
        index=True,
    )
    notes = Column(Text, nullable=True)

    plot = relationship("Plot", back_populates="production_orders")
    inputs = relationship(
        "ProductionInput",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )


class ProductionInput(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "production_inputs"

    production_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("production_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stock_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("stock_items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False, default=0)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)

    production_order = relationship("ProductionOrder", back_populates="inputs")


class PlotActivity(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "plot_activities"

    plot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("plots.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    activity_type = Column(
        SAEnum(
            PlotActivityType,
            name="plot_activity_type",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        index=True,
    )
    activity_date = Column(Date, nullable=False, index=True)
    labor_type = Column(
        SAEnum(LaborType, name="labor_type", values_callable=sa_enum_values),
        nullable=False,
        default=LaborType.INTERNA,
    )
    cost = Column(Numeric(12, 2), nullable=False, default=0)
    details = Column(Text, nullable=True)

    plot = relationship("Plot", back_populates="activities")
