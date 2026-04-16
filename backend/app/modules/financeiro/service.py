from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.comercial.model import Client
from app.modules.financeiro import repository as fin_repo
from app.modules.financeiro.model import (
    AccountPayable,
    AccountReceivable,
    FinancialMovement,
)
from app.modules.financeiro.schemas import (
    AccountPayableCreate,
    AccountPayableUpdate,
    AccountReceivableCreate,
    AccountReceivableUpdate,
    BalanceOut,
    CashFlowItem,
    CashFlowOut,
    DefaulterItem,
    FinancialMovementCreate,
)
from app.shared.enums import (
    AccountPayableStatus,
    AccountReceivableStatus,
    FinancialCategory,
    MovementType,
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
) -> AccountReceivable:
    """Create an account receivable. Called by comercial/faturamento."""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
    sale_id = reference_id if source_module == "comercial" else None
    invoice_id = reference_id if source_module == "faturamento" else None
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
    )


def list_payables(db: Session, **filters) -> list[AccountPayable]:
    return fin_repo.list_payables(db, **filters)


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
    return payable


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
    )


def list_receivables(db: Session, **filters) -> list[AccountReceivable]:
    return fin_repo.list_receivables(db, **filters)


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


def receive_payment(
    db: Session,
    receivable_id: UUID,
    *,
    amount: Decimal,
    received_at: Optional[datetime] = None,
    notes: Optional[str] = None,
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

    now = received_at or datetime.now(timezone.utc)
    receivable.amount_received = Decimal(receivable.amount_received) + amount
    if receivable.amount_received >= receivable.amount:
        receivable.status = AccountReceivableStatus.QUITADO
        receivable.received_at = now
    else:
        receivable.status = AccountReceivableStatus.PARCIALMENTE_PAGO
    if notes is not None:
        receivable.notes = notes
    fin_repo.save(db, receivable)

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


def list_defaulters(db: Session) -> list[DefaulterItem]:
    receivables = (
        db.query(AccountReceivable, Client)
        .join(Client, Client.id == AccountReceivable.client_id)
        .filter(
            AccountReceivable.status == AccountReceivableStatus.CANCELADA,
            AccountReceivable.deleted_at.is_(None),
            Client.is_delinquent.is_(True),
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
