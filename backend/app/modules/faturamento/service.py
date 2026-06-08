import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.faturamento import repository as fat_repo
from app.modules.faturamento.model import Invoice
from app.modules.faturamento.schemas import InvoiceCreate
from app.shared.enums import FinancialCategory, InvoiceStatus, MovementType, SaleStatus


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


def _build_sale_invoice_items(db: Session, items: list) -> list[dict]:
    """Build invoice item dicts from SaleItem ORM objects, resolving stock names."""
    from app.modules.estoque.model import StockItem

    stock_ids = [item.stock_item_id for item in items]
    stock_map: dict = {}
    if stock_ids:
        rows = db.query(StockItem).filter(StockItem.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in rows}

    item_data_list: list[dict] = []
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
    return item_data_list


def _calcular_vencimentos(
    first_due_date: date, installments: int, interval_days: int
) -> list[date]:
    """Generate due dates for each installment based on the first date + interval."""
    return [
        first_due_date + timedelta(days=interval_days * idx)
        for idx in range(installments)
    ]


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
    item_data_list = _build_sale_invoice_items(db, items)

    invoice = fat_repo.create_invoice(
        db,
        client_id=client_id,
        items=item_data_list,
        total_amount=Decimal(str(total_amount)),
        sale_id=sale_id,
        due_date=date.today() + timedelta(days=30),
        invoice_type="venda",
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


def criar_faturas_parceladas(
    db: Session,
    *,
    sale_id: UUID,
    client_id: UUID,
    items: list,
    total_amount: Decimal,
    installments: int,
    first_due_date: date,
    installment_interval_days: int,
) -> list[Invoice]:
    """
    Create one invoice per installment, splitting total_amount equally.
    Last installment absorbs centavo residual. parent_invoice_id of all
    subsequent invoices points to the first one in the chain.
    """
    from app.modules.financeiro import service as fin_service

    total = Decimal(str(total_amount))
    base_share = (total / Decimal(installments)).quantize(Decimal("0.01"))
    last_share = total - (base_share * (installments - 1))
    due_dates = _calcular_vencimentos(
        first_due_date, installments, installment_interval_days
    )
    item_data_list = _build_sale_invoice_items(db, items)

    created: list[Invoice] = []
    parent_id: Optional[UUID] = None
    for idx in range(installments):
        amount = last_share if idx == installments - 1 else base_share
        invoice = fat_repo.create_invoice(
            db,
            client_id=client_id,
            items=item_data_list,
            total_amount=amount,
            sale_id=sale_id,
            due_date=due_dates[idx],
            invoice_type="venda",
            installment_number=idx + 1,
            installment_total=installments,
            parent_invoice_id=parent_id,
        )
        if idx == 0:
            parent_id = invoice.id
        created.append(invoice)

        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.ENTRADA,
            category=FinancialCategory.VENDA,
            amount=Decimal("0"),
            description=(
                f"Fatura emitida: {invoice.number} "
                f"(parcela {idx + 1}/{installments})"
            ),
            source_module="faturamento",
            reference_id=invoice.id,
        )

    return created


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
        invoice_type="venda",
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
    order_id: Optional[UUID] = None,
    sale_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Invoice]:
    return fat_repo.list_invoices(
        db,
        status=status,
        client_id=client_id,
        order_id=order_id,
        sale_id=sale_id,
        skip=skip,
        limit=limit,
    )


def get_invoice(db: Session, invoice_id: UUID) -> Invoice:
    return _get_invoice_or_404(db, invoice_id)


def get_invoices_by_sale(db: Session, sale_id: UUID) -> list[Invoice]:
    """Lista todas as NFs vinculadas a uma venda (qualquer tipo/status).

    Ponto de integração para o Comercial localizar a NF de venda e acionar o
    cancelamento (``cancelar_fatura``) sem acessar o repository do Faturamento
    diretamente — a integração entre módulos passa pelo Service.
    """
    return fat_repo.list_invoices_by_sale(db, sale_id)


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
# Cancellation with reversal (Demanda 1)
# ---------------------------------------------------------------------------


def _extract_uuid_from_notes(notes: Optional[str], key: str) -> Optional[UUID]:
    """Extract ``{key}=<uuid>`` from an invoice ``notes`` field (e.g. order_id)."""
    if not notes:
        return None
    match = re.search(rf"{key}=([0-9a-fA-F-]{{36}})", notes)
    if not match:
        return None
    try:
        return UUID(match.group(1))
    except ValueError:
        return None


