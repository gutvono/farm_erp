import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.financeiro import service as fin_service
from app.modules.folha import repository as folha_repo
from app.modules.folha.calculations import (
    calculate_fgts,
    calculate_inss,
    calculate_night_shift,
    calculate_overtime,
    calculate_transport_voucher,
)
from app.modules.folha.model import (
    Employee,
    PayrollEntry,
    PayrollEntryItem,
    PayrollEvent,
    PayrollPeriod,
)
from app.modules.folha.schemas import (
    EmployeeOut,
    PayrollAutoCalculationRequest,
    PayrollBatchResult,
    PayrollCalculationPreview,
    PayrollEntryItemOut,
    PayrollEntryOut,
    PayrollEventOut,
    PayrollManualItemUpsert,
    PayrollPeriodOut,
)
from app.shared.enums import (
    ContractType,
    FinancialCategory,
    MovementType,
    PayrollCalculationType,
    PayrollEntryStatus,
    PayrollEventType,
    PayrollItemSource,
    PayrollPeriodStatus,
)


# ---------------------------------------------------------------------------
# Constants — termination cost by contract type
# ---------------------------------------------------------------------------


TERMINATION_COST: dict[str, Decimal] = {
    "clt": Decimal("5000.00"),          # Multa FGTS + aviso prévio simulados
    "pj": Decimal("1000.00"),           # Somente aviso contratual
    "temporario": Decimal("500.00"),
}


