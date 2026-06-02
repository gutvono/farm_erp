from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.compras import repository as compras_repo
from app.modules.compras.model import (
    PurchaseOrder,
    Quotation,
    QuotationProposal,
    Supplier,
)
from app.modules.compras.schemas import (
    PurchaseOrderCreate,
    PurchaseOrderItemCreate,
    PurchaseOrderReceiptItem,
    QuotationCreate,
    QuotationProposalCreate,
    QuotationProposalUpdate,
    RealizeOrderRequest,
    SupplierCreate,
    SupplierUpdate,
)
from app.modules.estoque import repository as estoque_repo
from app.modules.estoque import service as estoque_service
from app.modules.financeiro import service as fin_service
from app.shared.enums import (
    FinancialCategory,
    MovementType,
    PaymentMethod,
    PurchaseOrderStatus,
    QuotationStatus,
)


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

    # Service orders skip item validation
    if data.order_type == "produto":
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


def approve_order(
    db: Session,
    order_id: UUID,
    *,
    payment_method: PaymentMethod,
    installments: int = 1,
    first_due_date: Optional[date] = None,
    installment_interval_days: int = 30,
) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)
    if order.status != PurchaseOrderStatus.AGUARDANDO_APROVACAO_FINANCEIRO:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens aguardando aprovação podem ser aprovadas",
        )

    if payment_method == PaymentMethod.PARCELADO:
        if installments < 2:
            raise HTTPException(
                status_code=400,
                detail="Pagamento parcelado exige installments >= 2",
            )
        if first_due_date is None:
            raise HTTPException(
                status_code=400,
                detail="first_due_date é obrigatório para pagamento parcelado",
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
    return compras_repo.approve_order(
        db,
        order_id,
        payment_method=payment_method.value,
        installments=installments,
        first_due_date=first_due_date,
        installment_interval_days=installment_interval_days,
    )


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
    if (order.order_type or "produto") == "servico":
        raise HTTPException(
            status_code=400,
            detail="Ordens de serviço não passam pela conferência de estoque. Use o endpoint /concluir-servico.",
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

    # Service orders bypass item-by-item conferência and generate the conta a
    # pagar straight from the order total_amount.
    if (order.order_type or "produto") == "servico":
        updated = compras_repo._set_status(
            db, order_id, PurchaseOrderStatus.AGUARDANDO_PAGAMENTO
        )
        _gerar_contas_pagar_da_ordem(db, updated, amount=Decimal(updated.total_amount or 0))
        fin_service.registrar_movimento(
            db,
            movement_type=MovementType.SAIDA,
            category=FinancialCategory.COMPRA,
            amount=Decimal("0"),
            description="Conferência finalizada (serviço) — aguardando pagamento",
            source_module="compras",
            reference_id=order.id,
        )
        return compras_repo.get_order_with_receipts(db, order_id)

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

    receipt_total = Decimal(updated.receipt_total_amount or 0)
    shipping_cost = Decimal(str(updated.shipping_cost or 0))
    payable_amount = receipt_total + shipping_cost
    if payable_amount > 0:
        _gerar_contas_pagar_da_ordem(db, updated, amount=payable_amount)

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


def _gerar_contas_pagar_da_ordem(
    db: Session,
    order: PurchaseOrder,
    *,
    amount: Decimal,
) -> None:
    """Generate accounts payable for a purchase order based on payment_method/installments."""
    if amount <= 0:
        return
    supplier = _get_supplier_or_404(db, order.supplier_id)
    payment_method_raw = order.payment_method
    payment_method_value = (
        payment_method_raw.value
        if payment_method_raw is not None and hasattr(payment_method_raw, "value")
        else payment_method_raw
    )
    installments = order.installments or 1
    is_parcelado = payment_method_value == PaymentMethod.PARCELADO.value and installments > 1
    type_label = "serviço" if (order.order_type or "produto") == "servico" else "itens aceitos"

    if not is_parcelado:
        fin_service.criar_conta_pagar(
            db,
            description=(
                f"Ordem de compra #{order.id} — {supplier.name} ({type_label})"
            ),
            amount=amount,
            due_date=order.first_due_date or (date.today() + timedelta(days=30)),
            supplier_id=order.supplier_id,
            source_module="compras",
            reference_id=order.id,
            notes=order.notes,
            payment_method=payment_method_value,
        )
        return

    base_share = (amount / Decimal(installments)).quantize(Decimal("0.01"))
    last_share = amount - (base_share * (installments - 1))
    interval = order.installment_interval_days or 30
    first_due = order.first_due_date or date.today() + timedelta(days=30)
    for idx in range(installments):
        share = last_share if idx == installments - 1 else base_share
        due = first_due + timedelta(days=interval * idx)
        fin_service.criar_conta_pagar(
            db,
            description=(
                f"Ordem de compra #{order.id} — {supplier.name} "
                f"(parcela {idx + 1}/{installments})"
            ),
            amount=share,
            due_date=due,
            supplier_id=order.supplier_id,
            source_module="compras",
            reference_id=order.id,
            notes=order.notes,
            installment_number=idx + 1,
            installment_total=installments,
            payment_method=payment_method_value,
        )


def complete_service_order(db: Session, order_id: UUID) -> PurchaseOrder:
    """Encerra uma ordem de serviço (aprovada → aguardando_pagamento)."""
    order = _get_order_or_404(db, order_id)
    if (order.order_type or "produto") != "servico":
        raise HTTPException(
            status_code=400,
            detail="Endpoint disponível apenas para ordens de serviço",
        )
    if order.status != PurchaseOrderStatus.APROVADA:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens de serviço aprovadas podem ser concluídas",
        )

    updated = compras_repo._set_status(
        db, order_id, PurchaseOrderStatus.AGUARDANDO_PAGAMENTO
    )
    _gerar_contas_pagar_da_ordem(
        db, updated, amount=Decimal(updated.total_amount or 0)
    )
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description="Serviço concluído — aguardando pagamento",
        source_module="compras",
        reference_id=order.id,
    )
    return compras_repo.get_order(db, order_id)


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
    Para ordens de produto: registra entradas no estoque (apenas qty_accepted
    > 0) e gera NF de recebimento/devolução. Para ordens de serviço: apenas
    move a ordem para CONCLUIDA. Em ambos os casos, transiciona o status.
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

    if (order.order_type or "produto") == "servico":
        return compras_repo.complete_order(db, order_id)

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

    # NF de transporte (somente se houver custo de frete)
    shipping_cost = Decimal(str(order.shipping_cost or 0))
    if shipping_cost > 0:
        fat_service.criar_nota_transporte(
            db,
            shipping_cost=shipping_cost,
            order_id=order.id,
            client_id=None,
        )

    return compras_repo.complete_order(db, order_id)