def _mark_cancelled(db: Session, invoice: Invoice, reason: Optional[str]) -> Invoice:
    return fat_repo.cancel_invoice(db, invoice.id, reason=reason)


def cancelar_fatura(
    db: Session, invoice_id: UUID, *, reason: Optional[str] = None
) -> Invoice:
    """Cancel an invoice, reversing its effects according to ``invoice_type``.

    Despatches per type (venda/recebimento/transporte/devolucao). Allowed from
    ``emitida`` and ``paga``; blocked (400) if already ``cancelada``. The
    cancellation flag (status + cancelled_at) guards against double reversal.
    """
    invoice = _get_invoice_or_404(db, invoice_id)

    if invoice.status == InvoiceStatus.CANCELADA:
        raise HTTPException(status_code=400, detail="Nota fiscal já está cancelada")

    invoice_type = (invoice.invoice_type or "venda").lower()

    if invoice_type == "venda":
        _cancelar_nf_venda(db, invoice, reason)
    elif invoice_type == "recebimento":
        _cancelar_nf_recebimento(db, invoice, reason)
    elif invoice_type == "transporte":
        _cancelar_nf_transporte(db, invoice, reason)
    elif invoice_type == "devolucao":
        _cancelar_nf_devolucao(db, invoice, reason)
    elif invoice_type == "servico":
        _cancelar_nf_servico(db, invoice, reason)
    else:
        # Unknown type: only register a R$0 traceability movement + mark cancelled.
        from app.modules.financeiro import service as fin_service

        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.SAIDA,
            category=FinancialCategory.AJUSTE,
            amount=Decimal("0"),
            description=f"Cancelamento de nota fiscal {invoice.number}",
            source_module="faturamento",
            reference_id=invoice.id,
        )
        _mark_cancelled(db, invoice, reason)

    # Reload after the cascade of commits to return the cancelled invoice.
    return _get_invoice_or_404(db, invoice_id)


def _cancelar_nf_venda(db: Session, invoice: Invoice, reason: Optional[str]) -> None:
    """End-to-end cancellation (D4): return stock, cancel sale, cancel receivables."""
    from app.modules.comercial import service as comercial_service
    from app.modules.comercial.model import Sale
    from app.modules.estoque import service as estoque_service
    from app.modules.financeiro import service as fin_service

    estorno_desc = f"Estorno cancelamento NF {invoice.number}"

    sale_id = invoice.sale_id
    if sale_id is None:
        # Manual sale invoice (no sale record): cancel its receivable(s) + mark.
        fin_service.cancelar_contas_receber(
            db,
            invoice_id=invoice.id,
            estorno_descricao=estorno_desc,
            estorno_reference_id=invoice.id,
        )
        _mark_cancelled(db, invoice, reason)
        return

    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(
            status_code=404, detail="Venda associada à nota não encontrada"
        )

    # 1. Return each sold item to stock. unit_cost=0 → entrada gera ajuste R$0,
    # sem movimento de "compra" e sem alterar o CMP (o lado financeiro é tratado
    # pelas contas a receber). reference_id=sale.id para rastreabilidade.
    for item in sale.items:
        estoque_service.registrar_entrada(
            db,
            stock_item_id=item.stock_item_id,
            quantity=Decimal(str(item.quantity)),
            unit_cost=Decimal("0"),
            description=f"{estorno_desc} — devolução ao estoque",
            source_module="faturamento",
            reference_id=sale.id,
        )

    # 2. Cancel the sale. Usa o setter interno (mark_sale_cancelled), e não
    # update_status, porque update_status agora recusa a transição para
    # CANCELADA pelo caminho público (Demanda 7) — o estorno é orquestrado aqui.
    if sale.status != SaleStatus.CANCELADA:
        comercial_service.mark_sale_cancelled(db, sale.id)

    # 3. Cancel all receivables of the sale (+ reverse any amount already received).
    fin_service.cancelar_contas_receber(
        db,
        sale_id=sale.id,
        estorno_descricao=estorno_desc,
        estorno_reference_id=invoice.id,
    )

    # 4. Mark every invoice of the chain (same sale_id) cancelled. A transport NF
    # of this sale also gets its freight reversed.
    chain = (
        db.query(Invoice)
        .filter(Invoice.sale_id == sale.id, Invoice.deleted_at.is_(None))
        .all()
    )
    for sibling in chain:
        if sibling.status == InvoiceStatus.CANCELADA:
            continue
        if (sibling.invoice_type or "").lower() == "transporte":
            _estornar_frete_venda(db, sibling)
        _mark_cancelled(db, sibling, reason)