ALLOWED_PHOTO_MIME = {"image/jpeg", "image/png"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _photo_url(photo_path: Optional[str]) -> Optional[str]:
    if not photo_path:
        return None
    return f"/uploads/{photo_path}"


def _employee_out(employee: Employee) -> dict:
    return EmployeeOut.from_model(
        employee, photo_url=_photo_url(employee.photo_path)
    ).model_dump(mode="json")


def _event_out(event: PayrollEvent) -> PayrollEventOut:
    return PayrollEventOut.from_model(event)


def _item_out(item: PayrollEntryItem) -> PayrollEntryItemOut:
    return PayrollEntryItemOut.from_model(item)


def _entry_out(db: Session, entry: PayrollEntry) -> PayrollEntryOut:
    employee = db.query(Employee).filter(Employee.id == entry.employee_id).first()
    employee_name = employee.name if employee else ""
    contract_type = (
        employee.contract_type if employee else ContractType.CLT
    )
    items = folha_repo.list_items_by_entry(db, entry.id)
    return PayrollEntryOut.from_model(
        entry,
        employee_name,
        contract_type,
        items=[_item_out(item) for item in items],
    )


def _period_out(db: Session, period: PayrollPeriod) -> dict:
    entries_out = [_entry_out(db, e) for e in period.entries]
    return PayrollPeriodOut.from_model(period, entries_out).model_dump(mode="json")


def _save_photo(photo_file: UploadFile) -> str:
    if photo_file.content_type not in ALLOWED_PHOTO_MIME:
        raise HTTPException(
            status_code=400,
            detail="Formato de foto inválido. Aceitamos apenas JPEG ou PNG.",
        )
    employees_dir = os.path.join(settings.upload_dir, "employees")
    os.makedirs(employees_dir, exist_ok=True)
    safe_name = os.path.basename(photo_file.filename or "photo")
    rel_name = f"employees/{uuid.uuid4().hex}_{safe_name}"
    abs_path = os.path.join(settings.upload_dir, rel_name)
    with open(abs_path, "wb") as f:
        f.write(photo_file.file.read())
    return rel_name


def _get_employee_or_404(db: Session, employee_id: UUID) -> Employee:
    employee = folha_repo.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Funcionário não encontrado")
    return employee


def _get_period_or_404(db: Session, period_id: UUID) -> PayrollPeriod:
    period = folha_repo.get_period(db, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Período de folha não encontrado")
    return period


def _get_entry_or_404(db: Session, entry_id: UUID) -> PayrollEntry:
    entry = folha_repo.get_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Holerite não encontrado")
    return entry


def _assert_entry_mutable(db: Session, entry: PayrollEntry) -> PayrollPeriod:
    period = folha_repo.get_period(db, entry.payroll_period_id)
    if not period:
        raise HTTPException(
            status_code=404, detail="Período do holerite não encontrado"
        )
    if period.status == PayrollPeriodStatus.FECHADA:
        raise HTTPException(
            status_code=400,
            detail="Período já fechado, não é possível alterar lançamentos",
        )
    if entry.status == PayrollEntryStatus.PAGO:
        raise HTTPException(
            status_code=400,
            detail="Holerite já pago, não é possível alterar lançamentos",
        )
    return period


def _get_active_event_or_404(db: Session, event_id: UUID) -> PayrollEvent:
    event = folha_repo.get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento de folha não encontrado")
    if not event.is_active:
        raise HTTPException(status_code=400, detail="Evento de folha inativo")
    return event


def _resolve_calculation_event(
    db: Session,
    request: PayrollAutoCalculationRequest,
) -> PayrollEvent:
    event = (
        _get_active_event_or_404(db, request.event_id)
        if request.event_id
        else folha_repo.get_event_by_calculation_type(db, request.calculation_type)
    )
    if not event:
        raise HTTPException(
            status_code=404, detail="Evento automatico de folha não encontrado"
        )
    if not event.is_active:
        raise HTTPException(status_code=400, detail="Evento de folha inativo")
    if event.calculation_type != request.calculation_type:
        raise HTTPException(
            status_code=400,
            detail="Tipo de calculo nao corresponde ao evento selecionado",
        )
    if event.calculation_type == PayrollCalculationType.MANUAL:
        raise HTTPException(
            status_code=400,
            detail="Calculo manual deve ser lancado pelo endpoint de itens",
        )
    return event


def _decimal(value: Optional[Decimal], fallback: Decimal) -> Decimal:
    if value is None:
        return fallback
    return Decimal(str(value))


def _entry_remuneration_base(entry: PayrollEntry) -> Decimal:
    return Decimal(str(entry.base_salary)) + Decimal(str(entry.extras_value))


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
    photo_file: Optional[UploadFile] = None,
    termination_cost_override: Optional[Decimal] = None,
) -> Employee:
    existing = folha_repo.get_employee_by_cpf(db, cpf)
    if existing:
        raise HTTPException(
            status_code=400, detail="Já existe um funcionário cadastrado com este CPF"
        )

    photo_path: Optional[str] = None
    if photo_file is not None and photo_file.filename:
        photo_path = _save_photo(photo_file)

    return folha_repo.create_employee(
        db,
        name=name,
        cpf=cpf,
        email=email,
        phone=phone,
        role=role,
        base_salary=base_salary,
        contract_type=contract_type,
        admission_date=admission_date,
        photo_path=photo_path,
        termination_cost_override=termination_cost_override,
    )


def list_employees(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = None,
    contract_type: Optional[ContractType] = None,
) -> list[Employee]:
    return folha_repo.list_employees(
        db,
        skip=skip,
        limit=limit,
        is_active=is_active,
        contract_type=contract_type,
    )


def get_employee(db: Session, employee_id: UUID) -> Employee:
    return _get_employee_or_404(db, employee_id)


def update_employee(
    db: Session, employee_id: UUID, update_fields: dict
) -> Employee:
    _get_employee_or_404(db, employee_id)
    # Map schema names to model names (admission_date → hire_date)
    mapped: dict = {}
    for key, value in update_fields.items():
        if value is None:
            continue
        if key == "admission_date":
            mapped["hire_date"] = value
        else:
            mapped[key] = value
    updated = folha_repo.update_employee(db, employee_id, mapped)
    return updated


def terminate_employee(db: Session, employee_id: UUID) -> Employee:
    employee = _get_employee_or_404(db, employee_id)
    if not employee.is_active:
        raise HTTPException(
            status_code=400, detail="Funcionário já está inativo/demitido"
        )

    contract_key = (
        employee.contract_type.value
        if hasattr(employee.contract_type, "value")
        else str(employee.contract_type)
    )
    if employee.termination_cost_override is not None:
        cost = Decimal(str(employee.termination_cost_override))
    else:
        cost = TERMINATION_COST.get(contract_key, Decimal("0"))

    employee_name = employee.name
    contract_label = contract_key.upper()

    folha_repo.deactivate_employee(db, employee_id)

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.FOLHA,
        amount=cost,
        description=f"Demissão: {employee_name} ({contract_label})",
        source_module="folha",
        reference_id=employee_id,
    )
    fin_service.criar_conta_pagar(
        db,
        description=f"Verbas rescisórias: {employee_name}",
        amount=cost,
        due_date=date.today() + timedelta(days=10),
        source_module="folha",
        reference_id=employee_id,
    )

    # Reload after multiple commits
    reloaded = db.query(Employee).filter(Employee.id == employee_id).first()
    return reloaded


