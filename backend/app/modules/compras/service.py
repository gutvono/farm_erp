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
    order = _get_order_or_404(db, order_id)

    # Final statuses cannot be changed
    final_statuses = (PurchaseOrderStatus.CONCLUIDA, PurchaseOrderStatus.CANCELADA)
    if order.status in final_statuses:
        raise HTTPException(
            status_code=400,
            detail="Ordem já finalizada, status não pode ser alterado",
        )

    if new_status == PurchaseOrderStatus.CONCLUIDA:
        supplier = _get_supplier_or_404(db, order.supplier_id)

        # 1. Register stock entry for each item
        for item in order.items:
            estoque_service.registrar_entrada(
                db,
                stock_item_id=item.stock_item_id,
                quantity=Decimal(item.quantity),
                unit_cost=Decimal(item.unit_price),
                description=f"Recebimento da ordem de compra #{order.id}",
                source_module="compras",
                reference_id=order.id,
            )

        # 2. Create account payable (due in 30 days)
        fin_service.criar_conta_pagar(
            db,
            description=f"Ordem de compra — {supplier.name}",
            amount=Decimal(order.total_amount),
            due_date=date.today() + timedelta(days=30),
            supplier_id=order.supplier_id,
            source_module="compras",
            reference_id=order.id,
            notes=order.notes,
        )

        # 3. Register financial movement (R$0.00 — internal traceability)
        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.SAIDA,
            category=FinancialCategory.COMPRA,
            amount=Decimal("0"),
            description=f"Ordem de compra concluída — {supplier.name}",
            source_module="compras",
            reference_id=order.id,
        )

    return compras_repo.update_order_status(db, order_id, new_status)


def soft_delete_order(db: Session, order_id: UUID) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)

    if order.status != PurchaseOrderStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens em andamento podem ser excluídas",
        )

    return compras_repo.soft_delete_order(db, order_id)
