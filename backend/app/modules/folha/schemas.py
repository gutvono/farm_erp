from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import (
    ContractType,
    PayrollCalculationType,
    PayrollEntryStatus,
    PayrollEventType,
    PayrollItemSource,
    PayrollPeriodStatus,
)


# ---------------------------------------------------------------------------
# Cargos (Job Positions)
# ---------------------------------------------------------------------------


class JobPositionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None)
    base_salary: Decimal = Field(default=Decimal("0"), ge=0)
    is_active: bool = Field(default=True)


class JobPositionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None)
    base_salary: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class JobPositionOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    base_salary: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, position) -> "JobPositionOut":
        return cls(
            id=position.id,
            name=position.name,
            description=position.description,
            base_salary=position.base_salary,
            is_active=position.is_active,
            created_at=position.created_at,
            updated_at=position.updated_at,
        )


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    cpf: str = Field(min_length=1, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    position_id: UUID
    # Opcional: quando ausente, o Service usa o base_salary do cargo escolhido.
    base_salary: Optional[Decimal] = Field(default=None, ge=0)
    contract_type: ContractType
    admission_date: date
    termination_cost_override: Optional[Decimal] = Field(default=None, ge=0)


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    position_id: Optional[UUID] = None
    base_salary: Optional[Decimal] = Field(default=None, ge=0)
    contract_type: Optional[ContractType] = None
    admission_date: Optional[date] = None
    termination_cost_override: Optional[Decimal] = Field(default=None, ge=0)


class EmployeeOut(BaseModel):
    id: UUID
    name: str
    cpf: str
    email: Optional[str] = None
    phone: Optional[str] = None
    position_id: UUID
    position_name: str
    base_salary: Decimal
    contract_type: ContractType
    admission_date: date
    termination_date: Optional[date] = None
    termination_cost_override: Optional[Decimal] = None
    photo_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, employee, photo_url: Optional[str] = None) -> "EmployeeOut":
        position = employee.position
        return cls(
            id=employee.id,
            name=employee.name,
            cpf=employee.document,
            email=employee.email,
            phone=employee.phone,
            position_id=employee.position_id,
            position_name=position.name if position else "",
            base_salary=employee.base_salary,
            contract_type=employee.contract_type,
            admission_date=employee.hire_date,
            termination_date=employee.termination_date,
            termination_cost_override=employee.termination_cost_override,
            photo_url=photo_url,
            is_active=employee.is_active,
            created_at=employee.created_at,
            updated_at=employee.updated_at,
        )


class EmployeeTerminate(BaseModel):
    motivo: Optional[str] = Field(default=None, max_length=500)


# ---------------------------------------------------------------------------
# Payroll Entries
# ---------------------------------------------------------------------------


class PayrollEntryUpdate(BaseModel):
    overtime_amount: Decimal = Field(default=Decimal("0"), ge=0)
    deductions: Decimal = Field(default=Decimal("0"), ge=0)


class PayrollEventOut(BaseModel):
    id: UUID
    description: str
    event_type: PayrollEventType
    calculation_type: PayrollCalculationType
    is_automatic: bool
    affects_net: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, event) -> "PayrollEventOut":
        return cls(
            id=event.id,
            description=event.description,
            event_type=event.event_type,
            calculation_type=event.calculation_type,
            is_automatic=event.is_automatic,
            affects_net=event.affects_net,
            is_active=event.is_active,
            created_at=event.created_at,
            updated_at=event.updated_at,
        )


class PayrollEntryItemOut(BaseModel):
    id: UUID
    payroll_entry_id: UUID
    payroll_event_id: UUID
    event_description: str
    event_type: PayrollEventType
    calculation_type: PayrollCalculationType
    amount: Decimal
    calculation_base: Optional[Decimal] = None
    quantity: Optional[Decimal] = None
    percentage: Optional[Decimal] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    source: PayrollItemSource
    affects_net: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, item) -> "PayrollEntryItemOut":
        event = item.event
        return cls(
            id=item.id,
            payroll_entry_id=item.payroll_entry_id,
            payroll_event_id=item.payroll_event_id,
            event_description=event.description if event else "",
            event_type=event.event_type if event else PayrollEventType.INFORMATIVO,
            calculation_type=(
                event.calculation_type if event else PayrollCalculationType.MANUAL
            ),
            amount=item.amount,
            calculation_base=item.calculation_base,
            quantity=item.quantity,
            percentage=item.percentage,
            metadata=item.item_metadata or {},
            source=item.source,
            affects_net=event.affects_net if event else False,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )


