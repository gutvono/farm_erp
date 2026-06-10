from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from app.modules.folha.model import (
    Employee,
    JobPosition,
    PayrollEntry,
    PayrollEntryItem,
    PayrollEvent,
    PayrollPaymentRequest,
    PayrollPaymentRequestEntry,
    PayrollPeriod,
)
from app.shared.enums import (
    ContractType,
    PayrollCalculationType,
    PayrollEntryStatus,
    PayrollEventType,
    PayrollItemSource,
    PayrollPeriodStatus,
)
from app.shared.pagination import PageParams, paginate_query


# Allowlist de ordenação para a listagem paginada de cargos (Demanda 2).
# order_by fora desta lista cai no default (name asc), nunca 500.
POSITION_ORDER_COLUMNS = {
    "name": JobPosition.name,
    "base_salary": JobPosition.base_salary,
}

# Allowlist de ordenação para a listagem paginada de funcionários (Demanda 8).
EMPLOYEE_ORDER_COLUMNS = {
    "name": Employee.name,
}


SALARY_BASE_EVENT_DESCRIPTION = "Salario base"
MANUAL_DEDUCTION_EVENT_DESCRIPTION = "Descontos manuais"
MEAL_VOUCHER_EVENT_DESCRIPTION = "Vale refeição"
PHARMACY_VOUCHER_EVENT_DESCRIPTION = "Vale farmácia"
LIFE_INSURANCE_EVENT_DESCRIPTION = "Seguro de vida"
IRRF_EVENT_DESCRIPTION = "IRRF"

DEFAULT_PAYROLL_EVENT_DEFINITIONS = (
    {
        "description": SALARY_BASE_EVENT_DESCRIPTION,
        "event_type": PayrollEventType.PROVENTO,
        "calculation_type": PayrollCalculationType.MANUAL,
        "is_automatic": False,
        "affects_net": True,
        "is_active": True,
    },
    {
        "description": "Hora extra",
        "event_type": PayrollEventType.PROVENTO,
        "calculation_type": PayrollCalculationType.OVERTIME,
        "is_automatic": True,
        "affects_net": True,
        "is_active": True,
    },
    {
        "description": "Adicional noturno",
        "event_type": PayrollEventType.PROVENTO,
        "calculation_type": PayrollCalculationType.NIGHT_SHIFT,
        "is_automatic": True,
        "affects_net": True,
        "is_active": True,
    },
    {
        "description": "INSS",
        "event_type": PayrollEventType.DESCONTO,
        "calculation_type": PayrollCalculationType.INSS,
        "is_automatic": True,
        "affects_net": True,
        "is_active": True,
    },
    {
        "description": "Vale transporte",
        "event_type": PayrollEventType.DESCONTO,
        "calculation_type": PayrollCalculationType.TRANSPORT_VOUCHER,
        "is_automatic": True,
        "affects_net": True,
        "is_active": True,
    },
    {
        "description": "FGTS",
        "event_type": PayrollEventType.INFORMATIVO,
        "calculation_type": PayrollCalculationType.FGTS,
        "is_automatic": True,
        "affects_net": False,
        "is_active": True,
    },
    {
        "description": MANUAL_DEDUCTION_EVENT_DESCRIPTION,
        "event_type": PayrollEventType.DESCONTO,
        "calculation_type": PayrollCalculationType.MANUAL,
        "is_automatic": False,
        "affects_net": True,
        "is_active": True,
    },
    {
        "description": MEAL_VOUCHER_EVENT_DESCRIPTION,
        "event_type": PayrollEventType.INFORMATIVO,
        "calculation_type": PayrollCalculationType.MANUAL,
        "is_automatic": False,
        "affects_net": False,
        "is_active": True,
    },
    {
        "description": PHARMACY_VOUCHER_EVENT_DESCRIPTION,
        "event_type": PayrollEventType.INFORMATIVO,
        "calculation_type": PayrollCalculationType.MANUAL,
        "is_automatic": False,
        "affects_net": False,
        "is_active": True,
    },
    {
        "description": LIFE_INSURANCE_EVENT_DESCRIPTION,
        "event_type": PayrollEventType.INFORMATIVO,
        "calculation_type": PayrollCalculationType.MANUAL,
        "is_automatic": False,
        "affects_net": False,
        "is_active": True,
    },
    {
        "description": IRRF_EVENT_DESCRIPTION,
        "event_type": PayrollEventType.DESCONTO,
        "calculation_type": PayrollCalculationType.IRRF,
        "is_automatic": True,
        "affects_net": True,
        "is_active": True,
    },
)


