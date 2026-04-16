from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.faturamento import repository as fat_repo
from app.modules.faturamento.model import Invoice
from app.modules.faturamento.schemas import InvoiceCreate
from app.shared.enums import FinancialCategory, InvoiceStatus, MovementType


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_invoice_or_404(db: Session, invoice_id: UUID) -> Invoice:
    invoice = fat_repo.get_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    return invoice


def _get_client_name(db: Session, client_id: UUID) -> str:
    from app.modules.comercial.model import Client
    client = db.query(Client).filter(Client.id == client_id).first()
    return client.name if client else ""


# ---------------------------------------------------------------------------
# Public function — called by Comercial when creating a sale
# ---------------------------------------------------------------------------


def criar_fatura(
    db: Session,
    *,
    sale_id: Optional[UUID] = None,
    client_id: UUID,
    items: list,
    total_amount: Decimal,
    source_module: str = "comercial",
) -> Invoice:
    """
    Create an invoice from a sale. Called by Comercial upon sale creation.
    items are SaleItem ORM objects with stock_item_id, quantity, unit_price, subtotal.
    """
    from app.modules.estoque.model import StockItem

    # Resolve stock_item names for invoice item descriptions
    stock_ids = [item.stock_item_id for item in items]
    stock_map: dict = {}
    if stock_ids:
        rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in rows}

    item_data_list = []
    for item in items:
        stock_item = stock_map.get(item.stock_item_id)
        description = stock_item.name if stock_item else f"Item {item.stock_item_id}"
        qty = Decimal(str(item.quantity))
        price = Decimal(str(item.unit_price))
        item_data_list.append(
            {
                "description": description,
                "quantity": qty,
                "unit_price": price,
                "subtotal": qty * price,
            }
        )

    invoice = fat_repo.create_invoice(
        db,
        client_id=client_id,
        items=item_data_list,
        total_amount=Decimal(str(total_amount)),
        sale_id=sale_id,
        due_date=date.today() + timedelta(days=30),
    )

    # Register internal financial movement (R$0.00 — fatura emitida)
    from app.modules.financeiro import service as fin_service
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.VENDA,
        amount=Decimal("0"),
        description=f"Fatura emitida: {invoice.number}",
        source_module="faturamento",
        reference_id=invoice.id,
    )

    return invoice


# ---------------------------------------------------------------------------
# Manual invoice creation
# ---------------------------------------------------------------------------


def create_manual_invoice(db: Session, data: InvoiceCreate) -> Invoice:
    from app.modules.comercial.model import Client
    from app.modules.financeiro import service as fin_service

    # Validate client exists
    client = db.query(Client).filter(Client.id == data.client_id, Client.deleted_at.is_(None)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # Build item data list
    item_data_list = []
    total_amount = Decimal("0")
    for item in data.items:
        qty = Decimal(str(item.quantity))
        price = Decimal(str(item.unit_price))
        subtotal = qty * price
        total_amount += subtotal
        item_data_list.append(
            {
                "description": item.description,
                "quantity": qty,
                "unit_price": price,
                "subtotal": subtotal,
            }
        )

    due_date = data.due_date or (date.today() + timedelta(days=30))

    invoice = fat_repo.create_invoice(
        db,
        client_id=data.client_id,
        items=item_data_list,
        total_amount=total_amount,
        sale_id=None,
        due_date=due_date,
        notes=data.notes,
    )

    # Create account receivable
    fin_service.criar_conta_receber(
        db,
        client_id=data.client_id,
        description=f"Fatura manual {invoice.number}",
        amount=total_amount,
        due_date=due_date,
        source_module="faturamento",
        reference_id=invoice.id,
    )

    # Register internal financial movement (R$0.00 — rastreabilidade)
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.VENDA,
        amount=Decimal("0"),
        description=f"Fatura manual emitida: {invoice.number}",
        source_module="faturamento",
        reference_id=invoice.id,
    )

    return invoice


# ---------------------------------------------------------------------------
# Listing & retrieval
# ---------------------------------------------------------------------------


def list_invoices(
    db: Session,
    *,
    status: Optional[InvoiceStatus] = None,
    client_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Invoice]:
    return fat_repo.list_invoices(
        db, status=status, client_id=client_id, skip=skip, limit=limit
    )


def get_invoice(db: Session, invoice_id: UUID) -> Invoice:
    return _get_invoice_or_404(db, invoice_id)


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------


def update_status(db: Session, invoice_id: UUID, new_status: InvoiceStatus) -> Invoice:
    from app.modules.financeiro import service as fin_service

    invoice = _get_invoice_or_404(db, invoice_id)

    final_statuses = (InvoiceStatus.PAGA, InvoiceStatus.CANCELADA)
    if invoice.status in final_statuses:
        raise HTTPException(
            status_code=400,
            detail="Fatura já finalizada, status não pode ser alterado",
        )

    if new_status == InvoiceStatus.PAGA:
        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.ENTRADA,
            category=FinancialCategory.RECEBIMENTO,
            amount=Decimal(str(invoice.total_amount)),
            description=f"Pagamento de fatura {invoice.number}",
            source_module="faturamento",
            reference_id=invoice.id,
        )
    elif new_status == InvoiceStatus.CANCELADA:
        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.SAIDA,
            category=FinancialCategory.AJUSTE,
            amount=Decimal("0"),
            description=f"Fatura cancelada: {invoice.number}",
            source_module="faturamento",
            reference_id=invoice.id,
        )

    return fat_repo.update_invoice_status(db, invoice_id, new_status)


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------


def soft_delete_invoice(db: Session, invoice_id: UUID) -> Invoice:
    invoice = _get_invoice_or_404(db, invoice_id)

    if invoice.status != InvoiceStatus.EMITIDA:
        raise HTTPException(
            status_code=400,
            detail="Apenas faturas com status 'Emitida' podem ser excluídas",
        )

    result = fat_repo.soft_delete_invoice(db, invoice_id)
    return result