def _reverter_financeiro_ordem_compra(
    db: Session, order_id: UUID, *, descricao: str
) -> None:
    """Reverse the financial position of a purchase order (Demanda 1.1).

    Princípio "o dinheiro só se move no pagamento":
    - parte já PAGA da ordem → estorno ``ENTRADA/AJUSTE`` do valor pago;
    - parte EM ABERTO → cancela as contas a pagar (o dinheiro nunca saiu).

    Idempotente: o estorno só é registrado uma vez por ordem (guard
    ``existe_estorno_ordem``); cancelar contas já canceladas é no-op. Pode ser
    chamado a partir do cancelamento de qualquer NF de compra da mesma ordem
    (recebimento/transporte/serviço) sem duplicar.
    """
    from app.modules.financeiro import service as fin_service

    paid_total = fin_service.total_pago_por_ordem(db, order_id)
    if paid_total > 0 and not fin_service.existe_estorno_ordem(db, order_id):
        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.ENTRADA,
            category=FinancialCategory.AJUSTE,
            amount=paid_total,
            description=descricao,
            source_module="faturamento",
            reference_id=order_id,
        )
    fin_service.cancelar_contas_pagar_em_aberto_por_ordem(db, order_id)


def _cancelar_nf_recebimento(
    db: Session, invoice: Invoice, reason: Optional[str]
) -> None:
    """Cancel a receipt NF: always reverse stock; money only if already paid.

    Demanda 1.1: o estoque dos itens aceitos é SEMPRE estornado (saída). No
    financeiro, segue o princípio "dinheiro só se move no pagamento" via
    ``_reverter_financeiro_ordem_compra`` (estorna o pago, cancela o em aberto).
    """
    from app.modules.compras.model import PurchaseOrder
    from app.modules.estoque import service as estoque_service

    order_id = _extract_uuid_from_notes(invoice.notes, "order_id")

    # (a) Estoque: remove sempre as quantidades aceitas (saída não mexe em CMP).
    if order_id is not None:
        order = (
            db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
        )
        if order:
            items_by_id = {item.id: item for item in order.items}
            for receipt in order.receipts:
                qty = Decimal(str(receipt.quantity_accepted))
                if qty <= 0:
                    continue
                order_item = items_by_id.get(receipt.purchase_order_item_id)
                if not order_item:
                    continue
                estoque_service.registrar_saida(
                    db,
                    stock_item_id=order_item.stock_item_id,
                    quantity=qty,
                    unit_cost=Decimal("0"),
                    description=f"Estorno NF recebimento {invoice.number} — saída do estoque",
                    source_module="faturamento",
                    reference_id=invoice.id,
                )

        # (b) Financeiro: estorno do pago / cancelamento das contas em aberto.
        _reverter_financeiro_ordem_compra(
            db, order_id, descricao=f"Estorno NF recebimento {invoice.number}"
        )

    _mark_cancelled(db, invoice, reason)


def _estornar_frete_venda(db: Session, invoice: Invoice) -> None:
    """Reverse the freight of a SALE transport NF (SAIDA/AJUSTE, no stock)."""
    from app.modules.financeiro import service as fin_service

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.AJUSTE,
        amount=Decimal(str(invoice.total_amount)),
        description=f"Estorno NF transporte {invoice.number}",
        source_module="faturamento",
        reference_id=invoice.id,
    )


def _cancelar_nf_transporte(
    db: Session, invoice: Invoice, reason: Optional[str]
) -> None:
    """Cancel a transport NF.

    - VENDA (``sale_id`` no notes): estorno do frete (SAIDA/AJUSTE).
    - COMPRA (``order_id`` no notes): o frete está embutido na(s) conta(s) a
      pagar da ordem, então o tratamento financeiro segue o mesmo princípio do
      recebimento (estorna o pago, cancela o em aberto) via
      ``_reverter_financeiro_ordem_compra`` — idempotente, sem duplicar se a NF
      de recebimento da mesma ordem também for cancelada. Sem efeito de estoque.
    """
    order_id = _extract_uuid_from_notes(invoice.notes, "order_id")
    if order_id is not None:
        _reverter_financeiro_ordem_compra(
            db, order_id, descricao=f"Estorno NF transporte {invoice.number}"
        )
    else:
        _estornar_frete_venda(db, invoice)
    _mark_cancelled(db, invoice, reason)