# ---------------------------------------------------------------------------
# Job Positions (Cargos)
# ---------------------------------------------------------------------------


def create_position(
    db: Session,
    *,
    name: str,
    description: Optional[str],
    base_salary: Decimal,
    is_active: bool,
) -> JobPosition:
    position = JobPosition(
        name=name,
        description=description,
        base_salary=base_salary,
        is_active=is_active,
    )
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


def get_position(db: Session, position_id: UUID) -> Optional[JobPosition]:
    return (
        db.query(JobPosition)
        .filter(JobPosition.id == position_id, JobPosition.deleted_at.is_(None))
        .first()
    )


def get_position_by_name(db: Session, name: str) -> Optional[JobPosition]:
    return (
        db.query(JobPosition)
        .filter(JobPosition.name == name, JobPosition.deleted_at.is_(None))
        .first()
    )


def list_positions_paginated(
    db: Session, *, params: PageParams
) -> tuple[list[JobPosition], int]:
    query = db.query(JobPosition).filter(JobPosition.deleted_at.is_(None))
    if params.search:
        query = query.filter(JobPosition.name.ilike(f"%{params.search}%"))
    return paginate_query(
        query,
        params,
        allowed_order_by=POSITION_ORDER_COLUMNS,
        default_order=JobPosition.name.asc(),
        tiebreaker=JobPosition.id,
    )


def update_position(
    db: Session, position_id: UUID, fields: dict
) -> Optional[JobPosition]:
    position = get_position(db, position_id)
    if not position:
        return None
    for key, value in fields.items():
        setattr(position, key, value)
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


def soft_delete_position(db: Session, position_id: UUID) -> Optional[JobPosition]:
    position = get_position(db, position_id)
    if not position:
        return None
    position.deleted_at = datetime.now(timezone.utc)
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


def count_active_employees_by_position(db: Session, position_id: UUID) -> int:
    return (
        db.query(Employee)
        .filter(
            Employee.position_id == position_id,
            Employee.deleted_at.is_(None),
        )
        .count()
    )


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
    position_id: UUID,
    base_salary: Decimal,
    contract_type: ContractType,
    admission_date: date,
    photo_path: Optional[str] = None,
    termination_cost_override: Optional[Decimal] = None,
    transport_voucher_cost: Optional[Decimal] = None,
    meal_voucher_value: Optional[Decimal] = None,
    pharmacy_voucher_value: Optional[Decimal] = None,
    life_insurance_value: Optional[Decimal] = None,
    dependents_count: int = 0,
) -> Employee:
    employee = Employee(
        name=name,
        document=cpf,
        email=email,
        phone=phone,
        position_id=position_id,
        base_salary=base_salary,
        contract_type=contract_type,
        hire_date=admission_date,
        photo_path=photo_path,
        termination_cost_override=termination_cost_override,
        transport_voucher_cost=transport_voucher_cost,
        meal_voucher_value=meal_voucher_value,
        pharmacy_voucher_value=pharmacy_voucher_value,
        life_insurance_value=life_insurance_value,
        dependents_count=dependents_count,
        is_active=True,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def list_employees(
    db: Session,
    *,
    params: PageParams,
    is_active: Optional[bool] = None,
    contract_type: Optional[ContractType] = None,
) -> tuple[list[Employee], int]:
    """Lista funcionários ativos (não soft-deleted), paginado. Filtros
    `is_active`/`contract_type`; `search` por nome OU documento; `order_by`
    allowlist: name (default, indexado)."""
    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if is_active is not None:
        query = query.filter(Employee.is_active == is_active)
    if contract_type is not None:
        query = query.filter(Employee.contract_type == contract_type)
    if params.search:
        like = f"%{params.search}%"
        query = query.filter(
            or_(Employee.name.ilike(like), Employee.document.ilike(like))
        )
    return paginate_query(
        query,
        params,
        allowed_order_by=EMPLOYEE_ORDER_COLUMNS,
        default_order=Employee.name.asc(),
        tiebreaker=Employee.id,
    )


def get_employee(db: Session, employee_id: UUID) -> Optional[Employee]:
    return (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.deleted_at.is_(None))
        .first()
    )


