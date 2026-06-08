from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.comercial import repository as comercial_repo
from app.modules.comercial.model import Client, Sale
from app.modules.comercial.schemas import (
    ClientCreate,
    ClientUpdate,
    SaleCreate,
)
from app.modules.estoque import repository as estoque_repo
from app.modules.estoque import service as estoque_service
from app.modules.faturamento import service as faturamento_service
from app.modules.financeiro import service as fin_service
from app.shared.br_documents import validate_document
from app.shared.enums import (
    FinancialCategory,
    InvoiceStatus,
    MovementType,
    SaleStatus,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_client_or_404(db: Session, client_id: UUID) -> Client:
    client = comercial_repo.get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return client


def _get_sale_or_404(db: Session, sale_id: UUID) -> Sale:
    sale = comercial_repo.get_sale(db, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    return sale


def _validate_document_or_400(document: Optional[str]) -> None:
    """Documento é opcional; se informado, precisa ser CPF ou CNPJ válido.

    Mesma régua do cadastro de fornecedor (Demanda 6): reusa
    ``validate_document`` do ``app.shared.br_documents``.
    """
    if document and not validate_document(document):
        raise HTTPException(status_code=400, detail="CPF/CNPJ inválido")


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


def create_client(db: Session, data: ClientCreate) -> Client:
    _validate_document_or_400(data.document)
    return comercial_repo.create_client(db, data)


def list_clients(
    db: Session,
    *,
    is_delinquent: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Client]:
    return comercial_repo.list_clients(db, is_delinquent=is_delinquent, skip=skip, limit=limit)


def get_client(db: Session, client_id: UUID) -> Client:
    return _get_client_or_404(db, client_id)


def update_client(db: Session, client_id: UUID, data: ClientUpdate) -> Client:
    _get_client_or_404(db, client_id)
    # `document` só é validado quando enviado no payload (PATCH-like).
    if "document" in data.model_dump(exclude_unset=True):
        _validate_document_or_400(data.document)
    return comercial_repo.update_client(db, client_id, data)


def update_client_delinquent(db: Session, client_id: UUID, is_delinquent: bool) -> Client:
    _get_client_or_404(db, client_id)
    return comercial_repo.update_client_delinquent(db, client_id, is_delinquent)


def soft_delete_client(db: Session, client_id: UUID) -> Client:
    _get_client_or_404(db, client_id)
    return comercial_repo.soft_delete_client(db, client_id)


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------


def create_sale(db: Session, data: SaleCreate) -> Sale:
    # 1. Validate client exists
    client = _get_client_or_404(db, data.client_id)

    # 2. Validate stock availability for each item
    stock_items_by_id = {}
    for item_data in data.items:
        stock_item = estoque_repo.get_item(db, item_data.stock_item_id)
        if not stock_item:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {item_data.stock_item_id}",
            )
        stock_items_by_id[item_data.stock_item_id] = stock_item
        available = estoque_service.verificar_disponibilidade(
            db, item_data.stock_item_id, item_data.quantity
        )
        if not available:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Estoque insuficiente para o item: {stock_item.name}. "
                    f"Disponível: {stock_item.quantity_on_hand} {stock_item.unit}"
                ),
            )

    # 3. Create the sale record
    sale = comercial_repo.create_sale(db, data)

    # 4. Deduct stock for each item, passing the item's current CMP so the
    # saída carries unit_cost (viabiliza cálculo de CMV). Reaproveita o
    # StockItem já consultado na validação de disponibilidade.
    for item in sale.items:
        stock_item = stock_items_by_id.get(item.stock_item_id)
        unit_cost = (
            Decimal(str(stock_item.unit_cost)) if stock_item else Decimal("0")
        )
        estoque_service.registrar_saida(
            db,
            stock_item_id=item.stock_item_id,
            quantity=Decimal(item.quantity),
            unit_cost=unit_cost,
            description=f"Venda #{sale.id}",
            source_module="comercial",
            reference_id=sale.id,
        )

    installments = sale.installments or 1
    payment_method_raw = sale.payment_method
    if payment_method_raw is None:
        payment_method_value = None
    elif hasattr(payment_method_raw, "value"):
        payment_method_value = payment_method_raw.value
    else:
        payment_method_value = payment_method_raw

    if installments <= 1:
        # 5. Create invoice (flow à vista — unchanged)
        faturamento_service.criar_fatura(
            db,
            sale_id=sale.id,
            client_id=sale.client_id,
            items=sale.items,
            total_amount=Decimal(sale.total_amount),
            source_module="comercial",
        )

        # 6. Create account receivable (due in 30 days)
        fin_service.criar_conta_receber(
            db,
            client_id=sale.client_id,
            description=f"Venda — {client.name}",
            amount=Decimal(sale.total_amount),
            due_date=date.today() + timedelta(days=30),
            source_module="comercial",
            reference_id=sale.id,
            payment_method=payment_method_value,
        )
    else:
        # 5. Create parceled invoices (one per installment)
        invoices = faturamento_service.criar_faturas_parceladas(
            db,
            sale_id=sale.id,
            client_id=sale.client_id,
            items=sale.items,
            total_amount=Decimal(sale.total_amount),
            installments=installments,
            first_due_date=sale.first_due_date,
            installment_interval_days=sale.installment_interval_days or 30,
        )

        # 6. One receivable per installment, linked to its invoice
        for invoice in invoices:
            fin_service.criar_conta_receber(
                db,
                client_id=sale.client_id,
                description=(
                    f"Venda — {client.name} "
                    f"(parcela {invoice.installment_number}/{installments})"
                ),
                amount=Decimal(str(invoice.total_amount)),
                due_date=invoice.due_date,
                source_module="comercial",
                sale_id=sale.id,
                invoice_id=invoice.id,
                installment_number=invoice.installment_number,
                installment_total=installments,
                payment_method=payment_method_value,
            )

    # NF de transporte (somente se houver custo de frete)
    shipping_cost = Decimal(str(sale.shipping_cost or 0))
    if shipping_cost > 0:
        faturamento_service.criar_nota_transporte(
            db,
            shipping_cost=shipping_cost,
            sale_id=sale.id,
            client_id=sale.client_id,
        )

    # 7. Register financial movement (entrada/venda, R$0 placeholder)
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.VENDA,
        amount=Decimal("0"),
        description=f"Venda — {client.name}",
        source_module="comercial",
        reference_id=sale.id,
    )

    # Reload sale after all side-effect commits cleared the injected __dict__
    sale = comercial_repo.get_sale(db, sale.id)
    return sale


