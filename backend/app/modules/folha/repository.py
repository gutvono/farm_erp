from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.folha.model import Employee, PayrollEntry, PayrollPeriod
from app.shared.enums import ContractType, PayrollEntryStatus, PayrollPeriodStatus


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------


def create_employee(
    db: Session,
    *,
    name: str,
    cpf: str,
    email: Optional[str],
    phone: Optional[str],
    role: str,
    base_salary: Decimal,
    contract_type: ContractType,
    admission_date: date,
    photo_path: Optional[str] = None,
    termination_cost_override: Optional[Decimal] = None,
) -> Employee:
    employee = Employee(
        name=name,
        document=cpf,
        email=email,
        phone=phone,
        role=role,
        base_salary=base_salary,
        contract_type=contract_type,
        hire_date=admission_date,
        photo_path=photo_path,
        termination_cost_override=termination_cost_override,
        is_active=True,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def list_employees(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = None,
    contract_type: Optional[ContractType] = None,
) -> list[Employee]:
    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if is_active is not None:
        query = query.filter(Employee.is_active == is_active)
    if contract_type is not None:
        query = query.filter(Employee.contract_type == contract_type)
    return (
        query.order_by(Employee.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_employee(db: Session, employee_id: UUID) -> Optional[Employee]:
    return (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.deleted_at.is_(None))
        .first()
    )


def get_employee_by_cpf(db: Session, cpf: str) -> Optional[Employee]:
    return (
        db.query(Employee)
        .filter(Employee.document == cpf, Employee.deleted_at.is_(None))
        .first()
    )


def update_employee(
    db: Session, employee_id: UUID, fields: dict
) -> Optional[Employee]:
    employee = get_employee(db, employee_id)
    if not employee:
        return None
    for key, value in fields.items():
        setattr(employee, key, value)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def deactivate_employee(db: Session, employee_id: UUID) -> Optional[Employee]:
    employee = get_employee(db, employee_id)
    if not employee:
        return None
    now = datetime.now(timezone.utc)
    employee.is_active = False
    employee.termination_date = now.date()
    employee.deleted_at = now
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def list_active_employees(db: Session) -> list[Employee]:
    return (
        db.query(Employee)
        .filter(
            Employee.deleted_at.is_(None),
            Employee.is_active.is_(True),
        )
        .order_by(Employee.name.asc())
        .all()
    )


# ---------------------------------------------------------------------------
# Payroll Periods
# ---------------------------------------------------------------------------


def create_period(
    db: Session, *, reference_month: int, reference_year: int
) -> PayrollPeriod:
    period = PayrollPeriod(
        competency_month=reference_month,
        competency_year=reference_year,
        status=PayrollPeriodStatus.ABERTA,
        total_amount=Decimal("0"),
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    _ = period.entries
    return period


def list_periods(
    db: Session, *, skip: int = 0, limit: int = 100
) -> list[PayrollPeriod]:
    periods = (
        db.query(PayrollPeriod)
        .filter(PayrollPeriod.deleted_at.is_(None))
        .order_by(
            PayrollPeriod.competency_year.desc(),
            PayrollPeriod.competency_month.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    for p in periods:
        _ = p.entries
    return periods


def get_period(db: Session, period_id: UUID) -> Optional[PayrollPeriod]:
    period = (
        db.query(PayrollPeriod)
        .filter(
            PayrollPeriod.id == period_id,
            PayrollPeriod.deleted_at.is_(None),
        )
        .first()
    )
    if period:
        _ = period.entries
    return period


def get_period_by_month_year(
    db: Session, month: int, year: int
) -> Optional[PayrollPeriod]:
    period = (
        db.query(PayrollPeriod)
        .filter(
            PayrollPeriod.competency_month == month,
            PayrollPeriod.competency_year == year,
            PayrollPeriod.deleted_at.is_(None),
        )
        .first()
    )
    if period:
        _ = period.entries
    return period


def close_period(db: Session, period_id: UUID) -> Optional[PayrollPeriod]:
    period = get_period(db, period_id)
    if not period:
        return None
    total = Decimal("0")
    for entry in period.entries:
        total += Decimal(entry.net_amount)
    period.status = PayrollPeriodStatus.FECHADA
    period.closed_at = datetime.now(timezone.utc)
    period.total_amount = total
    db.add(period)
    db.commit()
    db.refresh(period)
    _ = period.entries
    return period


# ---------------------------------------------------------------------------
# Payroll Entries
# ---------------------------------------------------------------------------


def list_entries_by_period(
    db: Session, period_id: UUID
) -> list[PayrollEntry]:
    return (
        db.query(PayrollEntry)
        .filter(PayrollEntry.payroll_period_id == period_id)
        .order_by(PayrollEntry.created_at.asc())
        .all()
    )


def get_entry(db: Session, entry_id: UUID) -> Optional[PayrollEntry]:
    return (
        db.query(PayrollEntry)
        .filter(PayrollEntry.id == entry_id)
        .first()
    )


def get_entry_by_period_employee(
    db: Session, period_id: UUID, employee_id: UUID
) -> Optional[PayrollEntry]:
    return (
        db.query(PayrollEntry)
        .filter(
            PayrollEntry.payroll_period_id == period_id,
            PayrollEntry.employee_id == employee_id,
        )
        .first()
    )


def create_entry(
    db: Session,
    *,
    period_id: UUID,
    employee_id: UUID,
    base_salary: Decimal,
) -> PayrollEntry:
    entry = PayrollEntry(
        payroll_period_id=period_id,
        employee_id=employee_id,
        base_salary=base_salary,
        extras_hours=Decimal("0"),
        extras_value=Decimal("0"),
        absences_quantity=Decimal("0"),
        absences_value=Decimal("0"),
        deductions_value=Decimal("0"),
        net_amount=base_salary,
        status=PayrollEntryStatus.PENDENTE,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_entry(
    db: Session,
    entry_id: UUID,
    *,
    overtime_amount: Decimal,
    deductions: Decimal,
) -> Optional[PayrollEntry]:
    entry = get_entry(db, entry_id)
    if not entry:
        return None
    entry.extras_value = overtime_amount
    entry.deductions_value = deductions
    entry.net_amount = (
        Decimal(entry.base_salary) + Decimal(overtime_amount) - Decimal(deductions)
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def mark_entry_paid(db: Session, entry_id: UUID) -> Optional[PayrollEntry]:
    entry = get_entry(db, entry_id)
    if not entry:
        return None
    entry.status = PayrollEntryStatus.PAGO
    entry.paid_at = datetime.now(timezone.utc)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_pending_entries_by_period(
    db: Session, period_id: UUID
) -> list[PayrollEntry]:
    return (
        db.query(PayrollEntry)
        .filter(
            PayrollEntry.payroll_period_id == period_id,
            PayrollEntry.status == PayrollEntryStatus.PENDENTE,
        )
        .order_by(PayrollEntry.created_at.asc())
        .all()
    )
