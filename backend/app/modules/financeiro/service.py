import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.comercial.model import Client
from app.modules.compras.model import Supplier
from app.modules.financeiro import repository as fin_repo
from app.modules.financeiro.model import (
    AccountPayable,
    AccountReceivable,
    FinancialMovement,
)
from app.modules.financeiro.schemas import (
    AccountPayableCreate,
    AccountPayableOut,
    AccountPayableUpdate,
    AccountReceivableCreate,
    AccountReceivableOut,
    AccountReceivableUpdate,
    BalanceOut,
    BoletoPaymentInfo,
    CashFlowItem,
    CashFlowOut,
    DefaulterItem,
    EncargoOut,
    FinancialMovementCreate,
    FinancialMovementOut,
    PixPaymentInfo,
)
from app.shared.pagination import Page, PageParams
from app.shared.enums import (
    AccountPayableStatus,
    AccountReceivableStatus,
    FinancialCategory,
    MovementType,
    PaymentMethod,
)


# ---------------------------------------------------------------------------
# Public cross-module functions
# ---------------------------------------------------------------------------


def registrar_movimento(
    db: Session,
    *,
    movement_type: MovementType,
    category: FinancialCategory,
    amount: Decimal,
    description: str,
    source_module: Optional[str] = None,
    reference_id: Optional[UUID] = None,
    occurred_at: Optional[datetime] = None,
) -> FinancialMovement:
    """Register a financial movement. Called by other modules (comercial, compras, folha, pcp)."""
    if amount < 0:
        raise HTTPException(status_code=400, detail="Valor da movimentação não pode ser negativo")
    return fin_repo.create_movement(
        db,
        movement_type=movement_type,
        category=category,
        amount=amount,
        description=description,
        source_module=source_module,
        reference_id=reference_id,
        occurred_at=occurred_at,
    )


def criar_conta_pagar(
    db: Session,
    *,
    description: str,
    amount: Decimal,
    due_date: date,
    supplier_id: Optional[UUID] = None,
    source_module: Optional[str] = None,
    reference_id: Optional[UUID] = None,
    notes: Optional[str] = None,
    installment_number: Optional[int] = None,
    installment_total: Optional[int] = None,
    payment_method: Optional[str] = None,
) -> AccountPayable:
    """Create an account payable. Called by compras/folha."""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
    purchase_order_id = reference_id if source_module == "compras" else None
    number = fin_repo.next_number(db, AccountPayable, "AP")
    return fin_repo.create_payable(
        db,
        number=number,
        description=description,
        amount=amount,
        due_date=due_date,
        supplier_id=supplier_id,
        purchase_order_id=purchase_order_id,
        notes=notes,
        installment_number=installment_number,
        installment_total=installment_total,
        payment_method=payment_method,
    )


def criar_conta_receber(
    db: Session,
    *,
    client_id: UUID,
    description: str,
    amount: Decimal,
    due_date: date,
    source_module: Optional[str] = None,
    reference_id: Optional[UUID] = None,
    notes: Optional[str] = None,
    installment_number: Optional[int] = None,
    installment_total: Optional[int] = None,
    sale_id: Optional[UUID] = None,
    invoice_id: Optional[UUID] = None,
    payment_method: Optional[str] = None,
) -> AccountReceivable:
    """Create an account receivable. Called by comercial/faturamento."""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
    if sale_id is None and source_module == "comercial":
        sale_id = reference_id
    if invoice_id is None and source_module == "faturamento":
        invoice_id = reference_id
    number = fin_repo.next_number(db, AccountReceivable, "AR")
    return fin_repo.create_receivable(
        db,
        number=number,
        client_id=client_id,
        description=description,
        amount=amount,
        due_date=due_date,
        sale_id=sale_id,
        invoice_id=invoice_id,
        notes=notes,
        installment_number=installment_number,
        installment_total=installment_total,
        payment_method=payment_method,
    )


# ---------------------------------------------------------------------------
# Movements
# ---------------------------------------------------------------------------


def create_movement(db: Session, body: FinancialMovementCreate) -> FinancialMovement:
    return registrar_movimento(
        db,
        movement_type=body.movement_type,
        category=body.category,
        amount=body.amount,
        description=body.description,
        source_module=body.source_module,
        reference_id=body.reference_id,
        occurred_at=body.occurred_at,
    )


