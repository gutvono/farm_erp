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
    SaleCreate,
    SaleOut,
    SaleStatusUpdate,
)
from app.shared.enums import SaleStatus
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


@router.get("/clientes", response_model=SuccessResponse)
def list_clients(
    is_delinquent: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    clients = comercial_service.list_clients(
        db, is_delinquent=is_delinquent, skip=skip, limit=limit
    )
    data = [ClientOut.model_validate(c).model_dump(mode="json") for c in clients]
    return success("Clientes listados com sucesso", data)


@router.post("/clientes", response_model=SuccessResponse, status_code=201)
def create_client(
    body: ClientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    client = comercial_service.create_client(db, body)
    return success(
        "Cliente criado com sucesso",
        ClientOut.model_validate(client).model_dump(mode="json"),
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
        ClientOut.model_validate(client).model_dump(mode="json"),
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
        ClientOut.model_validate(client).model_dump(mode="json"),
    )


@router.put("/clientes/{client_id}/inadimplente", response_model=SuccessResponse)
def set_client_delinquent(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    client = comercial_service.update_client_delinquent(db, client_id, True)
    return success("Cliente marcado como inadimplente", ClientOut.model_validate(client).model_dump(mode="json"))


@router.put("/clientes/{client_id}/reverter-inadimplencia", response_model=SuccessResponse)
def revert_client_delinquent(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    client = comercial_service.update_client_delinquent(db, client_id, False)
    return success(
        "Inadimplência revertida com sucesso",
        ClientOut.model_validate(client).model_dump(mode="json"),
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


@router.get("/vendas", response_model=SuccessResponse)
def list_sales(
    status: Optional[SaleStatus] = None,
    client_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    sales = comercial_service.list_sales(
        db, status=status, client_id=client_id, skip=skip, limit=limit
    )
    data = [SaleOut.from_model(s).model_dump(mode="json") for s in sales]
    return success("Vendas listadas com sucesso", data)


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


@router.delete("/vendas/{sale_id}", response_model=SuccessResponse)
def delete_sale(
    sale_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    comercial_service.soft_delete_sale(db, sale_id)
    return success("Venda removida com sucesso")
