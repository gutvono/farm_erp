from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.folha import service as folha_service
from app.modules.folha.schemas import (
    EmployeeUpdate,
    PayrollEntryUpdate,
    PayrollPeriodCreate,
)
from app.shared.enums import ContractType
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Funcionários
# ---------------------------------------------------------------------------


@router.get("/funcionarios", response_model=SuccessResponse)
def list_employees(
    is_active: Optional[bool] = None,
    contract_type: Optional[ContractType] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    employees = folha_service.list_employees(
        db,
        skip=skip,
        limit=limit,
        is_active=is_active,
        contract_type=contract_type,
    )
    data = [folha_service.serialize_employee(e) for e in employees]
    return success("Funcionários listados com sucesso", data)


@router.post("/funcionarios", response_model=SuccessResponse, status_code=201)
def create_employee(
    name: str = Form(..., min_length=1, max_length=255),
    cpf: str = Form(..., min_length=1, max_length=32),
    role: str = Form(..., min_length=1, max_length=100),
    base_salary: Decimal = Form(..., ge=0),
    contract_type: ContractType = Form(...),
    admission_date: date = Form(...),
    email: Optional[str] = Form(default=None),
    phone: Optional[str] = Form(default=None),
    termination_cost_override: Optional[Decimal] = Form(default=None),
    photo_file: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    employee = folha_service.create_employee(
        db,
        name=name,
        cpf=cpf,
        email=email,
        phone=phone,
        role=role,
        base_salary=base_salary,
        contract_type=contract_type,
        admission_date=admission_date,
        photo_file=photo_file,
        termination_cost_override=termination_cost_override,
    )
    return success(
        "Funcionário criado com sucesso",
        folha_service.serialize_employee(employee),
    )


@router.get("/funcionarios/{employee_id}", response_model=SuccessResponse)
def get_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    employee = folha_service.get_employee(db, employee_id)
    return success(
        "Funcionário obtido com sucesso",
        folha_service.serialize_employee(employee),
    )


@router.put("/funcionarios/{employee_id}", response_model=SuccessResponse)
def update_employee(
    employee_id: UUID,
    body: EmployeeUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    update_fields = body.model_dump(exclude_unset=True)
    employee = folha_service.update_employee(db, employee_id, update_fields)
    return success(
        "Funcionário atualizado com sucesso",
        folha_service.serialize_employee(employee),
    )


@router.post(
    "/funcionarios/{employee_id}/demitir", response_model=SuccessResponse
)
def terminate_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    employee = folha_service.terminate_employee(db, employee_id)
    return success(
        "Funcionário demitido com sucesso",
        folha_service.serialize_employee(employee),
    )


# ---------------------------------------------------------------------------
# Períodos de Folha
# ---------------------------------------------------------------------------


@router.get("/periodos", response_model=SuccessResponse)
def list_periods(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    periods = folha_service.list_periods(db, skip=skip, limit=limit)
    data = [folha_service.serialize_period(db, p) for p in periods]
    return success("Períodos listados com sucesso", data)


@router.post("/periodos", response_model=SuccessResponse, status_code=201)
def create_period(
    body: PayrollPeriodCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    period = folha_service.create_or_get_period(
        db,
        reference_month=body.reference_month,
        reference_year=body.reference_year,
    )
    return success(
        "Período obtido/criado com sucesso",
        folha_service.serialize_period(db, period),
    )


@router.get("/periodos/{period_id}", response_model=SuccessResponse)
def get_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    period = folha_service.get_period(db, period_id)
    return success(
        "Período obtido com sucesso",
        folha_service.serialize_period(db, period),
    )


@router.post(
    "/periodos/{period_id}/fechar", response_model=SuccessResponse
)
def close_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    period = folha_service.close_period(db, period_id)
    return success(
        "Período fechado com sucesso",
        folha_service.serialize_period(db, period),
    )


@router.post(
    "/periodos/{period_id}/pagar-todos", response_model=SuccessResponse
)
def pay_all_entries(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    result = folha_service.pay_all_entries(db, period_id)
    return success(
        "Pagamento em lote processado",
        result.model_dump(mode="json"),
    )


# ---------------------------------------------------------------------------
# Holerites (Entries)
# ---------------------------------------------------------------------------


@router.get(
    "/periodos/{period_id}/entries", response_model=SuccessResponse
)
def list_entries_by_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    entries = folha_service.list_entries_by_period(db, period_id)
    data = [folha_service.serialize_entry(db, e) for e in entries]
    return success("Holerites listados com sucesso", data)


@router.patch("/entries/{entry_id}", response_model=SuccessResponse)
def update_entry(
    entry_id: UUID,
    body: PayrollEntryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    entry = folha_service.update_entry(
        db,
        entry_id,
        overtime_amount=body.overtime_amount,
        deductions=body.deductions,
    )
    return success(
        "Holerite atualizado com sucesso",
        folha_service.serialize_entry(db, entry),
    )


@router.post("/entries/{entry_id}/pagar", response_model=SuccessResponse)
def pay_entry(
    entry_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    entry = folha_service.pay_entry(db, entry_id)
    return success(
        "Holerite pago com sucesso",
        folha_service.serialize_entry(db, entry),
    )