def list_movements(db: Session, **filters) -> list[FinancialMovement]:
    return fin_repo.list_movements(db, **filters)


def list_movements_paginated(
    db: Session,
    *,
    params: PageParams,
    movement_type: Optional[MovementType] = None,
    category: Optional[FinancialCategory] = None,
    source_module: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Page[FinancialMovementOut]:
    movements, total = fin_repo.list_movements_paginated(
        db,
        params=params,
        movement_type=movement_type,
        category=category,
        source_module=source_module,
        start_date=start_date,
        end_date=end_date,
    )
    items = [FinancialMovementOut.model_validate(m) for m in movements]
    return Page.create(items=items, total=total, params=params)


# ---------------------------------------------------------------------------
# Balance & Cash Flow
# ---------------------------------------------------------------------------


def get_balance(db: Session) -> BalanceOut:
    entradas = fin_repo.sum_by_type(db, MovementType.ENTRADA)
    saidas = fin_repo.sum_by_type(db, MovementType.SAIDA)
    return BalanceOut(
        total_entradas=entradas,
        total_saidas=saidas,
        saldo=entradas - saidas,
    )


def get_cash_flow(db: Session, months: int = 6) -> CashFlowOut:
    if months <= 0 or months > 36:
        raise HTTPException(status_code=400, detail="Período inválido (1 a 36 meses)")

    now = datetime.now(timezone.utc)
    start = (now.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1)

    rows = fin_repo.cash_flow_by_month(db, start_date=start, end_date=now)

    buckets: dict[str, dict[str, Decimal]] = {}
    for period, mov_type, total in rows:
        bucket = buckets.setdefault(period, {"entradas": Decimal(0), "saidas": Decimal(0)})
        if mov_type == MovementType.ENTRADA:
            bucket["entradas"] = total
        else:
            bucket["saidas"] = total

    items: list[CashFlowItem] = []
    total_entradas = Decimal(0)
    total_saidas = Decimal(0)
    for period in sorted(buckets.keys()):
        entradas = buckets[period]["entradas"]
        saidas = buckets[period]["saidas"]
        total_entradas += entradas
        total_saidas += saidas
        items.append(
            CashFlowItem(
                period=period,
                entradas=entradas,
                saidas=saidas,
                saldo=entradas - saidas,
            )
        )

    return CashFlowOut(
        items=items,
        total_entradas=total_entradas,
        total_saidas=total_saidas,
        saldo=total_entradas - total_saidas,
    )


# ---------------------------------------------------------------------------
# Accounts Payable
# ---------------------------------------------------------------------------


def create_payable(db: Session, body: AccountPayableCreate) -> AccountPayable:
    return criar_conta_pagar(
        db,
        description=body.description,
        amount=body.amount,
        due_date=body.due_date,
        supplier_id=body.supplier_id,
        source_module="compras" if body.purchase_order_id else None,
        reference_id=body.purchase_order_id,
        notes=body.notes,
        payment_method=body.payment_method.value if body.payment_method else None,
    )


def list_payables(db: Session, **filters) -> list[AccountPayable]:
    return fin_repo.list_payables(db, **filters)


def list_payables_paginated(
    db: Session,
    *,
    params: PageParams,
    status: Optional[AccountPayableStatus] = None,
    supplier_id: Optional[UUID] = None,
    due_before: Optional[date] = None,
    due_after: Optional[date] = None,
) -> Page[AccountPayableOut]:
    payables, total = fin_repo.list_payables_paginated(
        db,
        params=params,
        status=status,
        supplier_id=supplier_id,
        due_before=due_before,
        due_after=due_after,
    )
    items = [AccountPayableOut.model_validate(p) for p in payables]
    return Page.create(items=items, total=total, params=params)


def get_payable(db: Session, payable_id: UUID) -> AccountPayable:
    payable = fin_repo.get_payable(db, payable_id)
    if not payable:
        raise HTTPException(status_code=404, detail="Conta a pagar não encontrada")
    return payable


def update_payable(
    db: Session, payable_id: UUID, body: AccountPayableUpdate
) -> AccountPayable:
    payable = get_payable(db, payable_id)
    if payable.status != AccountPayableStatus.EM_ABERTO:
        raise HTTPException(
            status_code=400,
            detail="Somente contas em aberto podem ser editadas",
        )
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(payable, key, value)
    fin_repo.save(db, payable)
    return payable


def pay_payable(
    db: Session,
    payable_id: UUID,
    *,
    paid_at: Optional[datetime] = None,
    notes: Optional[str] = None,
) -> AccountPayable:
    payable = get_payable(db, payable_id)
    if payable.status == AccountPayableStatus.PAGA:
        raise HTTPException(status_code=400, detail="Conta já foi paga")
    if payable.status == AccountPayableStatus.CANCELADA:
        raise HTTPException(status_code=400, detail="Conta cancelada não pode ser paga")

    payable.status = AccountPayableStatus.PAGA
    payable.paid_at = paid_at or datetime.now(timezone.utc)
    if notes is not None:
        payable.notes = notes
    fin_repo.save(db, payable)

    registrar_movimento(
        db,
        movement_type=MovementType.SAIDA,
        category=FinancialCategory.PAGAMENTO,
        amount=payable.amount,
        description=f"Pagamento {payable.number} — {payable.description}",
        source_module="financeiro",
        reference_id=payable.id,
        occurred_at=payable.paid_at,
    )

    # Integração com Compras (Demanda 1.1): o pagamento APENAS liquida a conta a
    # pagar e registra o movimento de pagamento (acima). Estoque + NF passaram
    # para a conferência (produto) / aceite (serviço). complete_order_after_payment
    # agora só CONCLUI a ordem quando não resta nenhuma conta a pagar em aberto
    # (no parcelado, só conclui ao pagar a última parcela).
    if payable.purchase_order_id is not None:
        from app.modules.compras import service as compras_service

        compras_service.complete_order_after_payment(db, payable.purchase_order_id)

    return payable


def contar_contas_pagar_em_aberto_por_ordem(db: Session, order_id: UUID) -> int:
    """Count the still-open (em_aberto) accounts payable of a purchase order."""
    return len(
        fin_repo.list_payables_by_order(
            db, order_id, status=AccountPayableStatus.EM_ABERTO
        )
    )


def total_pago_por_ordem(db: Session, order_id: UUID) -> Decimal:
    """Sum of the amounts already paid (status paga) for a purchase order."""
    paid = fin_repo.list_payables_by_order(
        db, order_id, status=AccountPayableStatus.PAGA
    )
    return sum((Decimal(str(p.amount)) for p in paid), Decimal("0"))


def cancelar_contas_pagar_em_aberto_por_ordem(
    db: Session, order_id: UUID
) -> list[AccountPayable]:
    """Cancel every open (em_aberto) account payable of a purchase order.

    Used when an NF of the order is cancelled before payment — the money never
    left the account, so the open obligation is simply cancelled (no reversal).
    """
    open_payables = fin_repo.list_payables_by_order(
        db, order_id, status=AccountPayableStatus.EM_ABERTO
    )
    cancelled: list[AccountPayable] = []
    for payable in open_payables:
        payable.status = AccountPayableStatus.CANCELADA
        fin_repo.save(db, payable)
        cancelled.append(payable)
    return cancelled


def existe_estorno_ordem(db: Session, order_id: UUID) -> bool:
    """True if a financial reversal already exists for the purchase order (idempotency)."""
    return fin_repo.exists_order_reversal(db, order_id)


def cancel_payable(db: Session, payable_id: UUID) -> AccountPayable:
    payable = get_payable(db, payable_id)
    if payable.status == AccountPayableStatus.PAGA:
        raise HTTPException(status_code=400, detail="Conta paga não pode ser cancelada")
    if payable.status == AccountPayableStatus.CANCELADA:
        raise HTTPException(status_code=400, detail="Conta já está cancelada")

    payable.status = AccountPayableStatus.CANCELADA
    fin_repo.save(db, payable)
    return payable


# ---------------------------------------------------------------------------
# Accounts Receivable
# ---------------------------------------------------------------------------


def create_receivable(db: Session, body: AccountReceivableCreate) -> AccountReceivable:
    source_module: Optional[str] = None
    reference_id: Optional[UUID] = None
    if body.sale_id:
        source_module = "comercial"
        reference_id = body.sale_id
    elif body.invoice_id:
        source_module = "faturamento"
        reference_id = body.invoice_id

    return criar_conta_receber(
        db,
        client_id=body.client_id,
        description=body.description,
        amount=body.amount,
        due_date=body.due_date,
        source_module=source_module,
        reference_id=reference_id,
        notes=body.notes,
        payment_method=body.payment_method.value if body.payment_method else None,
    )


def list_receivables(db: Session, **filters) -> list[AccountReceivable]:
    return fin_repo.list_receivables(db, **filters)


def get_receivables_by_invoice(
    db: Session, invoice_id: UUID
) -> list[AccountReceivable]:
    """AR (parcelas) ligadas a uma nota por `invoice_id`. Ponto de integração
    para o Faturamento montar o bloco de parcelas da nota (Demanda 9.0) sem
    acessar o repository do Financeiro diretamente."""
    return fin_repo.list_receivables_by_refs(db, invoice_id=invoice_id)


def get_client_ids_with_overdue(db: Session) -> set[UUID]:
    """Conjunto de client_ids com ≥1 parcela vencida (inadimplência DERIVADA,
    Demanda 9.A). UMA query — usado pelo Comercial para anotar a lista de
    clientes sem N+1."""
    return fin_repo.get_client_ids_with_overdue(db, date.today())


def client_has_overdue(db: Session, client_id: UUID) -> bool:
    """True se o cliente tem ≥1 parcela vencida (inadimplência derivada)."""
    return fin_repo.client_has_overdue(db, client_id, date.today())


def list_receivables_paginated(
    db: Session,
    *,
    params: PageParams,
    status: Optional[AccountReceivableStatus] = None,
    client_id: Optional[UUID] = None,
    due_before: Optional[date] = None,
    due_after: Optional[date] = None,
) -> Page[AccountReceivableOut]:
    receivables, total = fin_repo.list_receivables_paginated(
        db,
        params=params,
        status=status,
        client_id=client_id,
        due_before=due_before,
        due_after=due_after,
    )
    items = [AccountReceivableOut.model_validate(r) for r in receivables]
    return Page.create(items=items, total=total, params=params)


def cancelar_contas_receber(
    db: Session,
    *,
    sale_id: Optional[UUID] = None,
    invoice_id: Optional[UUID] = None,
    estorno_descricao: str,
    estorno_reference_id: Optional[UUID] = None,
) -> list[AccountReceivable]:
    """Cancel the receivables linked to a sale/invoice (NF cancellation).

    For each receivable not yet cancelled, registers a reversal financial
    movement (SAIDA/AJUSTE) for the amount **already received** and sets the
    status to ``cancelada``. Called by Faturamento when cancelling a sale NF.
    Returns the list of receivables that were cancelled.
    """
    receivables = fin_repo.list_receivables_by_refs(
        db, sale_id=sale_id, invoice_id=invoice_id
    )
    cancelled: list[AccountReceivable] = []
    for receivable in receivables:
        if receivable.status == AccountReceivableStatus.CANCELADA:
            continue
        received = Decimal(str(receivable.amount_received or 0))
        if received > 0:
            registrar_movimento(
                db,
                movement_type=MovementType.SAIDA,
                category=FinancialCategory.AJUSTE,
                amount=received,
                description=estorno_descricao,
                source_module="financeiro",
                reference_id=estorno_reference_id,
            )
        receivable.status = AccountReceivableStatus.CANCELADA
        fin_repo.save(db, receivable)
        cancelled.append(receivable)
    return cancelled


def get_receivable(db: Session, receivable_id: UUID) -> AccountReceivable:
    receivable = fin_repo.get_receivable(db, receivable_id)
    if not receivable:
        raise HTTPException(status_code=404, detail="Conta a receber não encontrada")
    return receivable


def update_receivable(
    db: Session, receivable_id: UUID, body: AccountReceivableUpdate
) -> AccountReceivable:
    receivable = get_receivable(db, receivable_id)
    if receivable.status not in (
        AccountReceivableStatus.EM_ABERTO,
        AccountReceivableStatus.PARCIALMENTE_PAGO,
    ):
        raise HTTPException(
            status_code=400,
            detail="Somente contas em aberto ou parcialmente pagas podem ser editadas",
        )
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(receivable, key, value)
    fin_repo.save(db, receivable)
    return receivable


def _receivable_is_overdue(receivable: AccountReceivable, today: date) -> bool:
    """Parcela vencida (Demanda 9.B/9.A): venc. < hoje, saldo em aberto e não
    cancelada. Mesma definição do `AccountReceivableOut.is_overdue`."""
    if receivable.status == AccountReceivableStatus.CANCELADA:
        return False
    if Decimal(receivable.amount_received) >= Decimal(receivable.amount):
        return False
    return receivable.due_date < today


def _quantize(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"))


def calcular_encargo(db: Session, receivable: AccountReceivable) -> EncargoOut:
    """Pré-calcula o encargo por atraso sobre o **saldo** da parcela vencida
    (Demanda 9.B). Parcela não vencida → tudo 0.

    - multa = saldo × multa_atraso_percent/100 (uma vez);
    - juros = saldo × (juros_mora_mensal_percent/100 / 30) × dias_atraso (simples).

    As taxas vêm de Configurações (default 2/1 se ausentes).
    """
    from app.modules.configuracoes import service as config_service

    saldo = Decimal(receivable.amount) - Decimal(receivable.amount_received)
    today = date.today()
    if not _receivable_is_overdue(receivable, today):
        zero = Decimal("0.00")
        return EncargoOut(
            receivable_id=receivable.id,
            number=receivable.number,
            saldo=_quantize(saldo),
            dias_atraso=0,
            multa=zero,
            juros=zero,
            total=zero,
        )

    dias_atraso = (today - receivable.due_date).days
    taxas = config_service.get_encargos(db)
    multa = saldo * (Decimal(taxas.multa_atraso_percent) / Decimal("100"))
    juros = (
        saldo
        * (Decimal(taxas.juros_mora_mensal_percent) / Decimal("100") / Decimal("30"))
        * Decimal(dias_atraso)
    )
    multa = _quantize(multa)
    juros = _quantize(juros)
    return EncargoOut(
        receivable_id=receivable.id,
        number=receivable.number,
        saldo=_quantize(saldo),
        dias_atraso=dias_atraso,
        multa=multa,
        juros=juros,
        total=_quantize(multa + juros),
    )


def receive_payment(
    db: Session,
    receivable_id: UUID,
    *,
    amount: Decimal,
    received_at: Optional[datetime] = None,
    notes: Optional[str] = None,
    encargo: Optional[Decimal] = None,
) -> AccountReceivable:
    receivable = get_receivable(db, receivable_id)
    if receivable.status in (
        AccountReceivableStatus.QUITADO,
        AccountReceivableStatus.CANCELADA,
    ):
        raise HTTPException(
            status_code=400,
            detail="Conta já quitada ou cancelada",
        )

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")

    remaining = Decimal(receivable.amount) - Decimal(receivable.amount_received)
    if amount > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Valor excede o saldo devedor (restante: {remaining})",
        )

    # Encargo por atraso (Demanda 9.B): o encargo NÃO entra no principal — a
    # parcela quita pelo `amount` (lógica inalterada). Pré-calcula ANTES de mexer
    # no saldo (a fórmula usa o saldo da parcela vencida). Só é cobrado na baixa
    # que QUITA uma parcela vencida; em pagamento parcial não há encargo.
    was_overdue = _receivable_is_overdue(receivable, date.today())
    encargo_calc = calcular_encargo(db, receivable) if was_overdue else None

    now = received_at or datetime.now(timezone.utc)
    receivable.amount_received = Decimal(receivable.amount_received) + amount
    quita = receivable.amount_received >= receivable.amount
    if quita:
        receivable.status = AccountReceivableStatus.QUITADO
        receivable.received_at = now
    else:
        receivable.status = AccountReceivableStatus.PARCIALMENTE_PAGO
    if notes is not None:
        receivable.notes = notes
    fin_repo.save(db, receivable)

    # Movimento do PRINCIPAL (inalterado).
    registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.RECEBIMENTO,
        amount=amount,
        description=f"Recebimento {receivable.number} — {receivable.description}",
        source_module="financeiro",
        reference_id=receivable.id,
        occurred_at=now,
    )

    # Movimento SEPARADO do encargo (receita financeira), só ao quitar parcela
    # vencida. `encargo` override (inclusive 0 = perdão) tem precedência; senão,
    # usa o total pré-calculado.
    if quita and was_overdue:
        encargo_value = encargo if encargo is not None else encargo_calc.total
        encargo_value = _quantize(Decimal(encargo_value))
        if encargo_value > 0:
            parcela_label = (
                f" (parcela {receivable.installment_number}/"
                f"{receivable.installment_total})"
                if receivable.installment_number
                else ""
            )
            registrar_movimento(
                db,
                movement_type=MovementType.ENTRADA,
                category=FinancialCategory.JUROS_MULTA,
                amount=encargo_value,
                description=(
                    f"Juros/multa por atraso — {receivable.number}{parcela_label}"
                ),
                source_module="financeiro",
                reference_id=receivable.id,
                occurred_at=now,
            )

    # Status da nota = paga, persistido, quando a última parcela é quitada (9.B).
    if quita and receivable.invoice_id is not None:
        from app.modules.faturamento import service as faturamento_service

        faturamento_service.marcar_fatura_paga_se_quitada(
            db, receivable.invoice_id
        )

    return receivable


