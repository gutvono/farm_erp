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
    EmployeeOut,
    EmployeeUpdate,
    JobPositionCreate,
    JobPositionOut,
    JobPositionUpdate,
    PayrollAutoCalculationRequest,
    PayrollEntryUpdate,
    PayrollManualItemUpsert,
    PayrollPeriodCreate,
)
from app.shared.enums import ContractType
from app.shared.pagination import Page, PageParams, get_page_params
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Cargos (Job Positions)
# ---------------------------------------------------------------------------


@router.get("/cargos", response_model=Page[JobPositionOut])
def list_positions(
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[JobPositionOut]:
    return folha_service.list_positions(db, params=params)


@router.post("/cargos", response_model=SuccessResponse, status_code=201)
def create_position(
    body: JobPositionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    position = folha_service.create_position(db, body)
    return success(
        "Cargo criado com sucesso",
        folha_service.serialize_position(position),
    )


@router.get("/cargos/{position_id}", response_model=SuccessResponse)
def get_position(
    position_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    position = folha_service.get_position(db, position_id)
    return success(
        "Cargo obtido com sucesso",
        folha_service.serialize_position(position),
    )


@router.put("/cargos/{position_id}", response_model=SuccessResponse)
def update_position(
    position_id: UUID,
    body: JobPositionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    position = folha_service.update_position(db, position_id, body)
    return success(
        "Cargo atualizado com sucesso",
        folha_service.serialize_position(position),
    )


@router.delete("/cargos/{position_id}", response_model=SuccessResponse)
def delete_position(
    position_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    folha_service.delete_position(db, position_id)
    return success("Cargo excluído com sucesso")


# ---------------------------------------------------------------------------
# Funcionários
# ---------------------------------------------------------------------------


@router.get("/funcionarios", response_model=Page[EmployeeOut])
def list_employees(
    is_active: Optional[bool] = None,
    contract_type: Optional[ContractType] = None,
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[EmployeeOut]:
    return folha_service.list_employees(
        db,
        params=params,
        is_active=is_active,
        contract_type=contract_type,
    )


@router.post("/funcionarios", response_model=SuccessResponse, status_code=201)
def create_employee(
    name: str = Form(..., min_length=1, max_length=255),
    cpf: str = Form(..., min_length=1, max_length=32),
    position_id: UUID = Form(...),
    contract_type: ContractType = Form(...),
    admission_date: date = Form(...),
    base_salary: Optional[Decimal] = Form(default=None, ge=0),
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
        position_id=position_id,
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
    "/periodos/{period_id}/solicitar-pagamento-todos",
    response_model=SuccessResponse,
)
def request_batch_payment(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    request = folha_service.request_batch_payment(db, period_id)
    return success(
        "Solicitação de pagamento em lote enviada para aprovação",
        folha_service.serialize_payment_request(db, request),
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


@router.get("/eventos", response_model=SuccessResponse)
def list_events(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    events = folha_service.list_events(db)
    data = [folha_service.serialize_event(event) for event in events]
    return success("Eventos de folha listados com sucesso", data)


@router.get("/entries/{entry_id}/itens", response_model=SuccessResponse)
def list_entry_items(
    entry_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    items = folha_service.list_entry_items(db, entry_id)
    data = [folha_service.serialize_item(item) for item in items]
    return success("Itens de folha listados com sucesso", data)


@router.post("/entries/{entry_id}/itens", response_model=SuccessResponse)
def upsert_entry_item(
    entry_id: UUID,
    body: PayrollManualItemUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    entry = folha_service.upsert_manual_item(db, entry_id, body)
    return success(
        "Item de folha salvo com sucesso",
        folha_service.serialize_entry(db, entry),
    )


@router.post(
    "/entries/{entry_id}/calculos/preview", response_model=SuccessResponse
)
def preview_calculation(
    entry_id: UUID,
    body: PayrollAutoCalculationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    preview = folha_service.preview_calculation(db, entry_id, body)
    return success(
        "Calculo de folha simulado com sucesso",
        folha_service.serialize_preview(preview),
    )


@router.post(
    "/entries/{entry_id}/calculos/aplicar", response_model=SuccessResponse
)
def apply_calculation(
    entry_id: UUID,
    body: PayrollAutoCalculationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    entry = folha_service.apply_calculation(db, entry_id, body)
    return success(
        "Calculo de folha aplicado com sucesso",
        folha_service.serialize_entry(db, entry),
    )


@router.delete(
    "/entries/{entry_id}/itens/{item_id}", response_model=SuccessResponse
)
def delete_entry_item(
    entry_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    entry = folha_service.delete_entry_item(db, entry_id, item_id)
    return success(
        "Item de folha removido com sucesso",
        folha_service.serialize_entry(db, entry),
    )


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


@router.post(
    "/entries/{entry_id}/solicitar-pagamento", response_model=SuccessResponse
)
def request_individual_payment(
    entry_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    request = folha_service.request_individual_payment(db, entry_id)
    return success(
        "Solicitação de pagamento enviada para aprovação",
        folha_service.serialize_payment_request(db, request),
    )