def get_employee_any(db: Session, employee_id: UUID) -> Optional[Employee]:
    return db.query(Employee).filter(Employee.id == employee_id).first()


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
# Payroll Events
# ---------------------------------------------------------------------------


def ensure_default_events(db: Session) -> None:
    changed = False
    for fields in DEFAULT_PAYROLL_EVENT_DEFINITIONS:
        event = (
            db.query(PayrollEvent)
            .filter(PayrollEvent.description == fields["description"])
            .first()
        )
        if event:
            continue
        db.add(PayrollEvent(**fields))
        changed = True
    if changed:
        db.commit()


def list_events(
    db: Session, *, include_inactive: bool = False
) -> list[PayrollEvent]:
    ensure_default_events(db)
    query = db.query(PayrollEvent).filter(PayrollEvent.deleted_at.is_(None))
    if not include_inactive:
        query = query.filter(PayrollEvent.is_active.is_(True))
    return query.order_by(PayrollEvent.description.asc()).all()


def get_event(db: Session, event_id: UUID) -> Optional[PayrollEvent]:
    ensure_default_events(db)
    return (
        db.query(PayrollEvent)
        .filter(PayrollEvent.id == event_id, PayrollEvent.deleted_at.is_(None))
        .first()
    )


def get_event_by_description(
    db: Session, description: str
) -> Optional[PayrollEvent]:
    ensure_default_events(db)
    return (
        db.query(PayrollEvent)
        .filter(
            PayrollEvent.description == description,
            PayrollEvent.deleted_at.is_(None),
        )
        .first()
    )


def get_event_by_calculation_type(
    db: Session,
    calculation_type: PayrollCalculationType,
) -> Optional[PayrollEvent]:
    ensure_default_events(db)
    return (
        db.query(PayrollEvent)
        .filter(
            PayrollEvent.calculation_type == calculation_type,
            PayrollEvent.deleted_at.is_(None),
            PayrollEvent.is_active.is_(True),
        )
        .order_by(PayrollEvent.description.asc())
        .first()
    )