# ---------------------------------------------------------------------------
# Payroll Periods
# ---------------------------------------------------------------------------


def create_or_get_period(
    db: Session, *, reference_month: int, reference_year: int
) -> PayrollPeriod:
    existing = folha_repo.get_period_by_month_year(
        db, reference_month, reference_year
    )
    if existing:
        return existing

    period = folha_repo.create_period(
        db, reference_month=reference_month, reference_year=reference_year
    )

    active_employees = folha_repo.list_active_employees(db)
    for employee in active_employees:
        folha_repo.create_entry(
            db,
            period_id=period.id,
            employee_id=employee.id,
            base_salary=Decimal(str(employee.base_salary)),
        )

    # Reload period after multiple entry commits
    reloaded = folha_repo.get_period(db, period.id)
    return reloaded


def list_periods(
    db: Session, *, skip: int = 0, limit: int = 100
) -> list[PayrollPeriod]:
    return folha_repo.list_periods(db, skip=skip, limit=limit)


def get_period(db: Session, period_id: UUID) -> PayrollPeriod:
    return _get_period_or_404(db, period_id)


def close_period(db: Session, period_id: UUID) -> PayrollPeriod:
    period = _get_period_or_404(db, period_id)
    if period.status != PayrollPeriodStatus.ABERTA:
        raise HTTPException(
            status_code=400, detail="Período já está fechado"
        )
    pending = [e for e in period.entries if e.status == PayrollEntryStatus.PENDENTE]
    if pending:
        raise HTTPException(
            status_code=400,
            detail=(
                "Existem funcionários sem pagamento. "
                "Pague todos ou remova as pendências antes de fechar."
            ),
        )
    return folha_repo.close_period(db, period_id)


# ---------------------------------------------------------------------------
# Payroll Entries
# ---------------------------------------------------------------------------


def list_entries_by_period(db: Session, period_id: UUID) -> list[PayrollEntry]:
    _get_period_or_404(db, period_id)
    return folha_repo.list_entries_by_period(db, period_id)


def list_events(db: Session) -> list[PayrollEvent]:
    return folha_repo.list_events(db)


def list_entry_items(db: Session, entry_id: UUID) -> list[PayrollEntryItem]:
    _get_entry_or_404(db, entry_id)
    return folha_repo.list_items_by_entry(db, entry_id)


def recalculate_entry(db: Session, entry_id: UUID) -> PayrollEntry:
    entry = _get_entry_or_404(db, entry_id)
    folha_repo.ensure_entry_legacy_items(db, entry)
    recalculated = folha_repo.recalculate_entry_totals(db, entry_id)
    return recalculated or entry


def _time_label(value) -> str:
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