def _cancelar_nf_servico(
    db: Session, invoice: Invoice, reason: Optional[str]
) -> None:
    """Cancel a service NF (Demanda 1.1): no stock; money only if already paid.

    Segue o princípio "dinheiro só se move no pagamento" via
    ``_reverter_financeiro_ordem_compra``.
    """
    order_id = _extract_uuid_from_notes(invoice.notes, "order_id")
    if order_id is not None:
        _reverter_financeiro_ordem_compra(
            db, order_id, descricao=f"Estorno NF serviço {invoice.number}"
        )
    _mark_cancelled(db, invoice, reason)


def _cancelar_nf_devolucao(
    db: Session, invoice: Invoice, reason: Optional[str]
) -> None:
    """Rejected goods re-enter stock as AVARIADO items (idempotent by SKU)."""
    from app.modules.compras.model import PurchaseOrder
    from app.modules.estoque import repository as estoque_repo
    from app.modules.estoque import service as estoque_service

    order_id = _extract_uuid_from_notes(invoice.notes, "order_id")
    if order_id is not None:
        order = (
            db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
        )
        if order:
            items_by_id = {item.id: item for item in order.items}
            for receipt in order.receipts:
                qty = Decimal(str(receipt.quantity_rejected))
                if qty <= 0:
                    continue
                order_item = items_by_id.get(receipt.purchase_order_item_id)
                if not order_item:
                    continue
                original = estoque_repo.get_item(db, order_item.stock_item_id)
                if not original:
                    continue
                damaged = estoque_service.obter_ou_criar_item_avariado(db, original)
                estoque_service.registrar_entrada(
                    db,
                    stock_item_id=damaged.id,
                    quantity=qty,
                    unit_cost=Decimal("0"),
                    description=f"Devolução avariada NF {invoice.number}",
                    source_module="faturamento",
                    reference_id=invoice.id,
                )

    _mark_cancelled(db, invoice, reason)


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
_NF_TRANSPORTE_PREFIX = "[NF-TRANSPORTE]"
_NF_SERVICO_PREFIX = "[NF-SERVICO]"
_NF_FOLHA_PREFIX = "[NF-FOLHA]"


def _build_purchase_notes(prefix: str, order_id: UUID, supplier_name: str, extra: str = "") -> str:
    base = f"{prefix} order_id={order_id} — {supplier_name}"
    if extra:
        base = f"{base} — {extra}"
    return base


def existe_nota_recebimento(db: Session, order_id: UUID) -> bool:
    """True if a receipt NF (any status) already exists for the purchase order.

    Used by Compras to keep conference-time NF/stock emission idempotent.
    """
    exists = (
        db.query(Invoice.id)
        .filter(
            Invoice.invoice_type == "recebimento",
            Invoice.notes.ilike(f"%order_id={order_id}%"),
        )
        .first()
    )
    return exists is not None


def criar_nota_servico(db: Session, order_id: UUID) -> Invoice:
    """Emit a service NF (invoice_type='servico') for a service purchase order.

    Demanda 1.1: o documento fiscal de serviço é emitido no ACEITE
    (/concluir-servico ou conferência), nunca no pagamento. Idempotente: não
    emite uma 2ª NF se já houver uma para a ordem. ``client_id=None``; 1 item com
    a ``service_description``; ``total_amount`` da ordem; vencimento = primeiro
    vencimento da ordem (se houver) ou hoje. Registra movimento R$0 (o débito
    real é o pagamento da conta a pagar).
    """
    from app.modules.compras.model import PurchaseOrder, Supplier
    from app.modules.financeiro import service as fin_service

    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de compra não encontrada")

    existing = (
        db.query(Invoice)
        .filter(
            Invoice.deleted_at.is_(None),
            Invoice.invoice_type == "servico",
            Invoice.notes.ilike(f"%order_id={order_id}%"),
        )
        .first()
    )
    if existing:
        return existing

    supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
    supplier_name = supplier.name if supplier else ""
    service_description = order.service_description or "Serviço contratado"
    total_amount = Decimal(str(order.total_amount or 0))

    invoice_items = [
        {
            "description": service_description,
            "quantity": Decimal("1"),
            "unit_price": total_amount,
            "subtotal": total_amount,
        }
    ]
    notes = _build_purchase_notes(
        _NF_SERVICO_PREFIX, order.id, supplier_name, service_description
    )

    invoice = fat_repo.create_invoice(
        db,
        client_id=None,
        items=invoice_items,
        total_amount=total_amount,
        sale_id=None,
        due_date=order.first_due_date or date.today(),
        notes=notes,
        invoice_type="servico",
    )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description=f"NF de serviço emitida: {invoice.number} — ordem #{order.id}",
        source_module="faturamento",
        reference_id=invoice.id,
    )

    return invoice