def create_event(
    db: Session,
    *,
    description: str,
    event_type: PayrollEventType,
    calculation_type: PayrollCalculationType = PayrollCalculationType.MANUAL,
    is_automatic: bool = False,
    affects_net: bool = True,
    is_active: bool = True,
) -> PayrollEvent:
    event = PayrollEvent(
        description=description,
        event_type=event_type,
        calculation_type=calculation_type,
        is_automatic=is_automatic,
        affects_net=affects_net,
        is_active=is_active,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


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
    db: Session,
    *,
    skip: int = 0,
    limit: int = 100,
    max_year: Optional[int] = None,
    max_month: Optional[int] = None,
) -> list[PayrollPeriod]:
    query = db.query(PayrollPeriod).filter(PayrollPeriod.deleted_at.is_(None))
    if max_year is not None and max_month is not None:
        query = query.filter(
            (PayrollPeriod.competency_year < max_year)
            | (
                (PayrollPeriod.competency_year == max_year)
                & (PayrollPeriod.competency_month <= max_month)
            )
        )
    periods = (
        query.order_by(
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


def list_open_periods(db: Session) -> list[PayrollPeriod]:
    """Períodos de folha ainda abertos (status aberta, não excluídos)."""
    periods = (
        db.query(PayrollPeriod)
        .filter(
            PayrollPeriod.deleted_at.is_(None),
            PayrollPeriod.status == PayrollPeriodStatus.ABERTA,
        )
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


def list_entries_by_employee(
    db: Session,
    employee_id: UUID,
    *,
    year: Optional[int] = None,
) -> list[PayrollEntry]:
    query = (
        db.query(PayrollEntry)
        .join(PayrollPeriod)
        .options(
            joinedload(PayrollEntry.period),
            joinedload(PayrollEntry.items).joinedload(PayrollEntryItem.event),
        )
        .filter(
            PayrollEntry.employee_id == employee_id,
            PayrollPeriod.deleted_at.is_(None),
        )
    )
    if year is not None:
        query = query.filter(PayrollPeriod.competency_year == year)
    return (
        query.order_by(
            PayrollPeriod.competency_year.desc(),
            PayrollPeriod.competency_month.desc(),
        )
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
    ensure_entry_base_item(db, entry)
    return recalculate_entry_totals(db, entry.id) or entry


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


def set_entry_status(
    db: Session,
    entry_id: UUID,
    status: PayrollEntryStatus,
    *,
    paid_at: Optional[datetime] = None,
) -> Optional[PayrollEntry]:
    """Generic entry status transition (aguardando_aprovacao, pendente, pago)."""
    entry = get_entry(db, entry_id)
    if not entry:
        return None
    entry.status = status
    entry.paid_at = paid_at
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


# ---------------------------------------------------------------------------
# Payroll Entry Items
# ---------------------------------------------------------------------------


def list_items_by_entry(
    db: Session, entry_id: UUID
) -> list[PayrollEntryItem]:
    return (
        db.query(PayrollEntryItem)
        .options(joinedload(PayrollEntryItem.event))
        .join(PayrollEvent)
        .filter(PayrollEntryItem.payroll_entry_id == entry_id)
        .order_by(PayrollEntryItem.created_at.asc())
        .all()
    )


def list_items_by_period(
    db: Session, period_id: UUID
) -> list[PayrollEntryItem]:
    return (
        db.query(PayrollEntryItem)
        .options(joinedload(PayrollEntryItem.event))
        .join(PayrollEntry)
        .filter(PayrollEntry.payroll_period_id == period_id)
        .order_by(PayrollEntryItem.created_at.asc())
        .all()
    )


def get_entry_item(db: Session, item_id: UUID) -> Optional[PayrollEntryItem]:
    return (
        db.query(PayrollEntryItem)
        .options(joinedload(PayrollEntryItem.event))
        .filter(PayrollEntryItem.id == item_id)
        .first()
    )


def get_entry_item_by_event(
    db: Session,
    *,
    entry_id: UUID,
    event_id: UUID,
) -> Optional[PayrollEntryItem]:
    return (
        db.query(PayrollEntryItem)
        .options(joinedload(PayrollEntryItem.event))
        .filter(
            PayrollEntryItem.payroll_entry_id == entry_id,
            PayrollEntryItem.payroll_event_id == event_id,
        )
        .first()
    )


def upsert_entry_item(
    db: Session,
    *,
    entry_id: UUID,
    event_id: UUID,
    amount: Decimal,
    calculation_base: Optional[Decimal] = None,
    quantity: Optional[Decimal] = None,
    percentage: Optional[Decimal] = None,
    metadata: Optional[dict] = None,
    source: PayrollItemSource = PayrollItemSource.MANUAL,
) -> PayrollEntryItem:
    item = get_entry_item_by_event(db, entry_id=entry_id, event_id=event_id)
    if item is None:
        item = PayrollEntryItem(
            payroll_entry_id=entry_id,
            payroll_event_id=event_id,
        )
    item.amount = amount
    item.calculation_base = calculation_base
    item.quantity = quantity
    item.percentage = percentage
    item.item_metadata = metadata or {}
    item.source = source
    db.add(item)
    db.commit()
    db.refresh(item)
    _ = item.event
    return item


def delete_entry_item(db: Session, item_id: UUID) -> bool:
    item = get_entry_item(db, item_id)
    if not item:
        return False
    db.delete(item)
    db.commit()
    return True


def delete_entry_item_by_event(
    db: Session,
    *,
    entry_id: UUID,
    event_id: UUID,
) -> bool:
    item = get_entry_item_by_event(db, entry_id=entry_id, event_id=event_id)
    if not item:
        return False
    db.delete(item)
    db.commit()
    return True


def ensure_entry_base_item(
    db: Session, entry: PayrollEntry
) -> PayrollEntryItem:
    event = get_event_by_description(db, SALARY_BASE_EVENT_DESCRIPTION)
    if event is None:
        ensure_default_events(db)
        event = get_event_by_description(db, SALARY_BASE_EVENT_DESCRIPTION)
    return upsert_entry_item(
        db,
        entry_id=entry.id,
        event_id=event.id,
        amount=Decimal(str(entry.base_salary)),
        calculation_base=Decimal(str(entry.base_salary)),
        source=PayrollItemSource.AUTOMATIC,
        metadata={"origin": "entry.base_salary"},
    )


def ensure_entry_legacy_items(db: Session, entry: PayrollEntry) -> None:
    existing_items = list_items_by_entry(db, entry.id)
    if existing_items:
        if not any(
            item.event
            and item.event.description == SALARY_BASE_EVENT_DESCRIPTION
            for item in existing_items
        ):
            ensure_entry_base_item(db, entry)
        return

    ensure_entry_base_item(db, entry)

    extras_value = Decimal(str(entry.extras_value))
    if extras_value > 0:
        overtime_event = get_event_by_calculation_type(
            db, PayrollCalculationType.OVERTIME
        )
        if overtime_event:
            upsert_entry_item(
                db,
                entry_id=entry.id,
                event_id=overtime_event.id,
                amount=extras_value,
                calculation_base=Decimal(str(entry.base_salary)),
                source=PayrollItemSource.MANUAL,
                metadata={"origin": "legacy_existing"},
            )

    deductions_value = Decimal(str(entry.deductions_value))
    if deductions_value > 0:
        manual_deduction_event = get_event_by_description(
            db, MANUAL_DEDUCTION_EVENT_DESCRIPTION
        )
        if manual_deduction_event:
            upsert_entry_item(
                db,
                entry_id=entry.id,
                event_id=manual_deduction_event.id,
                amount=deductions_value,
                calculation_base=Decimal(str(entry.base_salary)),
                source=PayrollItemSource.MANUAL,
                metadata={"origin": "legacy_existing"},
            )


def recalculate_entry_totals(
    db: Session, entry_id: UUID
) -> Optional[PayrollEntry]:
    entry = get_entry(db, entry_id)
    if not entry:
        return None

    items = list_items_by_entry(db, entry_id)
    if not items:
        net_amount = (
            Decimal(str(entry.base_salary))
            + Decimal(str(entry.extras_value))
            - Decimal(str(entry.deductions_value))
        )
        entry.net_amount = max(Decimal("0"), net_amount)
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry

    total_earnings = Decimal("0")
    total_deductions = Decimal("0")
    extras_total = Decimal("0")

    for item in items:
        event = item.event
        if event is None or not event.affects_net:
            continue
        amount = Decimal(str(item.amount))
        if event.event_type == PayrollEventType.PROVENTO:
            total_earnings += amount
            if event.calculation_type in {
                PayrollCalculationType.OVERTIME,
                PayrollCalculationType.NIGHT_SHIFT,
            }:
                extras_total += amount
        elif event.event_type == PayrollEventType.DESCONTO:
            total_deductions += amount

    entry.extras_value = extras_total
    entry.deductions_value = total_deductions
    entry.net_amount = max(Decimal("0"), total_earnings - total_deductions)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    _ = entry.items
    return entry


# ---------------------------------------------------------------------------
# Payroll Payment Requests (aprovação de folha — Demanda 4)
# ---------------------------------------------------------------------------


def create_payment_request(
    db: Session,
    *,
    period_id: UUID,
    request_type: str,
    total_amount: Decimal,
) -> PayrollPaymentRequest:
    request = PayrollPaymentRequest(
        payroll_period_id=period_id,
        request_type=request_type,
        status="aguardando_aprovacao_financeiro",
        total_amount=total_amount,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def add_request_entry(
    db: Session, *, request_id: UUID, entry_id: UUID
) -> PayrollPaymentRequestEntry:
    link = PayrollPaymentRequestEntry(
        payment_request_id=request_id,
        payroll_entry_id=entry_id,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def get_payment_request(
    db: Session, request_id: UUID
) -> Optional[PayrollPaymentRequest]:
    request = (
        db.query(PayrollPaymentRequest)
        .filter(
            PayrollPaymentRequest.id == request_id,
            PayrollPaymentRequest.deleted_at.is_(None),
        )
        .first()
    )
    if request:
        _ = request.entries
    return request


def list_payment_requests_by_status(
    db: Session, status: str
) -> list[PayrollPaymentRequest]:
    requests = (
        db.query(PayrollPaymentRequest)
        .filter(
            PayrollPaymentRequest.status == status,
            PayrollPaymentRequest.deleted_at.is_(None),
        )
        .order_by(PayrollPaymentRequest.requested_at.asc())
        .all()
    )
    for r in requests:
        _ = r.entries
    return requests


def save_payment_request(
    db: Session, request: PayrollPaymentRequest
) -> PayrollPaymentRequest:
    db.add(request)
    db.commit()
    db.refresh(request)
    return request