def mark_as_defaulter(db: Session, receivable_id: UUID) -> AccountReceivable:
    receivable = get_receivable(db, receivable_id)
    if receivable.status in (
        AccountReceivableStatus.QUITADO,
        AccountReceivableStatus.CANCELADA,
    ):
        raise HTTPException(
            status_code=400,
            detail="Apenas contas em aberto podem ser marcadas como inadimplentes",
        )

    receivable.status = AccountReceivableStatus.CANCELADA
    fin_repo.save(db, receivable)

    client = db.query(Client).filter(Client.id == receivable.client_id).first()
    if client:
        client.is_delinquent = True
        fin_repo.save(db, client)

    return receivable


def revert_defaulter(db: Session, receivable_id: UUID) -> AccountReceivable:
    receivable = get_receivable(db, receivable_id)
    if receivable.status != AccountReceivableStatus.CANCELADA:
        raise HTTPException(
            status_code=400,
            detail="Apenas contas canceladas/inadimplentes podem ser revertidas",
        )

    if Decimal(receivable.amount_received) >= Decimal(receivable.amount):
        receivable.status = AccountReceivableStatus.QUITADO
    elif Decimal(receivable.amount_received) > 0:
        receivable.status = AccountReceivableStatus.PARCIALMENTE_PAGO
    else:
        receivable.status = AccountReceivableStatus.EM_ABERTO
    fin_repo.save(db, receivable)

    remaining = fin_repo.count_delinquent_receivables_by_client(db, receivable.client_id)
    if remaining == 0:
        client = db.query(Client).filter(Client.id == receivable.client_id).first()
        if client:
            client.is_delinquent = False
            fin_repo.save(db, client)

    return receivable


