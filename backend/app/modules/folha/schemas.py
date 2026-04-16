from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import ContractType, PayrollEntryStatus, PayrollPeriodStatus


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    cpf: str = Field(min_length=1, max_length=32)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    role: str = Field(min_length=1, max_length=100)
    base_salary: Decimal = Field(ge=0)
    contract_type: ContractType
    admission_date: date
    termination_cost_override: Optional[Decimal] = Field(default=None, ge=0)


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=32)
    role: Optional[str] = Field(default=None, min_length=1, max_length=100)
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
    role: str
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
        return cls(
            id=employee.id,
            name=employee.name,
            cpf=employee.document,
            email=employee.email,
            phone=employee.phone,
            role=employee.role,
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
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, entry, employee_name: str, contract_type: ContractType) -> "PayrollEntryOut":
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
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )


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