def soft_delete_order(db: Session, order_id: UUID) -> PurchaseOrder:
    order = _get_order_or_404(db, order_id)

    if order.status != PurchaseOrderStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas ordens em andamento podem ser excluídas",
        )

    return compras_repo.soft_delete_order(db, order_id)


# ---------------------------------------------------------------------------
# Quotations
# ---------------------------------------------------------------------------


def _get_quotation_or_404(db: Session, quotation_id: UUID) -> Quotation:
    quotation = compras_repo.get_quotation(db, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")
    return quotation


def _get_proposal_or_404(db: Session, proposal_id: UUID) -> QuotationProposal:
    proposal = compras_repo.get_proposal(db, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    return proposal


def _validate_proposal_items_cover_quotation(
    quotation: Quotation, proposal_items: list
) -> None:
    """Garante que há um item de proposta por item de cotação (nem a mais, nem
    a menos), e que todos os quotation_item_id referenciados pertencem à
    cotação."""
    quotation_item_ids = {item.id for item in quotation.items}
    payload_item_ids = set()
    for pi in proposal_items:
        if pi.quotation_item_id not in quotation_item_ids:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Item de cotação não encontrado: {pi.quotation_item_id}"
                ),
            )
        payload_item_ids.add(pi.quotation_item_id)

    missing = quotation_item_ids - payload_item_ids
    if missing:
        raise HTTPException(
            status_code=400,
            detail="A proposta deve conter preço para todos os itens da cotação",
        )


