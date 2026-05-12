from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.compras import repository as compras_repo
from app.modules.compras.model import PurchaseOrder, Supplier
from app.modules.compras.schemas import (
    PurchaseOrderCreate,
    PurchaseOrderReceiptItem,
    SupplierCreate,
    SupplierUpdate,
)
from app.modules.estoque import repository as estoque_repo
from app.modules.estoque import service as estoque_service
from app.modules.financeiro import service as fin_service
from app.shared.enums import FinancialCategory, MovementType, PurchaseOrderStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_supplier_or_404(db: Session, supplier_id: UUID) -> Supplier:
    supplier = compras_repo.get_supplier(db, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    return supplier


def _get_order_or_404(db: Session, order_id: UUID) -> PurchaseOrder:
    order = compras_repo.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de compra não encontrada")
    return order


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


def create_supplier(db: Session, data: SupplierCreate) -> Supplier:
    return compras_repo.create_supplier(db, data)


def list_suppliers(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 100,
) -> list[Supplier]:
    return compras_repo.list_suppliers(db, skip=skip, limit=limit)


def get_supplier(db: Session, supplier_id: UUID) -> Supplier:
    return _get_supplier_or_404(db, supplier_id)


def update_supplier(db: Session, supplier_id: UUID, data: SupplierUpdate) -> Supplier:
    _get_supplier_or_404(db, supplier_id)
    return compras_repo.update_supplier(db, supplier_id, data)


def soft_delete_supplier(db: Session, supplier_id: UUID) -> Supplier:
    _get_supplier_or_404(db, supplier_id)
    return compras_repo.soft_delete_supplier(db, supplier_id)


# ---------------------------------------------------------------------------
# Purchase Orders
# ---------------------------------------------------------------------------


def create_order(db: Session, data: PurchaseOrderCreate) -> PurchaseOrder:
    # Validate supplier exists
    _get_supplier_or_404(db, data.supplier_id)

    # Validate all stock items exist
    for item_data in data.items:
        stock_item = estoque_repo.get_item(db, item_data.stock_item_id)
        if not stock_item:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {item_data.stock_item_id}",
            )

    return compras_repo.create_order(db, data)


def list_orders(
    db: Session,
    *,
    status: Optional[PurchaseOrderStatus] = None,
    supplier_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[PurchaseOrder]:
    return compras_repo.list_orders(
        db, status=status, supplier_id=supplier_id, skip=skip, limit=limit
    )


def get_order(db: Session, order_id: UUID) -> PurchaseOrder:
    return _get_order_or_404(db, order_id)


def update_status(
    db: Session, order_id: UUID, new_status: PurchaseOrderStatus
) -> PurchaseOrder:
    """
    Legacy endpoint — agora restrito a cancelamentos.
    Transições do novo fluxo (aprovação, conferência, conclusão) usam endpoints
    dedicados: /enviar-aprovacao, /aprovar, /recusar, /iniciar-conferencia,
    /finalizar-conferencia. A conclusão acontece automaticamente ao pagar a
    conta a pagar gerada pela conferência.
    """
    order = _get_order_or_404(db, order_id)

    final_statuses = (PurchaseOrderStatus.CONCLUIDA, PurchaseOrderStatus.CANCELADA)
    if order.status in final_statuses:
        raise HTTPException(
            status_code=400,
            detail="Ordem já finalizada, status não pode ser alterado",
        )

    if new_status != PurchaseOrderStatus.CANCELADA:
        raise HTTPException(
            status_code=400,
            detail=(
                "Use os endpoints dedicados do fluxo: /enviar-aprovacao, "
                "/aprovar, /recusar, /iniciar-conferencia, /finalizar-conferencia"
            ),
        )

    return compras_repo.update_order_status(db, order_id, new_status)


# ---------------------------------------------------------------------------
# Approval / Receipt flow
# ---------------------------------------------------------------------------


def submit_for_approval(db: Session, order_id: UUID) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)
    if order.status != PurchaseOrderStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens em andamento podem ser enviadas para aprovação",
        )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description="Ordem de compra enviada para aprovação financeira",
        source_module="compras",
        reference_id=order.id,
    )
    return compras_repo.submit_for_approval(db, order_id)


def approve_order(db: Session, order_id: UUID) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)
    if order.status != PurchaseOrderStatus.AGUARDANDO_APROVACAO_FINANCEIRO:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens aguardando aprovação podem ser aprovadas",
        )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description="Ordem de compra aprovada pelo financeiro",
        source_module="compras",
        reference_id=order.id,
    )
    return compras_repo.approve_order(db, order_id)


def cancel_order_financial(db: Session, order_id: UUID, note: str) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)
    if order.status != PurchaseOrderStatus.AGUARDANDO_APROVACAO_FINANCEIRO:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens aguardando aprovação podem ser recusadas pelo financeiro",
        )
    return compras_repo.cancel_order_financial(db, order_id, note)


def start_receipt(db: Session, order_id: UUID) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)
    if order.status != PurchaseOrderStatus.APROVADA:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens aprovadas podem iniciar a conferência",
        )
    return compras_repo.start_receipt(db, order_id)