class PayrollManualItemUpsert(BaseModel):
    event_id: UUID
    amount: Decimal = Field(ge=0)
    calculation_base: Optional[Decimal] = Field(default=None, ge=0)
    quantity: Optional[Decimal] = Field(default=None, ge=0)
    percentage: Optional[Decimal] = Field(default=None, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PayrollAutoCalculationRequest(BaseModel):
    calculation_type: PayrollCalculationType
    event_id: Optional[UUID] = None
    base_amount: Optional[Decimal] = Field(default=None, ge=0)
    quantity: Optional[Decimal] = Field(default=None, ge=0)
    percentage: Optional[Decimal] = Field(default=None, ge=0)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    rule: Optional[str] = Field(default=None, pattern="^(urbana|rural)$")
    real_transport_cost: Optional[Decimal] = Field(default=None, ge=0)


class PayrollCalculationPreview(BaseModel):
    event_id: UUID
    event_description: str
    event_type: PayrollEventType
    calculation_type: PayrollCalculationType
    amount: Decimal
    calculation_base: Decimal
    quantity: Optional[Decimal] = None
    percentage: Optional[Decimal] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    affects_net: bool

    model_config = ConfigDict(use_enum_values=True)


class PayrollEntryOut(BaseModel):
    id: UUID
    payroll_period_id: UUID
    employee_id: UUID
    employee_name: str
    contract_type: ContractType
    base_salary: Decimal
    overtime_amount: Decimal
    deductions: Decimal
    total_amount: Decimal
    status: PayrollEntryStatus
    paid_at: Optional[datetime] = None
    gross_amount: Decimal = Decimal("0")
    total_earnings: Decimal = Decimal("0")
    total_deductions: Decimal = Decimal("0")
    total_informative: Decimal = Decimal("0")
    items: list[PayrollEntryItemOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(
        cls,
        entry,
        employee_name: str,
        contract_type: ContractType,
        items: Optional[list[PayrollEntryItemOut]] = None,
    ) -> "PayrollEntryOut":
        item_list = items or []
        if item_list:
            def enum_value(value):
                return value.value if hasattr(value, "value") else value

            total_earnings = sum(
                (
                    item.amount
                    for item in item_list
                    if enum_value(item.event_type) == PayrollEventType.PROVENTO.value
                    and item.affects_net
                ),
                Decimal("0"),
            )
            total_deductions = sum(
                (
                    item.amount
                    for item in item_list
                    if enum_value(item.event_type) == PayrollEventType.DESCONTO.value
                    and item.affects_net
                ),
                Decimal("0"),
            )
            total_informative = sum(
                (
                    item.amount
                    for item in item_list
                    if enum_value(item.event_type) == PayrollEventType.INFORMATIVO.value
                    or not item.affects_net
                ),
                Decimal("0"),
            )
            gross_amount = total_earnings
        else:
            total_earnings = Decimal(entry.base_salary) + Decimal(entry.extras_value)
            total_deductions = Decimal(entry.deductions_value)
            total_informative = Decimal("0")
            gross_amount = total_earnings

        return cls(
            id=entry.id,
            payroll_period_id=entry.payroll_period_id,
            employee_id=entry.employee_id,
            employee_name=employee_name,
            contract_type=contract_type,
            base_salary=entry.base_salary,
            overtime_amount=entry.extras_value,
            deductions=entry.deductions_value,
            total_amount=entry.net_amount,
            status=entry.status,
            paid_at=entry.paid_at,
            gross_amount=gross_amount,
            total_earnings=total_earnings,
            total_deductions=total_deductions,
            total_informative=total_informative,
            items=item_list,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )


class PayrollEntryDetailedOut(PayrollEntryOut):
    pass


# ---------------------------------------------------------------------------
# Payroll Periods
# ---------------------------------------------------------------------------


class PayrollPeriodCreate(BaseModel):
    reference_month: int = Field(ge=1, le=12)
    reference_year: int = Field(ge=2000, le=2100)


class PayrollPeriodOut(BaseModel):
    id: UUID
    reference_month: int
    reference_year: int
    status: PayrollPeriodStatus
    closed_at: Optional[datetime] = None
    total_amount: Decimal
    entries: list[PayrollEntryOut]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, period, entries: list[PayrollEntryOut]) -> "PayrollPeriodOut":
        return cls(
            id=period.id,
            reference_month=period.competency_month,
            reference_year=period.competency_year,
            status=period.status,
            closed_at=period.closed_at,
            total_amount=period.total_amount,
            entries=entries,
            created_at=period.created_at,
            updated_at=period.updated_at,
        )


# ---------------------------------------------------------------------------
# Batch Payment Result
# ---------------------------------------------------------------------------


class PayrollBatchResult(BaseModel):
    paid_count: int
    total_paid: Decimal
    insufficient_balance: bool
    failed_employees: list[str]