def create_quotation(db: Session, data: QuotationCreate) -> Quotation:
    # Para produto, valida que todos os itens de estoque existem.
    if data.order_type == "produto":
        for item_data in data.items:
            stock_item = estoque_repo.get_item(db, item_data.stock_item_id)
            if not stock_item:
                raise HTTPException(
                    status_code=404,
                    detail=f"Item de estoque não encontrado: {item_data.stock_item_id}",
                )

    return compras_repo.create_quotation(db, data)


def list_quotations(
    db: Session,
    *,
    status: Optional[QuotationStatus] = None,
    order_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Quotation]:
    return compras_repo.list_quotations(
        db, status=status, order_type=order_type, skip=skip, limit=limit
    )


def get_quotation(db: Session, quotation_id: UUID) -> Quotation:
    return _get_quotation_or_404(db, quotation_id)


def soft_delete_quotation(db: Session, quotation_id: UUID) -> Quotation:
    quotation = _get_quotation_or_404(db, quotation_id)
    if quotation.status != QuotationStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas cotações em andamento podem ser excluídas",
        )
    return compras_repo.soft_delete_quotation(db, quotation_id)


def add_proposal(
    db: Session, quotation_id: UUID, data: QuotationProposalCreate
) -> QuotationProposal:
    quotation = _get_quotation_or_404(db, quotation_id)
    if quotation.status != QuotationStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas cotações em andamento podem receber propostas",
        )

    _get_supplier_or_404(db, data.supplier_id)

    order_type = quotation.order_type or "produto"
    if order_type == "produto":
        _validate_proposal_items_cover_quotation(quotation, data.proposal_items)
    else:
        if data.total_price is None:
            raise HTTPException(
                status_code=400,
                detail="total_price é obrigatório para propostas de serviço",
            )

    try:
        return compras_repo.add_proposal(db, quotation_id, data)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Este fornecedor já tem uma proposta nesta cotação",
        )


def update_proposal(
    db: Session,
    quotation_id: UUID,
    proposal_id: UUID,
    data: QuotationProposalUpdate,
) -> QuotationProposal:
    quotation = _get_quotation_or_404(db, quotation_id)
    if quotation.status != QuotationStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas cotações em andamento podem ter propostas editadas",
        )

    proposal = _get_proposal_or_404(db, proposal_id)
    if proposal.quotation_id != quotation.id:
        raise HTTPException(
            status_code=404,
            detail="Proposta não pertence a esta cotação",
        )

    if data.supplier_id is not None:
        _get_supplier_or_404(db, data.supplier_id)

    if data.proposal_items is not None:
        _validate_proposal_items_cover_quotation(quotation, data.proposal_items)

    try:
        return compras_repo.update_proposal(db, proposal_id, data)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Este fornecedor já tem uma proposta nesta cotação",
        )


def delete_proposal(db: Session, quotation_id: UUID, proposal_id: UUID) -> None:
    quotation = _get_quotation_or_404(db, quotation_id)
    if quotation.status != QuotationStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas cotações em andamento podem ter propostas removidas",
        )

    proposal = _get_proposal_or_404(db, proposal_id)
    if proposal.quotation_id != quotation.id:
        raise HTTPException(
            status_code=404,
            detail="Proposta não pertence a esta cotação",
        )

    if quotation.winning_proposal_id == proposal_id:
        raise HTTPException(
            status_code=400,
            detail="A proposta vencedora não pode ser removida",
        )

    compras_repo.delete_proposal(db, proposal_id)


def select_winner(
    db: Session, quotation_id: UUID, proposal_id: UUID
) -> Quotation:
    quotation = _get_quotation_or_404(db, quotation_id)
    if quotation.status != QuotationStatus.EM_ANDAMENTO:
        raise HTTPException(
            status_code=400,
            detail="Apenas cotações em andamento podem selecionar uma proposta vencedora",
        )

    proposal = _get_proposal_or_404(db, proposal_id)
    if proposal.quotation_id != quotation.id:
        raise HTTPException(
            status_code=404,
            detail="Proposta não pertence a esta cotação",
        )

    order_type = quotation.order_type or "produto"
    if order_type == "produto":
        _validate_proposal_items_cover_quotation(quotation, proposal.proposal_items)
    else:
        if proposal.total_price is None:
            raise HTTPException(
                status_code=400,
                detail="A proposta vencedora de serviço deve ter total_price",
            )

    updated = compras_repo._set_quotation_status(
        db,
        quotation_id,
        QuotationStatus.AGUARDANDO_APROVACAO_FINANCEIRO,
        extra_fields={"winning_proposal_id": proposal_id},
    )
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description="Cotação enviada para aprovação financeira",
        source_module="compras",
        reference_id=quotation.id,
    )
    return updated