def finalize_receipt(
    db: Session,
    order_id: UUID,
    items: list[PurchaseOrderReceiptItem],
) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)
    if order.status != PurchaseOrderStatus.EM_CONFERENCIA:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens em conferência podem ser finalizadas",
        )

    # Build map of receipts by item id for validation
    receipts_by_item = {r.purchase_order_item_id: r for r in order.receipts}
    for payload in items:
        receipt = receipts_by_item.get(payload.purchase_order_item_id)
        if not receipt:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Item de conferência não encontrado: "
                    f"{payload.purchase_order_item_id}"
                ),
            )
        total = Decimal(str(payload.quantity_accepted)) + Decimal(
            str(payload.quantity_rejected)
        )
        if total > Decimal(str(receipt.quantity_ordered)):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Quantidade aceita + recusada não pode exceder a quantidade pedida"
                ),
            )
        if Decimal(str(payload.quantity_rejected)) > 0 and not payload.rejection_reason:
            raise HTTPException(
                status_code=400,
                detail="Motivo da recusa é obrigatório quando há quantidade recusada",
            )

    updated = compras_repo.finalize_receipt(db, order_id, items)
    supplier = _get_supplier_or_404(db, order.supplier_id)

    receipt_total = Decimal(updated.receipt_total_amount or 0)
    installments = updated.installments or 1
    if receipt_total > 0:
        if installments <= 1:
            fin_service.criar_conta_pagar(
                db,
                description=(
                    f"Ordem de compra #{order.id} — {supplier.name} (itens aceitos)"
                ),
                amount=receipt_total,
                due_date=date.today() + timedelta(days=30),
                supplier_id=order.supplier_id,
                source_module="compras",
                reference_id=order.id,
                notes=order.notes,
            )
        else:
            base_share = (receipt_total / Decimal(installments)).quantize(
                Decimal("0.01")
            )
            last_share = receipt_total - (base_share * (installments - 1))
            interval = updated.installment_interval_days or 30
            first_due = updated.first_due_date or date.today() + timedelta(days=30)
            for idx in range(installments):
                amount = last_share if idx == installments - 1 else base_share
                due = first_due + timedelta(days=interval * idx)
                fin_service.criar_conta_pagar(
                    db,
                    description=(
                        f"Ordem de compra #{order.id} — {supplier.name} "
                        f"(parcela {idx + 1}/{installments})"
                    ),
                    amount=amount,
                    due_date=due,
                    supplier_id=order.supplier_id,
                    source_module="compras",
                    reference_id=order.id,
                    notes=order.notes,
                    installment_number=idx + 1,
                    installment_total=installments,
                )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description="Conferência finalizada — aguardando pagamento",
        source_module="compras",
        reference_id=order.id,
    )
    return compras_repo.get_order_with_receipts(db, order_id)


def get_order_with_receipts(db: Session, order_id: UUID) -> PurchaseOrder:
    order = compras_repo.get_order_with_receipts(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de compra não encontrada")
    return order


def list_orders_for_receipt(db: Session) -> list[PurchaseOrder]:
    return compras_repo.list_orders_for_receipt(db)


def complete_order_after_payment(db: Session, order_id: UUID) -> PurchaseOrder:
    """
    Chamada pelo Financeiro quando a conta a pagar vinculada à ordem é paga.
    Registra entradas no estoque (apenas qty_accepted > 0), gera NF de
    recebimento e, se houver itens recusados, NF de devolução; por fim, move
    a ordem para CONCLUIDA.
    """
    from app.modules.faturamento import service as fat_service

    order = compras_repo.get_order_with_receipts(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de compra não encontrada")

    if order.status == PurchaseOrderStatus.CONCLUIDA:
        # Parcelamento: estoque + NF já registrados no pagamento da 1ª parcela.
        # Demais pagamentos não disparam novamente o fluxo de conclusão.
        return order

    if order.status != PurchaseOrderStatus.AGUARDANDO_PAGAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Ordem não está aguardando pagamento",
        )

    items_by_id = {item.id: item for item in order.items}
    has_accepted = False
    has_rejected = False

    for receipt in order.receipts:
        order_item = items_by_id.get(receipt.purchase_order_item_id)
        if not order_item:
            continue
        qty_accepted = Decimal(str(receipt.quantity_accepted))
        if qty_accepted > 0:
            has_accepted = True
            estoque_service.registrar_entrada(
                db,
                stock_item_id=order_item.stock_item_id,
                quantity=qty_accepted,
                unit_cost=Decimal(str(order_item.unit_price)),
                description=f"Recebimento ordem #{order.id}",
                source_module="compras",
                reference_id=order.id,
            )
        if Decimal(str(receipt.quantity_rejected)) > 0:
            has_rejected = True

    if has_accepted:
        fat_service.criar_nota_recebimento(db, order.id)
    if has_rejected:
        fat_service.criar_nota_devolucao(db, order.id)

    return compras_repo.complete_order(db, order_id)


def soft_delete_order(db: Session, order_id: UUID) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)

    if order.status != PurchaseOrderStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens em andamento podem ser excluídas",
        )

    return compras_repo.soft_delete_order(db, order_id)