def update_payable_payment_method(
    db: Session, payable_id: UUID, payment_method: PaymentMethod
) -> AccountPayable:
    payable = get_payable(db, payable_id)
    if payable.status != AccountPayableStatus.EM_ABERTO:
        raise HTTPException(
            status_code=400,
            detail="Somente contas em aberto podem ter o método de pagamento alterado",
        )
    payable.payment_method = payment_method.value
    fin_repo.save(db, payable)
    return payable


def update_receivable_payment_method(
    db: Session, receivable_id: UUID, payment_method: PaymentMethod
) -> AccountReceivable:
    receivable = get_receivable(db, receivable_id)
    if receivable.status != AccountReceivableStatus.EM_ABERTO:
        raise HTTPException(
            status_code=400,
            detail="Somente contas em aberto podem ter o método de pagamento alterado",
        )
    receivable.payment_method = payment_method.value
    fin_repo.save(db, receivable)
    return receivable


# ---------------------------------------------------------------------------
# Payment method info (PIX / Boleto)
# ---------------------------------------------------------------------------


_PIX_KEY = "fazenda.cafe@pix.com.br"
_BENEFICIARY = "Fazenda Café Arábica Ltda. — CNPJ: 00.000.000/0001-00"


def _pix_amount_str(amount: Decimal) -> str:
    return f"{Decimal(amount):.2f}"