def _calculation_preview(
    entry: PayrollEntry,
    event: PayrollEvent,
    request: PayrollAutoCalculationRequest,
) -> PayrollCalculationPreview:
    base_salary = Decimal(str(entry.base_salary))
    remuneration_base = _entry_remuneration_base(entry)
    metadata: dict[str, str] = {}
    calculation_base: Decimal
    quantity: Optional[Decimal] = None
    percentage: Optional[Decimal] = None

    if request.calculation_type == PayrollCalculationType.OVERTIME:
        if request.quantity is None:
            raise HTTPException(
                status_code=400, detail="Quantidade de horas e obrigatoria"
            )
        quantity = Decimal(str(request.quantity))
        percentage = _decimal(request.percentage, Decimal("50"))
        calculation_base = _decimal(request.base_amount, base_salary)
        amount = calculate_overtime(calculation_base, quantity, percentage)
        metadata = {"divisor": "220"}

    elif request.calculation_type == PayrollCalculationType.NIGHT_SHIFT:
        start_time = request.start_time or "22:00"
        end_time = request.end_time or "05:00"
        rule = request.rule or "urbana"
        percentage = _decimal(request.percentage, Decimal("20"))
        calculation_base = _decimal(request.base_amount, base_salary)
        amount = calculate_night_shift(
            calculation_base,
            start_time,
            end_time,
            percentage,
            rule,
        )
        metadata = {
            "start_time": _time_label(start_time),
            "end_time": _time_label(end_time),
            "rule": rule,
            "divisor": "220",
        }

    elif request.calculation_type == PayrollCalculationType.INSS:
        calculation_base = _decimal(request.base_amount, remuneration_base)
        amount = calculate_inss(calculation_base)

    elif request.calculation_type == PayrollCalculationType.FGTS:
        calculation_base = _decimal(request.base_amount, remuneration_base)
        percentage = _decimal(request.percentage, Decimal("8"))
        amount = calculate_fgts(calculation_base, percentage)

    elif request.calculation_type == PayrollCalculationType.TRANSPORT_VOUCHER:
        if request.real_transport_cost is None:
            raise HTTPException(
                status_code=400,
                detail="Custo real de transporte e obrigatorio",
            )
        calculation_base = _decimal(request.base_amount, base_salary)
        amount = calculate_transport_voucher(
            calculation_base,
            Decimal(str(request.real_transport_cost)),
        )
        metadata = {
            "real_transport_cost": str(request.real_transport_cost),
        }

    else:
        raise HTTPException(status_code=400, detail="Tipo de calculo invalido")

    return PayrollCalculationPreview(
        event_id=event.id,
        event_description=event.description,
        event_type=event.event_type,
        calculation_type=event.calculation_type,
        amount=amount,
        calculation_base=calculation_base,
        quantity=quantity,
        percentage=percentage,
        metadata=metadata,
        affects_net=event.affects_net,
    )


