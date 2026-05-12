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


def _get_client_name(db: Session, client_id: Optional[UUID]) -> str:
    if client_id is None:
        return ""
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


# ---------------------------------------------------------------------------
# Public functions — fiscal notes for purchase orders
# ---------------------------------------------------------------------------


_NF_RECEBIMENTO_PREFIX = "[NF-RECEBIMENTO]"
_NF_DEVOLUCAO_PREFIX = "[NF-DEVOLUCAO]"


def _build_purchase_notes(prefix: str, order_id: UUID, supplier_name: str, extra: str = "") -> str:
    base = f"{prefix} order_id={order_id} — {supplier_name}"
    if extra:
        base = f"{base} — {extra}"
    return base


def criar_nota_recebimento(db: Session, order_id: UUID) -> Invoice:
    """
    Cria nota fiscal de recebimento a partir de uma ordem de compra.
    Considera apenas itens com quantity_accepted > 0.
    """
    from app.modules.compras.model import PurchaseOrder, PurchaseOrderItem, Supplier
    from app.modules.estoque.model import StockItem
    from app.modules.financeiro import service as fin_service

    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de compra não encontrada")

    supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
    supplier_name = supplier.name if supplier else ""

    items_by_id = {item.id: item for item in order.items}
    stock_ids = [item.stock_item_id for item in order.items]
    stock_map: dict = {}
    if stock_ids:
        rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in rows}

    invoice_items: list = []
    total_amount = Decimal("0")
    for receipt in order.receipts:
        if Decimal(receipt.quantity_accepted) <= 0:
            continue
        order_item = items_by_id.get(receipt.purchase_order_item_id)
        if not order_item:
            continue
        stock_item = stock_map.get(order_item.stock_item_id)
        name = stock_item.name if stock_item else f"Item {order_item.stock_item_id}"
        unit = stock_item.unit.value if stock_item and stock_item.unit else "un"
        qty = Decimal(str(receipt.quantity_accepted))
        price = Decimal(str(order_item.unit_price))
        subtotal = qty * price
        total_amount += subtotal
        invoice_items.append(
            {
                "description": f"{name} — {qty} {unit}",
                "quantity": qty,
                "unit_price": price,
                "subtotal": subtotal,
            }
        )

    if not invoice_items:
        raise HTTPException(
            status_code=400,
            detail="Nenhum item aceito na conferência para gerar nota de recebimento",
        )

    notes = _build_purchase_notes(
        _NF_RECEBIMENTO_PREFIX,
        order.id,
        supplier_name,
        f"Nota fiscal de recebimento — Ordem de compra #{order.id}",
    )

    invoice = fat_repo.create_invoice(
        db,
        client_id=None,
        items=invoice_items,
        total_amount=total_amount,
        sale_id=None,
        due_date=date.today(),
        notes=notes,
    )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description=f"NF de recebimento emitida: {invoice.number} — ordem #{order.id}",
        source_module="faturamento",
        reference_id=invoice.id,
    )

    return invoice


def criar_nota_devolucao(db: Session, order_id: UUID) -> Optional[Invoice]:
    """
    Cria nota fiscal de devolução vinculada à NF de recebimento da ordem.
    Considera apenas itens com quantity_rejected > 0.
    Retorna None se não houver itens rejeitados.
    """
    from app.modules.compras.model import PurchaseOrder, Supplier
    from app.modules.estoque.model import StockItem
    from app.modules.financeiro import service as fin_service

    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de compra não encontrada")

    supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
    supplier_name = supplier.name if supplier else ""

    # Locate the NF de recebimento (search via notes prefix containing order_id)
    recebimento = (
        db.query(Invoice)
        .filter(
            Invoice.deleted_at.is_(None),
            Invoice.notes.ilike(f"%{_NF_RECEBIMENTO_PREFIX}%order_id={order.id}%"),
        )
        .first()
    )

    items_by_id = {item.id: item for item in order.items}
    stock_ids = [item.stock_item_id for item in order.items]
    stock_map: dict = {}
    if stock_ids:
        rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in rows}

    invoice_items: list = []
    total_amount = Decimal("0")
    for receipt in order.receipts:
        if Decimal(receipt.quantity_rejected) <= 0:
            continue
        order_item = items_by_id.get(receipt.purchase_order_item_id)
        if not order_item:
            continue
        stock_item = stock_map.get(order_item.stock_item_id)
        name = stock_item.name if stock_item else f"Item {order_item.stock_item_id}"
        unit = stock_item.unit.value if stock_item and stock_item.unit else "un"
        qty = Decimal(str(receipt.quantity_rejected))
        price = Decimal(str(order_item.unit_price))
        subtotal = qty * price
        total_amount += subtotal
        reason = receipt.rejection_reason or "Não informado"
        invoice_items.append(
            {
                "description": f"DEVOLUÇÃO: {name} — {qty} {unit} — Motivo: {reason}",
                "quantity": qty,
                "unit_price": price,
                "subtotal": subtotal,
            }
        )

    if not invoice_items:
        return None

    linked = f"NF recebimento #{recebimento.number}" if recebimento else "sem NF recebimento prévia"
    notes = _build_purchase_notes(
        _NF_DEVOLUCAO_PREFIX,
        order.id,
        supplier_name,
        f"Devolução vinculada à {linked} — Fornecedor notificado",
    )

    invoice = fat_repo.create_invoice(
        db,
        client_id=None,
        items=invoice_items,
        total_amount=total_amount,
        sale_id=None,
        due_date=date.today(),
        notes=notes,
    )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description=f"NF de devolução emitida: {invoice.number} — ordem #{order.id}",
        source_module="faturamento",
        reference_id=invoice.id,
    )

    return invoice