def _seeded_rng(reference_id: UUID) -> random.Random:
    return random.Random(int(reference_id.int & 0xFFFFFFFFFFFFFFFF))


def gerar_info_pix(conta) -> PixPaymentInfo:
    """Gera dados simulados de PIX para uma conta (pagar ou receber)."""
    amount = Decimal(conta.amount or 0)
    rng = _seeded_rng(conta.id)
    txid = f"{rng.getrandbits(64):016X}{rng.getrandbits(64):016X}".lower()[:32]
    valor_fmt = _pix_amount_str(amount)
    pix_payload_core = (
        f"00020126580014BR.GOV.BCB.PIX0136{txid}"
        f"5204000053039865802BR5925FAZENDA CAFE ARABICA LTDA6009SAO PAULO"
    )
    additional = f"0503***{valor_fmt}"
    extra = f"62{len(additional):02d}{additional}"
    crc = f"{rng.getrandbits(16):04X}"
    pix_code = f"{pix_payload_core}{extra}6304{crc}"
    return PixPaymentInfo(
        pix_key=_PIX_KEY,
        pix_code=pix_code,
        amount=amount,
        description=conta.description or "",
    )


def gerar_info_boleto(conta, *, payer_name: str) -> BoletoPaymentInfo:
    """Gera dados simulados de boleto. Determinístico para a mesma conta."""
    amount = Decimal(conta.amount or 0)
    rng = _seeded_rng(conta.id)
    g1 = f"{rng.randrange(10**5):05d}"
    g2 = f"{rng.randrange(10**5):05d}"
    g3 = f"{rng.randrange(10**6):06d}"
    g4 = f"{rng.randrange(10**6):06d}"
    g5 = f"{rng.randrange(10**6):06d}"
    g6 = f"{rng.randrange(10**6):06d}"
    digit = f"{rng.randrange(10)}"
    due = conta.due_date
    due_str = due.strftime("%d/%m/%Y") if due else ""
    amount_int = int((amount * 100).to_integral_value())
    amount_compact = f"{amount_int:010d}"
    boleto_number = (
        f"34191.{g1} {g2}.{g3} {g4}.{g5} {digit} "
        f"{due_str.replace('/', '')} {amount_compact}"
    )
    barcode = f"34191{g1}{g2}{g3}{g4}{g5}{g6}{digit}{amount_compact}"
    return BoletoPaymentInfo(
        boleto_number=boleto_number,
        barcode=barcode,
        due_date=due_str,
        amount=amount,
        beneficiary=_BENEFICIARY,
        payer=payer_name or "",
    )


