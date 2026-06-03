from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.schema import UniqueConstraint

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import (
    ContractType,
    PayrollCalculationType,
    PayrollEntryStatus,
    PayrollEventType,
    PayrollItemSource,
    PayrollPeriodStatus,
    sa_enum_values,
)


class JobPosition(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Cargo cadastrável da folha (entidade de negócio → soft delete).

    Substitui o antigo texto livre ``employees.role``. O ``base_salary`` é uma
    SUGESTÃO usada para prefillar o salário do funcionário na criação; o valor
    efetivo continua em ``employees.base_salary`` (pode divergir).
    """

    __tablename__ = "job_positions"

    # unique=True + index=True → único índice unique ``ix_job_positions_name``
    # (mesmo padrão de payroll_events.description; espelha a migration 0013).
    name = Column(String(120), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    base_salary = Column(Numeric(12, 2), nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"<JobPosition {self.name}>"


class Employee(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "employees"

    name = Column(String(255), nullable=False, index=True)
    document = Column(String(32), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(32), nullable=True)
    # Cargo é FK (`position_id`). A antiga coluna texto `role` foi removida
    # fisicamente na migration 0014_drop_employee_role (Demanda 2).
    position_id = Column(
        UUID(as_uuid=True),
        ForeignKey("job_positions.id", name="fk_employees_position"),
        nullable=False,
        index=True,
    )
    contract_type = Column(
        SAEnum(
            ContractType,
            name="contract_type",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        index=True,
    )
    base_salary = Column(Numeric(12, 2), nullable=False, default=0)
    hire_date = Column(Date, nullable=False)
    termination_date = Column(Date, nullable=True)
    termination_cost_override = Column(Numeric(12, 2), nullable=True)
    photo_path = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    payroll_entries = relationship("PayrollEntry", back_populates="employee")
    position = relationship("JobPosition")

    def __repr__(self) -> str:
        return f"<Employee {self.name}>"


class PayrollPeriod(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "payroll_periods"
    __table_args__ = (
        UniqueConstraint(
            "competency_year",
            "competency_month",
            name="uq_payroll_period_competency",
        ),
    )

    competency_year = Column(Integer, nullable=False, index=True)
    competency_month = Column(Integer, nullable=False, index=True)
    status = Column(
        SAEnum(
            PayrollPeriodStatus,
            name="payroll_period_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=PayrollPeriodStatus.ABERTA,
        index=True,
    )
    closed_at = Column(DateTime(timezone=True), nullable=True)
    total_amount = Column(Numeric(12, 2), nullable=False, server_default="0", default=0)

    entries = relationship(
        "PayrollEntry",
        back_populates="period",
        cascade="all, delete-orphan",
    )


class PayrollEvent(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "payroll_events"

    description = Column(String(255), nullable=False, unique=True, index=True)
    event_type = Column(
        SAEnum(
            PayrollEventType,
            name="payroll_event_type",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        index=True,
    )
    calculation_type = Column(
        SAEnum(
            PayrollCalculationType,
            name="payroll_calculation_type",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=PayrollCalculationType.MANUAL,
        index=True,
    )
    is_automatic = Column(Boolean, nullable=False, default=False)
    affects_net = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    items = relationship("PayrollEntryItem", back_populates="event")


class PayrollEntry(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "payroll_entries"
    __table_args__ = (
        UniqueConstraint(
            "payroll_period_id",
            "employee_id",
            name="uq_payroll_entry_period_employee",
        ),
    )

    payroll_period_id = Column(
        UUID(as_uuid=True),
        ForeignKey("payroll_periods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    base_salary = Column(Numeric(12, 2), nullable=False, default=0)
    extras_hours = Column(Numeric(8, 2), nullable=False, default=0)
    extras_value = Column(Numeric(12, 2), nullable=False, default=0)
    absences_quantity = Column(Numeric(8, 2), nullable=False, default=0)
    absences_value = Column(Numeric(12, 2), nullable=False, default=0)
    deductions_value = Column(Numeric(12, 2), nullable=False, default=0)
    net_amount = Column(Numeric(12, 2), nullable=False, default=0)
    status = Column(
        SAEnum(
            PayrollEntryStatus,
            name="payroll_entry_status",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=PayrollEntryStatus.PENDENTE,
        index=True,
    )
    paid_at = Column(DateTime(timezone=True), nullable=True)

    period = relationship("PayrollPeriod", back_populates="entries")
    employee = relationship("Employee", back_populates="payroll_entries")
    items = relationship(
        "PayrollEntryItem",
        back_populates="entry",
        cascade="all, delete-orphan",
    )


class PayrollEntryItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "payroll_entry_items"
    __table_args__ = (
        UniqueConstraint(
            "payroll_entry_id",
            "payroll_event_id",
            name="uq_payroll_entry_item_entry_event",
        ),
        CheckConstraint("amount >= 0", name="ck_payroll_entry_items_amount_non_negative"),
    )

    payroll_entry_id = Column(
        UUID(as_uuid=True),
        ForeignKey("payroll_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payroll_event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("payroll_events.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount = Column(Numeric(12, 2), nullable=False, default=0)
    calculation_base = Column(Numeric(12, 2), nullable=True)
    quantity = Column(Numeric(12, 4), nullable=True)
    percentage = Column(Numeric(7, 2), nullable=True)
    item_metadata = Column("metadata", JSONB, nullable=False, default=dict)
    source = Column(
        SAEnum(
            PayrollItemSource,
            name="payroll_item_source",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=PayrollItemSource.MANUAL,
        index=True,
    )

    entry = relationship("PayrollEntry", back_populates="items")
    event = relationship("PayrollEvent", back_populates="items")