def list_sales(
    db: Session,
    *,
    status: Optional[SaleStatus] = None,
    client_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Sale]:
    return comercial_repo.list_sales(
        db, status=status, client_id=client_id, skip=skip, limit=limit
    )


def get_sale(db: Session, sale_id: UUID) -> Sale:
    return _get_sale_or_404(db, sale_id)


def update_status(db: Session, sale_id: UUID, new_status: SaleStatus) -> Sale:
    sale = _get_sale_or_404(db, sale_id)

    # Cancelamento é evento fiscal, ancorado na NF: não pode ser feito por uma
    # troca de status "pelada" (que não estornaria estoque/financeiro). O caminho
    # correto é a ação "Cancelar venda" (cancel_sale → motor do Faturamento).
    if new_status == SaleStatus.CANCELADA:
        raise HTTPException(
            status_code=400,
            detail=(
                "Para cancelar uma venda use a ação 'Cancelar venda', que "
                "estorna estoque e financeiro."
            ),
        )

    if sale.status == SaleStatus.CANCELADA:
        raise HTTPException(
            status_code=400,
            detail="Venda cancelada não pode ter status alterado",
        )

    if sale.status == SaleStatus.ENTREGUE and new_status == SaleStatus.REALIZADA:
        raise HTTPException(
            status_code=400,
            detail="Venda entregue não pode retornar ao status Realizada",
        )

    return comercial_repo.update_sale_status(db, sale_id, new_status)


def mark_sale_cancelled(db: Session, sale_id: UUID) -> Sale:
    """Marca a venda como CANCELADA sem disparar estorno.

    Uso **interno** do motor de cancelamento do Faturamento
    (``_cancelar_nf_venda``), que já orquestra o estorno completo (estoque,
    contas a receber e cadeia de NFs). NÃO é o caminho público de cancelamento:
    para cancelar uma venda ponta a ponta use :func:`cancel_sale`. Por isso
    contorna a guarda de ``update_status`` (que recusa a transição para
    CANCELADA) e grava o status direto via repository.
    """
    return comercial_repo.update_sale_status(db, sale_id, SaleStatus.CANCELADA)


def cancel_sale(db: Session, sale_id: UUID, reason: Optional[str] = None) -> Sale:
    """Cancela uma venda ponta a ponta delegando ao motor do Faturamento.

    Localiza uma NF de venda ativa do ``sale_id`` e chama ``cancelar_fatura``
    **uma única vez**; o motor (``_cancelar_nf_venda``) devolve o estoque,
    cancela toda a cadeia de NFs da venda (inclusive parcelas e a NF de
    transporte), baixa todas as contas a receber, gera os estornos e marca a
    ``Sale`` como CANCELADA. Não há segundo motor de estorno aqui.
    """
    sale = _get_sale_or_404(db, sale_id)

    # Idempotência: venda já cancelada é no-op explícito (sem 2º estorno).
    if sale.status == SaleStatus.CANCELADA:
        raise HTTPException(status_code=400, detail="Venda já está cancelada")

    # Integração entre módulos via Service: o Comercial pergunta ao Faturamento
    # quais NFs pertencem à venda (não acessa o repository do outro módulo).
    invoices = faturamento_service.get_invoices_by_sale(db, sale_id)
    venda_invoice = next(
        (
            inv
            for inv in invoices
            if (inv.invoice_type or "").lower() == "venda"
            and inv.status != InvoiceStatus.CANCELADA
        ),
        None,
    )
    if venda_invoice is None:
        # create_sale sempre emite NF de venda; ausência aqui é estado anômalo.
        raise HTTPException(
            status_code=409,
            detail="Venda sem nota fiscal de venda ativa para cancelar",
        )

    faturamento_service.cancelar_fatura(db, venda_invoice.id, reason=reason)

    return _get_sale_or_404(db, sale_id)


def soft_delete_sale(db: Session, sale_id: UUID) -> Sale:
    sale = _get_sale_or_404(db, sale_id)

    if sale.status != SaleStatus.REALIZADA:
        raise HTTPException(
            status_code=400,
            detail="Apenas vendas com status 'Realizada' podem ser excluídas",
        )

    return comercial_repo.soft_delete_sale(db, sale_id)