def get_payable_pix(db: Session, payable_id: UUID) -> PixPaymentInfo:
    payable = get_payable(db, payable_id)
    payment_method = _normalize_method(payable.payment_method)
    if payment_method != PaymentMethod.PIX.value:
        raise HTTPException(
            status_code=400,
            detail="Conta a pagar não está configurada para pagamento via PIX",
        )
    return gerar_info_pix(payable)


def get_payable_boleto(db: Session, payable_id: UUID) -> BoletoPaymentInfo:
    payable = get_payable(db, payable_id)
    payment_method = _normalize_method(payable.payment_method)
    if payment_method != PaymentMethod.BOLETO.value:
        raise HTTPException(
            status_code=400,
            detail="Conta a pagar não está configurada para pagamento via boleto",
        )
    payer_name = ""
    if payable.supplier_id:
        supplier = (
            db.query(Supplier)
            .filter(Supplier.id == payable.supplier_id)
            .first()
        )
        payer_name = supplier.name if supplier else ""
    return gerar_info_boleto(payable, payer_name=payer_name)


def get_receivable_pix(db: Session, receivable_id: UUID) -> PixPaymentInfo:
    receivable = get_receivable(db, receivable_id)
    payment_method = _normalize_method(receivable.payment_method)
    if payment_method != PaymentMethod.PIX.value:
        raise HTTPException(
            status_code=400,
            detail="Conta a receber não está configurada para pagamento via PIX",
        )
    return gerar_info_pix(receivable)


