from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.compras import service as compras_service
from app.modules.compras.schemas import (
    ApproveOrderRequest,
    PurchaseOrderCancelRequest,
    PurchaseOrderCreate,
    PurchaseOrderOut,
    PurchaseOrderReceiptFinalize,
    PurchaseOrderStatusUpdate,
    PurchaseOrderWithReceipts,
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
)
from app.shared.enums import PurchaseOrderStatus
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


@router.get("/fornecedores", response_model=SuccessResponse)
def list_suppliers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    suppliers = compras_service.list_suppliers(db, skip=skip, limit=limit)
    data = [SupplierOut.model_validate(s).model_dump(mode="json") for s in suppliers]
    return success("Fornecedores listados com sucesso", data)


@router.post("/fornecedores", response_model=SuccessResponse, status_code=201)
def create_supplier(
    body: SupplierCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    supplier = compras_service.create_supplier(db, body)
    return success(
        "Fornecedor criado com sucesso",
        SupplierOut.model_validate(supplier).model_dump(mode="json"),
    )


@router.get("/fornecedores/{supplier_id}", response_model=SuccessResponse)
def get_supplier(
    supplier_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    supplier = compras_service.get_supplier(db, supplier_id)
    return success(
        "Fornecedor obtido com sucesso",
        SupplierOut.model_validate(supplier).model_dump(mode="json"),
    )


@router.put("/fornecedores/{supplier_id}", response_model=SuccessResponse)
def update_supplier(
    supplier_id: UUID,
    body: SupplierUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    supplier = compras_service.update_supplier(db, supplier_id, body)
    return success(
        "Fornecedor atualizado com sucesso",
        SupplierOut.model_validate(supplier).model_dump(mode="json"),
    )


@router.delete("/fornecedores/{supplier_id}", response_model=SuccessResponse)
def delete_supplier(
    supplier_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    compras_service.soft_delete_supplier(db, supplier_id)
    return success("Fornecedor removido com sucesso")


# ---------------------------------------------------------------------------
# Purchase Orders
# ---------------------------------------------------------------------------


@router.get("/ordens", response_model=SuccessResponse)
def list_orders(
    status: Optional[PurchaseOrderStatus] = None,
    supplier_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    orders = compras_service.list_orders(
        db, status=status, supplier_id=supplier_id, skip=skip, limit=limit
    )
    data = [PurchaseOrderOut.from_model(o).model_dump(mode="json") for o in orders]
    return success("Ordens listadas com sucesso", data)


@router.post("/ordens", response_model=SuccessResponse, status_code=201)
def create_order(
    body: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.create_order(db, body)
    return success(
        "Ordem criada com sucesso",
        PurchaseOrderOut.from_model(order).model_dump(mode="json"),
    )


@router.get("/ordens/{order_id}", response_model=SuccessResponse)
def get_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.get_order(db, order_id)
    return success(
        "Ordem obtida com sucesso",
        PurchaseOrderOut.from_model(order).model_dump(mode="json"),
    )


@router.patch("/ordens/{order_id}/status", response_model=SuccessResponse)
def update_order_status(
    order_id: UUID,
    body: PurchaseOrderStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.update_status(db, order_id, body.status)
    return success(
        "Status atualizado com sucesso",
        PurchaseOrderOut.from_model(order).model_dump(mode="json"),
    )


@router.delete("/ordens/{order_id}", response_model=SuccessResponse)
def delete_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    compras_service.soft_delete_order(db, order_id)
    return success("Ordem removida com sucesso")


# ---------------------------------------------------------------------------
# Approval / Receipt flow
# ---------------------------------------------------------------------------


@router.post("/ordens/{order_id}/enviar-aprovacao", response_model=SuccessResponse)
def submit_for_approval(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.submit_for_approval(db, order_id)
    return success(
        "Ordem enviada para aprovação financeira",
        PurchaseOrderOut.from_model(order).model_dump(mode="json"),
    )


@router.post("/ordens/{order_id}/aprovar", response_model=SuccessResponse)
def approve_order(
    order_id: UUID,
    body: ApproveOrderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.approve_order(
        db,
        order_id,
        payment_method=body.payment_method,
        installments=body.installments,
        first_due_date=body.first_due_date,
        installment_interval_days=body.installment_interval_days,
    )
    return success(
        "Ordem aprovada pelo financeiro",
        PurchaseOrderOut.from_model(order).model_dump(mode="json"),
    )


@router.post("/ordens/{order_id}/concluir-servico", response_model=SuccessResponse)
def complete_service_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.complete_service_order(db, order_id)
    return success(
        "Serviço concluído — aguardando pagamento",
        PurchaseOrderOut.from_model(order).model_dump(mode="json"),
    )


@router.post("/ordens/{order_id}/recusar", response_model=SuccessResponse)
def reject_order(
    order_id: UUID,
    body: PurchaseOrderCancelRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.cancel_order_financial(db, order_id, body.note)
    return success(
        "Ordem recusada pelo financeiro",
        PurchaseOrderOut.from_model(order).model_dump(mode="json"),
    )


@router.post("/ordens/{order_id}/iniciar-conferencia", response_model=SuccessResponse)
def start_receipt(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.start_receipt(db, order_id)
    return success(
        "Conferência iniciada",
        PurchaseOrderWithReceipts.from_model(order).model_dump(mode="json"),
    )


@router.post("/ordens/{order_id}/finalizar-conferencia", response_model=SuccessResponse)
def finalize_receipt(
    order_id: UUID,
    body: PurchaseOrderReceiptFinalize,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.finalize_receipt(db, order_id, body.items)
    return success(
        "Conferência finalizada — aguardando pagamento",
        PurchaseOrderWithReceipts.from_model(order).model_dump(mode="json"),
    )


@router.get("/recebimentos", response_model=SuccessResponse)
def list_receipts(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    orders = compras_service.list_orders_for_receipt(db)
    data = [
        PurchaseOrderWithReceipts.from_model(o).model_dump(mode="json") for o in orders
    ]
    return success("Recebimentos listados com sucesso", data)


@router.get("/recebimentos/{order_id}", response_model=SuccessResponse)
def get_receipt(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = compras_service.get_order_with_receipts(db, order_id)
    return success(
        "Recebimento obtido com sucesso",
        PurchaseOrderWithReceipts.from_model(order).model_dump(mode="json"),
    )