def criar_nota_folha(db: Session, entry, period) -> Invoice:
    """Emit a payroll NF (invoice_type='folha_pagamento') for a paid holerite.

    Demanda 4: chamada pelo Financeiro ao APROVAR uma solicitação de pagamento de
    folha — 1 NF por funcionário/holerite. Molde de ``criar_nota_servico``:
    ``client_id=None`` (não é cliente), ``total_amount = entry.net_amount``, 1 item
    "Salário MM/AAAA — {nome}". O vínculo ao holerite é o texto
    ``[NF-FOLHA] entry_id=<uuid> employee=<nome>`` em ``notes`` (mesmo estilo das
    NFs de compra). Registra movimento R$0 para rastreabilidade — o débito real é
    o ``saida/folha`` lançado pelo Financeiro na aprovação.
    """
    from app.modules.financeiro import service as fin_service
    from app.modules.folha.model import Employee

    employee = db.query(Employee).filter(Employee.id == entry.employee_id).first()
    employee_name = employee.name if employee else str(entry.employee_id)
    competency = f"{period.competency_month:02d}/{period.competency_year}"
    total_amount = Decimal(str(entry.net_amount or 0))

    description = f"Salário {competency} — {employee_name}"
    invoice_items = [
        {
            "description": description,
            "quantity": Decimal("1"),
            "unit_price": total_amount,
            "subtotal": total_amount,
        }
    ]
    notes = f"{_NF_FOLHA_PREFIX} entry_id={entry.id} employee={employee_name}"

    invoice = fat_repo.create_invoice(
        db,
        client_id=None,
        items=invoice_items,
        total_amount=total_amount,
        sale_id=None,
        due_date=date.today(),
        notes=notes,
        invoice_type="folha_pagamento",
    )

    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.FOLHA,
        amount=Decimal("0"),
        description=f"NF de folha emitida: {invoice.number} — {description}",
        source_module="faturamento",
        reference_id=invoice.id,
    )

    return invoice


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
        invoice_type="recebimento",
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
        invoice_type="devolucao",
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


def criar_nota_transporte(
    db: Session,
    *,
    shipping_cost: Decimal,
    sale_id: Optional[UUID] = None,
    order_id: Optional[UUID] = None,
    client_id: Optional[UUID] = None,
) -> Invoice:
    """
    Cria NF de transporte (1 item à vista com o custo de frete).
    Chamada pelo Comercial na criação da venda (sale_id preenchido, client_id do
    cliente) e pelo Compras em complete_order_after_payment (order_id preenchido,
    client_id=None).
    """
    from app.modules.financeiro import service as fin_service

    if sale_id:
        ref_label = f"Venda #{sale_id}"
        notes = f"{_NF_TRANSPORTE_PREFIX} sale_id={sale_id} — Custo de transporte — {ref_label}"
        movement_type = MovementType.ENTRADA
        category = FinancialCategory.VENDA
    else:
        ref_label = f"Ordem de compra #{order_id}"
        notes = f"{_NF_TRANSPORTE_PREFIX} order_id={order_id} — Custo de transporte — {ref_label}"
        movement_type = MovementType.SAIDA
        category = FinancialCategory.COMPRA

    invoice_items = [
        {
            "description": f"Custo de transporte — {ref_label}",
            "quantity": Decimal("1"),
            "unit_price": shipping_cost,
            "subtotal": shipping_cost,
        }
    ]

    invoice = fat_repo.create_invoice(
        db,
        client_id=client_id,
        items=invoice_items,
        total_amount=shipping_cost,
        sale_id=sale_id,
        due_date=date.today(),
        notes=notes,
        invoice_type="transporte",
    )

    fin_service.registrar_movimento(
        db,
        movement_type=movement_type,
        category=category,
        amount=Decimal("0"),
        description=f"NF de transporte emitida: {invoice.number}",
        source_module="faturamento",
        reference_id=invoice.id,
    )

    return invoice