def get_receivable_boleto(db: Session, receivable_id: UUID) -> BoletoPaymentInfo:
    receivable = get_receivable(db, receivable_id)
    payment_method = _normalize_method(receivable.payment_method)
    if payment_method != PaymentMethod.BOLETO.value:
        raise HTTPException(
            status_code=400,
            detail="Conta a receber não está configurada para pagamento via boleto",
        )
    client = (
        db.query(Client)
        .filter(Client.id == receivable.client_id)
        .first()
    )
    payer_name = client.name if client else ""
    return gerar_info_boleto(receivable, payer_name=payer_name)


def _normalize_method(value) -> Optional[str]:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else value


def list_defaulters(db: Session) -> list[DefaulterItem]:
    # Inadimplência EFETIVA (Demanda 9.A) = manual (override D7) OU vencida
    # (derivada). Manual: AR marcada (status cancelada) de cliente com flag.
    # Vencida: parcela em aberto, due_date < hoje, não cancelada.
    from sqlalchemy import and_, or_

    today = date.today()
    manual_cond = and_(
        AccountReceivable.status == AccountReceivableStatus.CANCELADA,
        Client.is_delinquent.is_(True),
    )
    overdue_cond = and_(
        AccountReceivable.status != AccountReceivableStatus.CANCELADA,
        AccountReceivable.amount_received < AccountReceivable.amount,
        AccountReceivable.due_date < today,
    )
    receivables = (
        db.query(AccountReceivable, Client)
        .join(Client, Client.id == AccountReceivable.client_id)
        .filter(
            AccountReceivable.deleted_at.is_(None),
            or_(manual_cond, overdue_cond),
        )
        .order_by(AccountReceivable.due_date.asc())
        .all()
    )
    return [
        DefaulterItem(
            client_id=client.id,
            client_name=client.name,
            receivable_id=receivable.id,
            receivable_number=receivable.number,
            amount=receivable.amount,
            amount_received=receivable.amount_received,
            due_date=receivable.due_date,
        )
        for receivable, client in receivables
    ]