def preview_calculation(
    db: Session,
    entry_id: UUID,
    request: PayrollAutoCalculationRequest,
) -> PayrollCalculationPreview:
    entry = _get_entry_or_404(db, entry_id)
    event = _resolve_calculation_event(db, request)
    try:
        return _calculation_preview(entry, event, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def apply_calculation(
    db: Session,
    entry_id: UUID,
    request: PayrollAutoCalculationRequest,
) -> PayrollEntry:
    entry = _get_entry_or_404(db, entry_id)
    _assert_entry_mutable(db, entry)
    folha_repo.ensure_entry_legacy_items(db, entry)
    event = _resolve_calculation_event(db, request)
    try:
        preview = _calculation_preview(entry, event, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    folha_repo.upsert_entry_item(
        db,
        entry_id=entry.id,
        event_id=event.id,
        amount=preview.amount,
        calculation_base=preview.calculation_base,
        quantity=preview.quantity,
        percentage=preview.percentage,
        metadata=preview.metadata,
        source=PayrollItemSource.AUTOMATIC,
    )
    return folha_repo.recalculate_entry_totals(db, entry.id) or entry


def upsert_manual_item(
    db: Session,
    entry_id: UUID,
    body: PayrollManualItemUpsert,
) -> PayrollEntry:
    entry = _get_entry_or_404(db, entry_id)
    _assert_entry_mutable(db, entry)
    event = _get_active_event_or_404(db, body.event_id)
    if event.is_automatic or event.calculation_type != PayrollCalculationType.MANUAL:
        raise HTTPException(
            status_code=400,
            detail="Eventos automaticos devem ser lancados por calculo",
        )
    if event.description == folha_repo.SALARY_BASE_EVENT_DESCRIPTION:
        raise HTTPException(
            status_code=400,
            detail="Salario base nao pode ser alterado como item manual",
        )
    folha_repo.ensure_entry_legacy_items(db, entry)
    folha_repo.upsert_entry_item(
        db,
        entry_id=entry.id,
        event_id=event.id,
        amount=body.amount,
        calculation_base=body.calculation_base,
        quantity=body.quantity,
        percentage=body.percentage,
        metadata=body.metadata,
        source=PayrollItemSource.MANUAL,
    )
    return folha_repo.recalculate_entry_totals(db, entry.id) or entry


def delete_entry_item(db: Session, entry_id: UUID, item_id: UUID) -> PayrollEntry:
    entry = _get_entry_or_404(db, entry_id)
    _assert_entry_mutable(db, entry)
    item = folha_repo.get_entry_item(db, item_id)
    if not item or item.payroll_entry_id != entry.id:
        raise HTTPException(status_code=404, detail="Item de folha nao encontrado")
    if item.event and item.event.description == folha_repo.SALARY_BASE_EVENT_DESCRIPTION:
        raise HTTPException(
            status_code=400,
            detail="Item de salario base nao pode ser removido",
        )
    folha_repo.delete_entry_item(db, item_id)
    return folha_repo.recalculate_entry_totals(db, entry.id) or entry


def update_entry(
    db: Session,
    entry_id: UUID,
    *,
    overtime_amount: Decimal,
    deductions: Decimal,
) -> PayrollEntry:
    entry = _get_entry_or_404(db, entry_id)
    _assert_entry_mutable(db, entry)
    folha_repo.ensure_entry_legacy_items(db, entry)

    items = folha_repo.list_items_by_entry(db, entry.id)
    non_overtime_earnings = Decimal("0")
    non_manual_deductions = Decimal("0")
    for item in items:
        event = item.event
        if not event or not event.affects_net:
            continue
        amount = Decimal(str(item.amount))
        if (
            event.event_type == PayrollEventType.PROVENTO
            and event.description != folha_repo.SALARY_BASE_EVENT_DESCRIPTION
            and event.calculation_type != PayrollCalculationType.OVERTIME
        ):
            non_overtime_earnings += amount
        if (
            event.event_type == PayrollEventType.DESCONTO
            and event.description != folha_repo.MANUAL_DEDUCTION_EVENT_DESCRIPTION
        ):
            non_manual_deductions += amount

    overtime_event = folha_repo.get_event_by_calculation_type(
        db, PayrollCalculationType.OVERTIME
    )
    manual_deduction_event = folha_repo.get_event_by_description(
        db, folha_repo.MANUAL_DEDUCTION_EVENT_DESCRIPTION
    )

    overtime_item_amount = max(
        Decimal("0"), Decimal(str(overtime_amount)) - non_overtime_earnings
    )
    manual_deduction_amount = max(
        Decimal("0"), Decimal(str(deductions)) - non_manual_deductions
    )

    if overtime_event:
        folha_repo.upsert_entry_item(
            db,
            entry_id=entry.id,
            event_id=overtime_event.id,
            amount=overtime_item_amount,
            calculation_base=Decimal(str(entry.base_salary)),
            source=PayrollItemSource.MANUAL,
            metadata={"origin": "legacy_patch"},
        )
    if manual_deduction_event:
        folha_repo.upsert_entry_item(
            db,
            entry_id=entry.id,
            event_id=manual_deduction_event.id,
            amount=manual_deduction_amount,
            calculation_base=Decimal(str(entry.base_salary)),
            source=PayrollItemSource.MANUAL,
            metadata={"origin": "legacy_patch"},
        )

    return folha_repo.recalculate_entry_totals(db, entry.id) or entry


def pay_entry(db: Session, entry_id: UUID) -> PayrollEntry:
    entry = _get_entry_or_404(db, entry_id)
    if entry.status == PayrollEntryStatus.PAGO:
        raise HTTPException(
            status_code=400, detail="Funcionário já recebeu neste período"
        )
    period = folha_repo.get_period(db, entry.payroll_period_id)
    if not period:
        raise HTTPException(
            status_code=404, detail="Período do holerite não encontrado"
        )
    employee = db.query(Employee).filter(Employee.id == entry.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Funcionário não encontrado")

    entry = folha_repo.recalculate_entry_totals(db, entry.id) or entry
    amount = Decimal(str(entry.net_amount))
    balance = fin_service.get_balance(db)
    saldo_atual = Decimal(str(balance.saldo))
    if saldo_atual < amount:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Saldo insuficiente. Saldo atual: R${saldo_atual:.2f}, "
                f"valor do holerite: R${amount:.2f}"
            ),
        )

    folha_repo.mark_entry_paid(db, entry_id)

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.FOLHA,
        amount=amount,
        description=(
            f"Pagamento de salário: {employee.name} — "
            f"{period.competency_month:02d}/{period.competency_year}"
        ),
        source_module="folha",
        reference_id=entry_id,
    )

    # Reload after multiple commits
    reloaded = folha_repo.get_entry(db, entry_id)
    return reloaded


