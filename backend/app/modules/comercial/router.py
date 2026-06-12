from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.comercial import service as comercial_service
from app.modules.comercial.schemas import (
    ClientCreate,
    ClientOut,
    ClientUpdate,
    SaleCancelRequest,
    SaleCreate,
    SaleOut,
    SaleStatusUpdate,
)
from app.shared.enums import SaleStatus
from app.shared.pagination import Page, PageParams, get_page_params
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


@router.get("/clientes", response_model=Page[ClientOut])
def list_clients(
    is_delinquent: Optional[bool] = None,
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[ClientOut]:
    return comercial_service.list_clients(
        db, params=params, is_delinquent=is_delinquent
    )


@router.post("/clientes", response_model=SuccessResponse, status_code=201)
def create_client(
    body: ClientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    client = comercial_service.create_client(db, body)
    return success(
        "Cliente criado com sucesso",
        comercial_service.serialize_client(db, client).model_dump(mode="json"),
    )


@router.get("/clientes/{client_id}", response_model=SuccessResponse)
def get_client(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    client = comercial_service.get_client(db, client_id)
    return success(
        "Cliente obtido com sucesso",
        comercial_service.serialize_client(db, client).model_dump(mode="json"),
    )


@router.put("/clientes/{client_id}", response_model=SuccessResponse)
def update_client(
    client_id: UUID,
    body: ClientUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    client = comercial_service.update_client(db, client_id, body)
    return success(
        "Cliente atualizado com sucesso",
        comercial_service.serialize_client(db, client).model_dump(mode="json"),
    )


@router.put("/clientes/{client_id}/inadimplente", response_model=SuccessResponse)
def set_client_delinquent(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    client = comercial_service.update_client_delinquent(db, client_id, True)
    return success("Cliente marcado como inadimplente", comercial_service.serialize_client(db, client).model_dump(mode="json"))


@router.put("/clientes/{client_id}/reverter-inadimplencia", response_model=SuccessResponse)
def revert_client_delinquent(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    client = comercial_service.update_client_delinquent(db, client_id, False)
    return success(
        "Inadimplência revertida com sucesso",
        comercial_service.serialize_client(db, client).model_dump(mode="json"),
    )


@router.delete("/clientes/{client_id}", response_model=SuccessResponse)
def delete_client(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    comercial_service.soft_delete_client(db, client_id)
    return success("Cliente removido com sucesso")


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------


@router.get("/vendas", response_model=Page[SaleOut])
def list_sales(
    status: Optional[SaleStatus] = None,
    client_id: Optional[UUID] = None,
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[SaleOut]:
    return comercial_service.list_sales(
        db, params=params, status=status, client_id=client_id
    )


@router.post("/vendas", response_model=SuccessResponse, status_code=201)
def create_sale(
    body: SaleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    sale = comercial_service.create_sale(db, body)
    return success(
        "Venda criada com sucesso",
        SaleOut.from_model(sale).model_dump(mode="json"),
    )


@router.get("/vendas/{sale_id}", response_model=SuccessResponse)
def get_sale(
    sale_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    sale = comercial_service.get_sale(db, sale_id)
    return success(
        "Venda obtida com sucesso",
        SaleOut.from_model(sale).model_dump(mode="json"),
    )


@router.patch("/vendas/{sale_id}/status", response_model=SuccessResponse)
def update_sale_status(
    sale_id: UUID,
    body: SaleStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    sale = comercial_service.update_status(db, sale_id, body.status)
    return success(
        "Status atualizado com sucesso",
        SaleOut.from_model(sale).model_dump(mode="json"),
    )


@router.post("/vendas/{sale_id}/cancelar", response_model=SuccessResponse)
def cancel_sale(
    sale_id: UUID,
    body: Optional[SaleCancelRequest] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    sale = comercial_service.cancel_sale(
        db, sale_id, body.reason if body else None
    )
    return success(
        "Venda cancelada com sucesso",
        SaleOut.from_model(sale).model_dump(mode="json"),
    )


@router.delete("/vendas/{sale_id}", response_model=SuccessResponse)
def delete_sale(
    sale_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    comercial_service.soft_delete_sale(db, sale_id)
    return success("Venda removida com sucesso")


# ---------------------------------------------------------------------------
# Reports (Demanda 10)
# ---------------------------------------------------------------------------


@router.get("/relatorios/vendas", response_model=SuccessResponse)
def sales_report(
    start: Optional[date] = None,
    end: Optional[date] = None,
    granularity: str = "month",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    """Relatório de vendas por período. `start`/`end` (datas, default mês corrente);
    `granularity` da série temporal: `day`|`week`|`month`."""
    report = comercial_service.get_sales_report(
        db, start=start, end=end, granularity=granularity
    )
    return success(
        "Relatório de vendas gerado com sucesso",
        report.model_dump(mode="json"),
    )