# ---------------------------------------------------------------------------
# Aprovação de folha (Demanda 4 — o dinheiro só se move na aprovação)
# ---------------------------------------------------------------------------


def list_payroll_approvals(db: Session) -> list[dict]:
    """Fila de solicitações de pagamento de folha aguardando aprovação."""
    from app.modules.folha import service as folha_service

    requests = folha_service.list_pending_payment_requests(db)
    return [folha_service.serialize_payment_request(db, r) for r in requests]


def approve_payroll_request(db: Session, request_id: UUID) -> dict:
    """Aprova uma solicitação de folha: paga, lança movimentos e emite NFs.

    Espelha a aprovação do Compras. Valida saldo >= total (sem pagamento parcial:
    ou cobre o total ou recusa). Para cada holerite da solicitação: registra o
    movimento ``SAIDA/FOLHA`` (o débito real), marca a entry ``pago`` e emite a NF
    de folha. Marca a solicitação ``aprovada`` + ``decided_at``.
    """
    from app.modules.faturamento import service as fat_service
    from app.modules.folha import service as folha_service

    request = folha_service.get_payment_request_or_404(db, request_id)
    if request.status != folha_service.REQUEST_STATUS_PENDING:
        raise HTTPException(
            status_code=400, detail="Solicitação de pagamento já foi decidida"
        )

    total = Decimal(str(request.total_amount))
    saldo = Decimal(str(get_balance(db).saldo))
    if saldo < total:
        raise HTTPException(
            status_code=400,
            detail="Saldo insuficiente para aprovar o pagamento da folha",
        )

    period = request.period
    competency = (
        f"{period.competency_month:02d}/{period.competency_year}" if period else ""
    )
    entries = folha_service.get_entries_of_request(db, request)
    for entry in entries:
        amount = Decimal(str(entry.net_amount))
        employee = entry.employee
        employee_name = employee.name if employee else str(entry.employee_id)
        registrar_movimento(
            db,
            movement_type=MovementType.SAIDA,
            category=FinancialCategory.FOLHA,
            amount=amount,
            description=f"Pagamento de salário: {employee_name} — {competency}",
            source_module="folha",
            reference_id=entry.id,
        )
        folha_service.mark_entry_paid(db, entry.id)
        fat_service.criar_nota_folha(db, entry, period)

    folha_service.mark_request_decided(
        db, request, status=folha_service.REQUEST_STATUS_APPROVED
    )
    reloaded = folha_service.get_payment_request_or_404(db, request_id)
    return folha_service.serialize_payment_request(db, reloaded)


def refuse_payroll_request(db: Session, request_id: UUID, note: str) -> dict:
    """Recusa uma solicitação: holerites voltam a ``pendente``; sem movimento."""
    from app.modules.folha import service as folha_service

    request = folha_service.get_payment_request_or_404(db, request_id)
    if request.status != folha_service.REQUEST_STATUS_PENDING:
        raise HTTPException(
            status_code=400, detail="Solicitação de pagamento já foi decidida"
        )

    folha_service.revert_request_entries_to_pending(db, request)
    folha_service.mark_request_decided(
        db,
        request,
        status=folha_service.REQUEST_STATUS_REFUSED,
        approval_note=note,
    )
    reloaded = folha_service.get_payment_request_or_404(db, request_id)
    return folha_service.serialize_payment_request(db, reloaded)