def approve_quotation(db: Session, quotation_id: UUID) -> Quotation:
    quotation = _get_quotation_or_404(db, quotation_id)
    if quotation.status != QuotationStatus.AGUARDANDO_APROVACAO_FINANCEIRO:
        raise HTTPException(
            status_code=400,
            detail="Apenas cotações aguardando aprovação podem ser aprovadas",
        )

    updated = compras_repo._set_quotation_status(
        db, quotation_id, QuotationStatus.APROVADO_FINANCEIRO
    )
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description="Cotação aprovada pelo financeiro",
        source_module="compras",
        reference_id=quotation.id,
    )
    return updated


def cancel_quotation(db: Session, quotation_id: UUID, note: str) -> Quotation:
    quotation = _get_quotation_or_404(db, quotation_id)
    final_statuses = (QuotationStatus.CONCLUIDA, QuotationStatus.CANCELADA)
    if quotation.status in final_statuses:
        raise HTTPException(status_code=400, detail="Cotação já finalizada")

    return compras_repo._set_quotation_status(
        db,
        quotation_id,
        QuotationStatus.CANCELADA,
        extra_fields={"cancellation_note": note},
    )


def realize_order(
    db: Session, quotation_id: UUID, data: RealizeOrderRequest
) -> Quotation:
    quotation = _get_quotation_or_404(db, quotation_id)
    if quotation.status != QuotationStatus.APROVADO_FINANCEIRO:
        raise HTTPException(
            status_code=400,
            detail="Apenas cotações aprovadas pelo financeiro podem gerar pedido",
        )

    winning_proposal = compras_repo.get_proposal(db, quotation.winning_proposal_id)
    if not winning_proposal:
        raise HTTPException(
            status_code=400,
            detail="Cotação não possui proposta vencedora",
        )

    order_type = quotation.order_type or "produto"
    ordered_at = data.ordered_at or datetime.now(timezone.utc)
    notes = data.notes or f"Gerada a partir da cotação {quotation_id}"

    if order_type == "produto":
        price_by_item = {
            pi.quotation_item_id: pi.unit_price
            for pi in winning_proposal.proposal_items
        }
        items = [
            PurchaseOrderItemCreate(
                stock_item_id=item.stock_item_id,
                quantity=Decimal(str(item.quantity)),
                unit_price=Decimal(str(price_by_item.get(item.id, 0))),
            )
            for item in quotation.items
        ]
        po_create_data = PurchaseOrderCreate(
            supplier_id=winning_proposal.supplier_id,
            items=items,
            ordered_at=ordered_at,
            order_type="produto",
            shipping_cost=Decimal(str(data.shipping_cost or 0)),
            notes=notes,
        )
    else:
        po_create_data = PurchaseOrderCreate(
            supplier_id=winning_proposal.supplier_id,
            ordered_at=ordered_at,
            order_type="servico",
            service_description=quotation.service_description,
            total_amount=Decimal(str(winning_proposal.total_price or 0)),
            notes=notes,
        )

    po = compras_repo.create_order(db, po_create_data)
    # A ordem nasce em em_andamento; avança direto para aprovada sem passar pelo
    # service (evita movimentações financeiras duplicadas do fluxo de ordens).
    compras_repo._set_status(db, po.id, PurchaseOrderStatus.APROVADA)

    updated = compras_repo._set_quotation_status(
        db,
        quotation_id,
        QuotationStatus.CONCLUIDA,
        extra_fields={"purchase_order_id": po.id},
    )
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.COMPRA,
        amount=Decimal("0"),
        description=f"Ordem de compra gerada a partir da cotação {quotation_id}",
        source_module="compras",
        reference_id=po.id,
    )
    return updated