def pay_all_entries(db: Session, period_id: UUID) -> PayrollBatchResult:
    period = _get_period_or_404(db, period_id)
    if period.status != PayrollPeriodStatus.ABERTA:
        raise HTTPException(
            status_code=400, detail="Período já está fechado"
        )

    pending_entries = folha_repo.list_pending_entries_by_period(db, period_id)

    balance = fin_service.get_balance(db)
    saldo_atual = Decimal(str(balance.saldo))

    paid_count = 0
    total_paid = Decimal("0")
    failed_employees: list[str] = []

    for entry in pending_entries:
        employee = (
            db.query(Employee).filter(Employee.id == entry.employee_id).first()
        )
        employee_name = employee.name if employee else str(entry.employee_id)
        entry = folha_repo.recalculate_entry_totals(db, entry.id) or entry
        amount = Decimal(str(entry.net_amount))

        if saldo_atual >= amount:
            folha_repo.mark_entry_paid(db, entry.id)
            fin_service.registrar_movimento(
                db,
                movement_type=MovementType.SAIDA,
                category=FinancialCategory.FOLHA,
                amount=amount,
                description=(
                    f"Pagamento de salário: {employee_name} — "
                    f"{period.competency_month:02d}/{period.competency_year}"
                ),
                source_module="folha",
                reference_id=entry.id,
            )
            saldo_atual -= amount
            paid_count += 1
            total_paid += amount
        else:
            failed_employees.append(employee_name)

    return PayrollBatchResult(
        paid_count=paid_count,
        total_paid=total_paid,
        insufficient_balance=len(failed_employees) > 0,
        failed_employees=failed_employees,
    )


# ---------------------------------------------------------------------------
# Serialization helpers (used by router)
# ---------------------------------------------------------------------------


def serialize_employee(employee: Employee) -> dict:
    return _employee_out(employee)


def serialize_period(db: Session, period: PayrollPeriod) -> dict:
    return _period_out(db, period)


def serialize_entry(db: Session, entry: PayrollEntry) -> dict:
    return _entry_out(db, entry).model_dump(mode="json")


def serialize_event(event: PayrollEvent) -> dict:
    return _event_out(event).model_dump(mode="json")


def serialize_item(item: PayrollEntryItem) -> dict:
    return _item_out(item).model_dump(mode="json")


def serialize_preview(preview: PayrollCalculationPreview) -> dict:
    return preview.model_dump(mode="json")
