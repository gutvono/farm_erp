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
    CancelQuotationRequest,
    PurchaseOrderCancelRequest,
    PurchaseOrderCreate,
    PurchaseOrderOut,
    PurchaseOrderReceiptFinalize,
    PurchaseOrderStatusUpdate,
    PurchaseOrderWithReceipts,
    QuotationCreate,
    QuotationOut,
    QuotationProposalCreate,
    QuotationProposalUpdate,
    RealizeOrderRequest,
    SelectWinnerRequest,
    SupplierCreate,
    SupplierForStockItemOut,
    SupplierItemCreate,
    SupplierItemOut,
    SupplierItemUpdate,
    SupplierOut,
    SupplierUpdate,
)
from app.shared.enums import PurchaseOrderStatus, QuotationStatus
from app.shared.pagination import Page, PageParams, get_page_params
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


@router.get("/fornecedores", response_model=Page[SupplierOut])
def list_suppliers(
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[SupplierOut]:
    return compras_service.list_suppliers(db, params=params)


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
# Supplier Items (catálogo do fornecedor)
# ---------------------------------------------------------------------------


@router.get(
    "/fornecedores/{supplier_id}/itens",
    response_model=Page[SupplierItemOut],
)
def list_supplier_items(
    supplier_id: UUID,
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[SupplierItemOut]:
    return compras_service.list_supplier_items(db, supplier_id, params)


@router.post(
    "/fornecedores/{supplier_id}/itens",
    response_model=SuccessResponse,
    status_code=201,
)
def create_supplier_item(
    supplier_id: UUID,
    body: SupplierItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    item = compras_service.create_supplier_item(db, supplier_id, body)
    return success(
        "Item adicionado ao catálogo com sucesso",
        SupplierItemOut.from_model(item).model_dump(mode="json"),
    )


@router.put(
    "/fornecedores/{supplier_id}/itens/{item_id}",
    response_model=SuccessResponse,
)
def update_supplier_item(
    supplier_id: UUID,
    item_id: UUID,
    body: SupplierItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    item = compras_service.update_supplier_item(db, supplier_id, item_id, body)
    return success(
        "Item do catálogo atualizado com sucesso",
        SupplierItemOut.from_model(item).model_dump(mode="json"),
    )


@router.delete(
    "/fornecedores/{supplier_id}/itens/{item_id}",
    response_model=SuccessResponse,
)
def delete_supplier_item(
    supplier_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    compras_service.delete_supplier_item(db, supplier_id, item_id)
    return success("Item removido do catálogo com sucesso")


@router.get("/produtos/{stock_item_id}/fornecedores", response_model=SuccessResponse)
def list_suppliers_for_stock_item(
    stock_item_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    items = compras_service.list_suppliers_for_stock_item(db, stock_item_id)
    data = [
        SupplierForStockItemOut(
            supplier_id=i.supplier_id,
            supplier_name=i.supplier.name if i.supplier else "",
            unit_price=i.unit_price,
        ).model_dump(mode="json")
        for i in items
    ]
    return success("Fornecedores do produto listados com sucesso", data)


# ---------------------------------------------------------------------------
# Purchase Orders
# ---------------------------------------------------------------------------


@router.get("/ordens", response_model=Page[PurchaseOrderOut])
def list_orders(
    status: Optional[PurchaseOrderStatus] = None,
    supplier_id: Optional[UUID] = None,
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[PurchaseOrderOut]:
    return compras_service.list_orders(
        db, params=params, status=status, supplier_id=supplier_id
    )


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


@router.get("/recebimentos", response_model=Page[PurchaseOrderWithReceipts])
def list_receipts(
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[PurchaseOrderWithReceipts]:
    return compras_service.list_orders_for_receipt(db, params=params)


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


# ---------------------------------------------------------------------------
# Quotations (Cotações)
# ---------------------------------------------------------------------------


@router.get("/cotacoes", response_model=Page[QuotationOut])
def list_quotations(
    status: Optional[QuotationStatus] = None,
    order_type: Optional[str] = None,
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[QuotationOut]:
    return compras_service.list_quotations(
        db, params=params, status=status, order_type=order_type
    )


@router.post("/cotacoes", response_model=SuccessResponse, status_code=201)
def create_quotation(
    body: QuotationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    quotation = compras_service.create_quotation(db, body)
    return success(
        "Cotação criada com sucesso",
        QuotationOut.from_model(quotation).model_dump(mode="json"),
    )


@router.get("/cotacoes/{quotation_id}", response_model=SuccessResponse)
def get_quotation(
    quotation_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    quotation = compras_service.get_quotation(db, quotation_id)
    return success(
        "Cotação obtida com sucesso",
        QuotationOut.from_model(quotation).model_dump(mode="json"),
    )


@router.delete("/cotacoes/{quotation_id}", response_model=SuccessResponse)
def delete_quotation(
    quotation_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    compras_service.soft_delete_quotation(db, quotation_id)
    return success("Cotação removida com sucesso")


@router.post(
    "/cotacoes/{quotation_id}/propostas",
    response_model=SuccessResponse,
    status_code=201,
)
def add_proposal(
    quotation_id: UUID,
    body: QuotationProposalCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    compras_service.add_proposal(db, quotation_id, body)
    quotation = compras_service.get_quotation(db, quotation_id)
    return success(
        "Proposta adicionada com sucesso",
        QuotationOut.from_model(quotation).model_dump(mode="json"),
    )


@router.put(
    "/cotacoes/{quotation_id}/propostas/{proposal_id}",
    response_model=SuccessResponse,
)
def update_proposal(
    quotation_id: UUID,
    proposal_id: UUID,
    body: QuotationProposalUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    compras_service.update_proposal(db, quotation_id, proposal_id, body)
    quotation = compras_service.get_quotation(db, quotation_id)
    return success(
        "Proposta atualizada com sucesso",
        QuotationOut.from_model(quotation).model_dump(mode="json"),
    )


@router.delete(
    "/cotacoes/{quotation_id}/propostas/{proposal_id}",
    response_model=SuccessResponse,
)
def delete_proposal(
    quotation_id: UUID,
    proposal_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    compras_service.delete_proposal(db, quotation_id, proposal_id)
    return success("Proposta removida com sucesso")


@router.post(
    "/cotacoes/{quotation_id}/selecionar-vencedor",
    response_model=SuccessResponse,
)
def select_winner(
    quotation_id: UUID,
    body: SelectWinnerRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    quotation = compras_service.select_winner(db, quotation_id, body.proposal_id)
    return success(
        "Vencedor selecionado",
        QuotationOut.from_model(quotation).model_dump(mode="json"),
    )


@router.post("/cotacoes/{quotation_id}/aprovar", response_model=SuccessResponse)
def approve_quotation(
    quotation_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    quotation = compras_service.approve_quotation(db, quotation_id)
    return success(
        "Cotação aprovada pelo financeiro",
        QuotationOut.from_model(quotation).model_dump(mode="json"),
    )


@router.post("/cotacoes/{quotation_id}/cancelar", response_model=SuccessResponse)
def cancel_quotation(
    quotation_id: UUID,
    body: CancelQuotationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    quotation = compras_service.cancel_quotation(db, quotation_id, body.note)
    return success(
        "Cotação cancelada",
        QuotationOut.from_model(quotation).model_dump(mode="json"),
    )


@router.post(
    "/cotacoes/{quotation_id}/realizar-pedido",
    response_model=SuccessResponse,
)
def realize_order(
    quotation_id: UUID,
    body: RealizeOrderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    quotation = compras_service.realize_order(db, quotation_id, body)
    return success(
        "Pedido realizado com sucesso",
        QuotationOut.from_model(quotation).model_dump(mode="json"),
    )
