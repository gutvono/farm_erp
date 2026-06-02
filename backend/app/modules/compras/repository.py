from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.compras.model import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderReceipt,
    Quotation,
    QuotationItem,
    QuotationProposal,
    QuotationProposalItem,
    Supplier,
)
from app.modules.compras.schemas import (
    PurchaseOrderCreate,
    QuotationCreate,
    QuotationProposalCreate,
    QuotationProposalUpdate,
    SupplierCreate,
    SupplierUpdate,
)
from app.modules.estoque.model import StockItem
from app.shared.enums import (
    PurchaseOrderReceiptStatus,
    PurchaseOrderStatus,
    QuotationStatus,
)


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


def create_supplier(db: Session, data: SupplierCreate) -> Supplier:
    supplier = Supplier(
        name=data.name,
        document=data.document,
        email=data.email,
        phone=data.phone,
        address=data.address,
        notes=data.notes,
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


def list_suppliers(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 100,
) -> list[Supplier]:
    return (
        db.query(Supplier)
        .filter(Supplier.deleted_at.is_(None))
        .order_by(Supplier.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_supplier(db: Session, supplier_id: UUID) -> Optional[Supplier]:
    return (
        db.query(Supplier)
        .filter(Supplier.id == supplier_id, Supplier.deleted_at.is_(None))
        .first()
    )


def update_supplier(db: Session, supplier_id: UUID, data: SupplierUpdate) -> Optional[Supplier]:
    supplier = get_supplier(db, supplier_id)
    if not supplier:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


def soft_delete_supplier(db: Session, supplier_id: UUID) -> Optional[Supplier]:
    supplier = get_supplier(db, supplier_id)
    if not supplier:
        return None
    supplier.deleted_at = datetime.now(timezone.utc)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


# ---------------------------------------------------------------------------
# Purchase Orders
# ---------------------------------------------------------------------------


def create_order(db: Session, data: PurchaseOrderCreate) -> PurchaseOrder:
    ordered_at = data.ordered_at or datetime.now(timezone.utc)

    if data.order_type == "servico":
        total_amount = Decimal(str(data.total_amount or 0))
        shipping = Decimal("0")
    else:
        items_total = sum(
            Decimal(str(item.quantity)) * Decimal(str(item.unit_price))
            for item in data.items
        )
        shipping = Decimal(str(data.shipping_cost or 0))
        total_amount = items_total + shipping

    order = PurchaseOrder(
        supplier_id=data.supplier_id,
        total_amount=total_amount,
        shipping_cost=shipping,
        ordered_at=ordered_at,
        notes=data.notes,
        order_type=data.order_type,
        service_description=data.service_description,
    )
    db.add(order)
    db.flush()  # get order.id before creating items

    for item_data in data.items:
        qty = Decimal(str(item_data.quantity))
        price = Decimal(str(item_data.unit_price))
        order_item = PurchaseOrderItem(
            purchase_order_id=order.id,
            stock_item_id=item_data.stock_item_id,
            description=item_data.description,
            quantity=qty,
            unit_price=price,
            subtotal=qty * price,
        )
        db.add(order_item)

    db.commit()
    db.refresh(order)
    _load_relations(db, order)
    return order


def list_orders(
    db: Session,
    *,
    status: Optional[PurchaseOrderStatus] = None,
    supplier_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[PurchaseOrder]:
    query = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.deleted_at.is_(None))
    )
    if status:
        query = query.filter(PurchaseOrder.status == status)
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    orders = (
        query.order_by(PurchaseOrder.ordered_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for order in orders:
        _load_relations(db, order)
    return orders


def get_order(db: Session, order_id: UUID) -> Optional[PurchaseOrder]:
    order = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == order_id, PurchaseOrder.deleted_at.is_(None))
        .first()
    )
    if order:
        _load_relations(db, order)
    return order


def update_order_status(
    db: Session, order_id: UUID, status: PurchaseOrderStatus
) -> Optional[PurchaseOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    order.status = status
    if status == PurchaseOrderStatus.CONCLUIDA:
        order.received_at = datetime.now(timezone.utc)
    db.add(order)
    db.commit()
    db.refresh(order)
    _load_relations(db, order)
    return order


def soft_delete_order(db: Session, order_id: UUID) -> Optional[PurchaseOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    order.deleted_at = datetime.now(timezone.utc)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_relations(db: Session, order: PurchaseOrder) -> None:
    """Eager-load supplier and stock_item name for each item (PurchaseOrderItem has no stock_item relationship)."""
    _ = order.supplier
    stock_ids = [item.stock_item_id for item in order.items]
    stock_map: dict = {}
    if stock_ids:
        rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in rows}
    for item in order.items:
        # Attach a transient stock_item attribute so PurchaseOrderItemOut.from_model() works
        item.__dict__["stock_item"] = stock_map.get(item.stock_item_id)


# ---------------------------------------------------------------------------
# Approval / Receipt flow
# ---------------------------------------------------------------------------


def _set_status(
    db: Session,
    order_id: UUID,
    status: PurchaseOrderStatus,
    *,
    extra_fields: Optional[dict] = None,
) -> Optional[PurchaseOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    order.status = status
    if extra_fields:
        for key, value in extra_fields.items():
            setattr(order, key, value)
    db.add(order)
    db.commit()
    db.refresh(order)
    _load_relations(db, order)
    return order


def submit_for_approval(db: Session, order_id: UUID) -> Optional[PurchaseOrder]:
    return _set_status(
        db, order_id, PurchaseOrderStatus.AGUARDANDO_APROVACAO_FINANCEIRO
    )


def approve_order(
    db: Session,
    order_id: UUID,
    *,
    payment_method: Optional[str] = None,
    installments: Optional[int] = None,
    first_due_date=None,
    installment_interval_days: Optional[int] = None,
) -> Optional[PurchaseOrder]:
    extra_fields: dict = {}
    if payment_method is not None:
        extra_fields["payment_method"] = payment_method
    if installments is not None:
        extra_fields["installments"] = installments
    if first_due_date is not None:
        extra_fields["first_due_date"] = first_due_date
    if installment_interval_days is not None:
        extra_fields["installment_interval_days"] = installment_interval_days
    return _set_status(
        db,
        order_id,
        PurchaseOrderStatus.APROVADA,
        extra_fields=extra_fields or None,
    )


def cancel_order_financial(
    db: Session, order_id: UUID, note: str
) -> Optional[PurchaseOrder]:
    return _set_status(
        db,
        order_id,
        PurchaseOrderStatus.CANCELADA,
        extra_fields={"financial_approval_note": note},
    )


def start_receipt(db: Session, order_id: UUID) -> Optional[PurchaseOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    order.status = PurchaseOrderStatus.EM_CONFERENCIA
    db.add(order)
    db.flush()

    for item in order.items:
        receipt = PurchaseOrderReceipt(
            purchase_order_id=order.id,
            purchase_order_item_id=item.id,
            quantity_ordered=item.quantity,
            quantity_accepted=Decimal("0"),
            quantity_rejected=Decimal("0"),
            status=PurchaseOrderReceiptStatus.PENDENTE,
        )
        db.add(receipt)

    db.commit()
    db.refresh(order)
    _load_order_with_receipts(db, order)
    return order


def finalize_receipt(
    db: Session,
    order_id: UUID,
    items: list,
) -> Optional[PurchaseOrder]:
    """
    items: list of objects with purchase_order_item_id, quantity_accepted,
    quantity_rejected, rejection_reason.
    """
    order = get_order(db, order_id)
    if not order:
        return None

    receipts = (
        db.query(PurchaseOrderReceipt)
        .filter(PurchaseOrderReceipt.purchase_order_id == order.id)
        .all()
    )
    receipts_by_item: dict = {r.purchase_order_item_id: r for r in receipts}

    order_items_by_id: dict = {oi.id: oi for oi in order.items}

    receipt_total = Decimal("0")
    for payload in items:
        receipt = receipts_by_item.get(payload.purchase_order_item_id)
        if not receipt:
            continue
        receipt.quantity_accepted = Decimal(str(payload.quantity_accepted))
        receipt.quantity_rejected = Decimal(str(payload.quantity_rejected))
        receipt.rejection_reason = payload.rejection_reason
        receipt.status = PurchaseOrderReceiptStatus.CONFERIDO
        db.add(receipt)

        order_item = order_items_by_id.get(receipt.purchase_order_item_id)
        if order_item:
            receipt_total += receipt.quantity_accepted * Decimal(str(order_item.unit_price))

    order.status = PurchaseOrderStatus.AGUARDANDO_PAGAMENTO
    order.receipt_total_amount = receipt_total
    db.add(order)
    db.commit()
    db.refresh(order)
    _load_order_with_receipts(db, order)
    return order


def complete_order(db: Session, order_id: UUID) -> Optional[PurchaseOrder]:
    return _set_status(
        db,
        order_id,
        PurchaseOrderStatus.CONCLUIDA,
        extra_fields={"received_at": datetime.now(timezone.utc)},
    )


def get_order_with_receipts(
    db: Session, order_id: UUID
) -> Optional[PurchaseOrder]:
    order = get_order(db, order_id)
    if not order:
        return None
    _load_order_with_receipts(db, order)
    return order


def list_orders_for_receipt(db: Session) -> list[PurchaseOrder]:
    orders = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.deleted_at.is_(None),
            PurchaseOrder.status.in_(
                [
                    PurchaseOrderStatus.APROVADA,
                    PurchaseOrderStatus.EM_CONFERENCIA,
                ]
            ),
            PurchaseOrder.order_type == "produto",
        )
        .order_by(PurchaseOrder.ordered_at.desc())
        .all()
    )
    for order in orders:
        _load_order_with_receipts(db, order)
    return orders


def _load_order_with_receipts(db: Session, order: PurchaseOrder) -> None:
    _load_relations(db, order)
    # Force load receipts and attach stock_item lookup to each receipt's item
    receipts = list(order.receipts)
    item_by_id = {item.id: item for item in order.items}
    for receipt in receipts:
        order_item = item_by_id.get(receipt.purchase_order_item_id)
        if order_item is not None:
            receipt.__dict__["purchase_order_item"] = order_item


# ---------------------------------------------------------------------------
# Quotations
# ---------------------------------------------------------------------------


def create_quotation(db: Session, data: QuotationCreate) -> Quotation:
    quotation = Quotation(
        order_type=data.order_type,
        service_description=data.service_description,
        notes=data.notes,
        status=QuotationStatus.EM_ANDAMENTO,
    )
    db.add(quotation)
    db.flush()  # get quotation.id before creating items

    for item_data in data.items:
        item = QuotationItem(
            quotation_id=quotation.id,
            stock_item_id=item_data.stock_item_id,
            quantity=Decimal(str(item_data.quantity)),
        )
        db.add(item)

    db.commit()
    db.refresh(quotation)
    _load_quotation_relations(db, quotation)
    return quotation


def list_quotations(
    db: Session,
    *,
    status: Optional[QuotationStatus] = None,
    order_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Quotation]:
    query = db.query(Quotation).filter(Quotation.deleted_at.is_(None))
    if status:
        query = query.filter(Quotation.status == status)
    if order_type:
        query = query.filter(Quotation.order_type == order_type)
    quotations = (
        query.order_by(Quotation.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for quotation in quotations:
        _load_quotation_relations(db, quotation)
    return quotations


def get_quotation(db: Session, quotation_id: UUID) -> Optional[Quotation]:
    quotation = (
        db.query(Quotation)
        .filter(Quotation.id == quotation_id, Quotation.deleted_at.is_(None))
        .first()
    )
    if quotation:
        _load_quotation_relations(db, quotation)
    return quotation


def soft_delete_quotation(db: Session, quotation_id: UUID) -> Optional[Quotation]:
    quotation = get_quotation(db, quotation_id)
    if not quotation:
        return None
    quotation.deleted_at = datetime.now(timezone.utc)
    db.add(quotation)
    db.commit()
    db.refresh(quotation)
    return quotation


def _set_quotation_status(
    db: Session,
    quotation_id: UUID,
    status: QuotationStatus,
    *,
    extra_fields: Optional[dict] = None,
) -> Optional[Quotation]:
    quotation = get_quotation(db, quotation_id)
    if not quotation:
        return None
    quotation.status = status
    if extra_fields:
        for key, value in extra_fields.items():
            setattr(quotation, key, value)
    db.add(quotation)
    db.commit()
    db.refresh(quotation)
    _load_quotation_relations(db, quotation)
    return quotation


def _load_quotation_relations(db: Session, quotation: Quotation) -> None:
    """Eager-load items (with stock_item name), proposals (with supplier and
    proposal_items) and the winning proposal for serialization."""
    # Items: attach stock_item lookup
    stock_ids = [item.stock_item_id for item in quotation.items]
    stock_map: dict = {}
    if stock_ids:
        rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in rows}
    for item in quotation.items:
        item.__dict__["stock_item"] = stock_map.get(item.stock_item_id)

    # Proposals: force-load supplier and proposal_items of each proposal
    for proposal in quotation.proposals:
        _ = proposal.supplier
        _ = list(proposal.proposal_items)

    # Winning proposal
    _ = quotation.winning_proposal


# ---------------------------------------------------------------------------
# Quotation Proposals
# ---------------------------------------------------------------------------


def add_proposal(
    db: Session, quotation_id: UUID, data: QuotationProposalCreate
) -> QuotationProposal:
    proposal = QuotationProposal(
        quotation_id=quotation_id,
        supplier_id=data.supplier_id,
        total_price=(
            Decimal(str(data.total_price)) if data.total_price is not None else None
        ),
        notes=data.notes,
    )
    db.add(proposal)
    db.flush()  # get proposal.id before creating items

    for item_data in data.proposal_items:
        proposal_item = QuotationProposalItem(
            proposal_id=proposal.id,
            quotation_item_id=item_data.quotation_item_id,
            unit_price=Decimal(str(item_data.unit_price)),
        )
        db.add(proposal_item)

    db.commit()
    db.refresh(proposal)
    _ = proposal.supplier
    _ = list(proposal.proposal_items)
    return proposal


def get_proposal(db: Session, proposal_id: UUID) -> Optional[QuotationProposal]:
    proposal = (
        db.query(QuotationProposal)
        .filter(QuotationProposal.id == proposal_id)
        .first()
    )
    if proposal:
        _ = proposal.supplier
        _ = list(proposal.proposal_items)
    return proposal


def update_proposal(
    db: Session, proposal_id: UUID, data: QuotationProposalUpdate
) -> Optional[QuotationProposal]:
    proposal = get_proposal(db, proposal_id)
    if not proposal:
        return None

    payload = data.model_dump(exclude_unset=True)
    if "supplier_id" in payload and payload["supplier_id"] is not None:
        proposal.supplier_id = payload["supplier_id"]
    if "total_price" in payload:
        proposal.total_price = (
            Decimal(str(payload["total_price"]))
            if payload["total_price"] is not None
            else None
        )
    if "notes" in payload:
        proposal.notes = payload["notes"]

    if data.proposal_items is not None:
        # Regenerate proposal items: orphan-delete existing, flush so the DELETEs
        # hit the DB before the new INSERTs (evita violar uq_qpi_proposal_item
        # quando o mesmo quotation_item_id é reutilizado).
        proposal.proposal_items.clear()
        db.flush()
        for item_data in data.proposal_items:
            proposal.proposal_items.append(
                QuotationProposalItem(
                    quotation_item_id=item_data.quotation_item_id,
                    unit_price=Decimal(str(item_data.unit_price)),
                )
            )

    db.commit()
    db.refresh(proposal)
    _ = proposal.supplier
    _ = list(proposal.proposal_items)
    return proposal


def delete_proposal(db: Session, proposal_id: UUID) -> bool:
    proposal = (
        db.query(QuotationProposal)
        .filter(QuotationProposal.id == proposal_id)
        .first()
    )
    if not proposal:
        return False
    db.delete(proposal)
    db.commit()
    return True
