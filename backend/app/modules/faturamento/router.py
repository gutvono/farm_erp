from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.faturamento import service as fat_service
from app.modules.faturamento.schemas import (
    InvoiceCreate,
    InvoiceOut,
    InvoiceStatusUpdate,
)
from app.shared.enums import InvoiceStatus
from app.shared.responses import SuccessResponse, success

router = APIRouter()


def _serialize(invoice, db: Session) -> dict:
    from app.modules.faturamento.service import _get_client_name
    client_name = _get_client_name(db, invoice.client_id)
    return InvoiceOut.from_model(invoice, client_name).model_dump(mode="json")


@router.get("/faturas", response_model=SuccessResponse)
def list_invoices(
    status: Optional[InvoiceStatus] = None,
    client_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    invoices = fat_service.list_invoices(
        db, status=status, client_id=client_id, skip=skip, limit=limit
    )
    data = [_serialize(inv, db) for inv in invoices]
    return success("Faturas listadas com sucesso", data)


@router.post("/faturas", response_model=SuccessResponse, status_code=201)
def create_manual_invoice(
    body: InvoiceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    invoice = fat_service.create_manual_invoice(db, body)
    return success("Fatura criada com sucesso", _serialize(invoice, db))


@router.get("/faturas/{invoice_id}", response_model=SuccessResponse)
def get_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    invoice = fat_service.get_invoice(db, invoice_id)
    return success("Fatura obtida com sucesso", _serialize(invoice, db))


@router.patch("/faturas/{invoice_id}/status", response_model=SuccessResponse)
def update_invoice_status(
    invoice_id: UUID,
    body: InvoiceStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    invoice = fat_service.update_status(db, invoice_id, body.status)
    return success("Status atualizado com sucesso", _serialize(invoice, db))


@router.delete("/faturas/{invoice_id}", response_model=SuccessResponse)
def delete_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    fat_service.soft_delete_invoice(db, invoice_id)
    return success("Fatura removida com sucesso")
