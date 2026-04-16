from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.faturamento.model import Invoice, InvoiceItem
from app.shared.enums import InvoiceStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def next_number(db: Session) -> str:
    """Generate the next invoice number (INV-0001, INV-0002, ...)."""
    count = db.query(func.count(Invoice.id)).scalar() or 0
    return f"INV-{count + 1:04d}"


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


def create_invoice(
    db: Session,
    *,
    client_id: UUID,
    items: list,  # list of dicts with description, quantity, unit_price, subtotal
    total_amount: Decimal,
    sale_id: Optional[UUID] = None,
    due_date=None,
    notes: Optional[str] = None,
) -> Invoice:
    from datetime import date

    invoice = Invoice(
        number=next_number(db),
        client_id=client_id,
        sale_id=sale_id,
        issue_date=date.today(),
        due_date=due_date,
        total_amount=total_amount,
        notes=notes,
        status=InvoiceStatus.EMITIDA,
    )
    db.add(invoice)
    db.flush()

    for item_data in items:
        invoice_item = InvoiceItem(
            invoice_id=invoice.id,
            description=item_data["description"],
            quantity=item_data["quantity"],
            unit_price=item_data["unit_price"],
            subtotal=item_data["subtotal"],
        )
        db.add(invoice_item)

    db.commit()
    db.refresh(invoice)
    # Eager load items
    _ = invoice.items
    return invoice


def list_invoices(
    db: Session,
    *,
    status: Optional[InvoiceStatus] = None,
    client_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Invoice]:
    query = db.query(Invoice).filter(Invoice.deleted_at.is_(None))
    if status:
        query = query.filter(Invoice.status == status)
    if client_id:
        query = query.filter(Invoice.client_id == client_id)
    invoices = (
        query.order_by(Invoice.issue_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for inv in invoices:
        _ = inv.items
    return invoices


def get_invoice(db: Session, invoice_id: UUID) -> Optional[Invoice]:
    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == invoice_id, Invoice.deleted_at.is_(None))
        .first()
    )
    if invoice:
        _ = invoice.items
    return invoice


def update_invoice_status(db: Session, invoice_id: UUID, status: InvoiceStatus) -> Optional[Invoice]:
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        return None
    invoice.status = status
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    _ = invoice.items
    return invoice


def soft_delete_invoice(db: Session, invoice_id: UUID) -> Optional[Invoice]:
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        return None
    invoice.deleted_at = datetime.now(timezone.utc)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice
