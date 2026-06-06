from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import (
    ContractType,
    LaborType,
    PlotActivityType,
    ProductionOrderStatus,
    SystemRole,
    sa_enum_values,
)


class Plot(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "plots"

    name = Column(String(255), nullable=False, index=True)
    location = Column(String(255), nullable=True)
    variety = Column(String(100), nullable=False)
    capacity_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    # Área total do talhão em hectares. Base do controle de área das OPs: a soma
    # de `hectares_used` das OPs ativas de um talhão não pode exceder este valor.
    total_hectares = Column(Numeric(10, 2), nullable=False, default=0)
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
    # Fração de área do talhão alocada a esta OP (validada contra plot.total_hectares).
    hectares_used = Column(Numeric(10, 2), nullable=False, default=0)
    total_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    # Sacas colhidas acumuladas por destino (substitui especial/superior/tradicional).
    # Cada destino corresponde a um item-destino configurado (Configurações).
    industria_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    embalagem_sacas = Column(Numeric(12, 3), nullable=False, default=0)
    descarte_sacas = Column(Numeric(12, 3), nullable=False, default=0)
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
    order_number = Column(String(20), unique=True, nullable=True, index=True)
    start_date = Column(Date, nullable=True)
    expected_end_date = Column(Date, nullable=True)
    estimated_cost = Column(Numeric(12, 2), nullable=False, default=0)
    realized_cost = Column(Numeric(12, 2), nullable=False, default=0)
    harvest_progress = Column(Numeric(5, 2), nullable=False, default=0)
    # Motivo do encerramento antecipado (praga): preenchido quando a OP é
    # concluída antes de 100% via endpoint de encerramento. NULL = encerramento normal.
    early_closed_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    plot = relationship("Plot", back_populates="production_orders")
    inputs = relationship(
        "ProductionInput",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )
    harvests = relationship(
        "ProductionHarvest",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )
    position_requirements = relationship(
        "ProductionOrderPositionRequirement",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )
    resources = relationship(
        "ProductionOrderResource",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )
    services = relationship(
        "ProductionOrderService",
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


class ProductionOrderPositionRequirement(UUIDMixin, TimestampMixin, Base):
    """Requisito de mão de obra por CARGO de uma OP (substitui a alocação nominal
    de funcionários do antigo `production_order_workers`).

    Em vez de nomear funcionários, a OP declara de quantas pessoas de cada cargo
    precisa e com qual vínculo (ex.: ``MOTORISTA × 2 (clt)``). O custo de pessoal
    é estimado a partir do `base_salary` do cargo (regra de negócio no Backend).
    """

    __tablename__ = "production_order_position_requirements"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_popr_quantity_positive"),
    )

    production_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "production_orders.id", name="fk_popr_order", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    position_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "job_positions.id", name="fk_popr_position", ondelete="RESTRICT"
        ),
        nullable=False,
        index=True,
    )
    quantity = Column(Integer, nullable=False)
    contract_type = Column(
        SAEnum(ContractType, name="contract_type", values_callable=sa_enum_values),
        nullable=False,
    )

    production_order = relationship(
        "ProductionOrder", back_populates="position_requirements"
    )
    position = relationship("JobPosition", foreign_keys=[position_id])


class ProductionOrderResource(UUIDMixin, TimestampMixin, Base):
    """Recurso de estoque alocado a uma OP, com papel de sistema (`system_role`):
    ``maquina``/``veiculo`` (reservados, não baixam estoque, geram custo por hora)
    ou ``embalagem`` (consumida, baixa do estoque proporcional à colheita).

    Máquinas/veículos acumulam horas de uso de forma incremental em
    `accumulated_hours` (custo = horas × stock_item.hourly_cost). A reserva
    exclusiva ("item em OP ativa") é validada na service — não há constraint no
    banco; o índice em `stock_item_id` apenas acelera essa checagem.
    """

    __tablename__ = "production_order_resources"

    production_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "production_orders.id", name="fk_por_order", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    stock_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "stock_items.id", name="fk_por_stock_item", ondelete="RESTRICT"
        ),
        nullable=False,
        index=True,
    )
    resource_role = Column(
        SAEnum(SystemRole, name="system_role", values_callable=sa_enum_values),
        nullable=False,
    )
    quantity = Column(Numeric(12, 3), nullable=True)
    accumulated_hours = Column(Numeric(10, 2), nullable=False, default=0)

    production_order = relationship("ProductionOrder", back_populates="resources")
    stock_item = relationship("StockItem", foreign_keys=[stock_item_id])


class ProductionOrderService(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "production_order_services"
    __table_args__ = (
        ForeignKeyConstraint(
            ["production_order_id"],
            ["production_orders.id"],
            name="fk_pos_order",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name="fk_pos_supplier",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["accounts_payable_id"],
            ["accounts_payable.id"],
            name="fk_pos_ap",
            ondelete="SET NULL",
        ),
        Index("idx_pos_production_order", "production_order_id"),
        Index("idx_pos_supplier", "supplier_id"),
    )

    production_order_id = Column(UUID(as_uuid=True), nullable=False)
    supplier_id = Column(UUID(as_uuid=True), nullable=False)
    description = Column(String(500), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    due_date = Column(Date, nullable=False)
    accounts_payable_id = Column(UUID(as_uuid=True), nullable=True)

    production_order = relationship("ProductionOrder", back_populates="services")


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
    hours_spent = Column(Numeric(6, 2), nullable=True)
    employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    quantity_applied = Column(Numeric(10, 3), nullable=True)
    quantity_unit = Column(String(20), nullable=True)
    result = Column(String(20), nullable=True)

    plot = relationship("Plot", back_populates="activities")
    employee = relationship("Employee", foreign_keys=[employee_id])


class ProductionHarvest(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "production_harvests"

    production_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("production_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    harvest_number = Column(Integer, nullable=False)
    percentage_harvested = Column(Numeric(5, 2), nullable=False)
    # Área colhida nesta rodada = production_order.hectares_used × pct/100.
    hectares_harvested = Column(Numeric(10, 2), nullable=True)
    sacks_total = Column(Numeric(8, 2), nullable=False, default=0)
    # Sacas desta colheita por destino (substitui especial/superior/tradicional).
    sacks_industria = Column(Numeric(8, 2), nullable=False, default=0)
    sacks_embalagem = Column(Numeric(8, 2), nullable=False, default=0)
    sacks_descarte = Column(Numeric(8, 2), nullable=False, default=0)
    inputs_consumed = Column(JSON, nullable=True)
    is_final = Column(Boolean, nullable=False, default=False)
    harvested_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    production_order = relationship("ProductionOrder", back_populates="harvests")
