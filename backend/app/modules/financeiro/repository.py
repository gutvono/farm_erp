from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional, Type
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.financeiro.model import (
    AccountPayable,
    AccountReceivable,
    FinancialMovement,
)
from app.shared.enums import (
    AccountPayableStatus,
    AccountReceivableStatus,
    FinancialCategory,
    MovementType,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def next_number(db: Session, model: Type, prefix: str) -> str:
    """Generate the next document number for payables/receivables."""
    count = db.query(func.count(model.id)).scalar() or 0
    return f"{prefix}-{count + 1:04d}"


# ---------------------------------------------------------------------------
# Financial Movements
# ---------------------------------------------------------------------------


def create_movement(
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
    movement = FinancialMovement(
        movement_type=movement_type,
        category=category,
        amount=amount,
        description=description,
        source_module=source_module,
        reference_id=reference_id,
        occurred_at=occurred_at or datetime.now(timezone.utc),
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


def list_movements(
    db: Session,
    *,
    movement_type: Optional[MovementType] = None,
    category: Optional[FinancialCategory] = None,
    source_module: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[FinancialMovement]:
    query = db.query(FinancialMovement)
    if movement_type:
        query = query.filter(FinancialMovement.movement_type == movement_type)
    if category:
        query = query.filter(FinancialMovement.category == category)
    if source_module:
        query = query.filter(FinancialMovement.source_module == source_module)
    if start_date:
        query = query.filter(FinancialMovement.occurred_at >= start_date)
    if end_date:
        query = query.filter(FinancialMovement.occurred_at <= end_date)
    return query.order_by(FinancialMovement.occurred_at.desc()).all()


def sum_by_type(db: Session, movement_type: MovementType) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(FinancialMovement.amount), 0))
        .filter(FinancialMovement.movement_type == movement_type)
        .scalar()
    )
    return Decimal(total)


def cash_flow_by_month(
    db: Session, *, start_date: datetime, end_date: datetime
) -> list[tuple[str, MovementType, Decimal]]:
    """Return [(YYYY-MM, movement_type, total_amount), ...] in the given range."""
    month_expr = func.to_char(FinancialMovement.occurred_at, "YYYY-MM")
    rows = (
        db.query(
            month_expr.label("period"),
            FinancialMovement.movement_type,
            func.coalesce(func.sum(FinancialMovement.amount), 0).label("total"),
        )
        .filter(FinancialMovement.occurred_at >= start_date)
        .filter(FinancialMovement.occurred_at <= end_date)
        .group_by("period", FinancialMovement.movement_type)
        .order_by("period")
        .all()
    )
    return [(row.period, row.movement_type, Decimal(row.total)) for row in rows]


# ---------------------------------------------------------------------------
# Accounts Payable
# ---------------------------------------------------------------------------


def create_payable(
    db: Session,
    *,
    number: str,
    description: str,
    amount: Decimal,
    due_date: date,
    supplier_id: Optional[UUID] = None,
    purchase_order_id: Optional[UUID] = None,
    notes: Optional[str] = None,
) -> AccountPayable:
    payable = AccountPayable(
        number=number,
        description=description,
        amount=amount,
        due_date=due_date,
        supplier_id=supplier_id,
        purchase_order_id=purchase_order_id,
        notes=notes,
    )
    db.add(payable)
    db.commit()
    db.refresh(payable)
    return payable


def get_payable(db: Session, payable_id: UUID) -> Optional[AccountPayable]:
    return (
        db.query(AccountPayable)
        .filter(
            AccountPayable.id == payable_id,
            AccountPayable.deleted_at.is_(None),
        )
        .first()
    )


def list_payables(
    db: Session,
    *,
    status: Optional[AccountPayableStatus] = None,
    supplier_id: Optional[UUID] = None,
    due_before: Optional[date] = None,
    due_after: Optional[date] = None,
) -> list[AccountPayable]:
    query = db.query(AccountPayable).filter(AccountPayable.deleted_at.is_(None))
    if status:
        query = query.filter(AccountPayable.status == status)
    if supplier_id:
        query = query.filter(AccountPayable.supplier_id == supplier_id)
    if due_before:
        query = query.filter(AccountPayable.due_date <= due_before)
    if due_after:
        query = query.filter(AccountPayable.due_date >= due_after)
    return query.order_by(AccountPayable.due_date.asc()).all()


def save(db: Session, instance) -> None:
    db.add(instance)
    db.commit()
    db.refresh(instance)


# ---------------------------------------------------------------------------
# Accounts Receivable
# ---------------------------------------------------------------------------


def create_receivable(
    db: Session,
    *,
    number: str,
    client_id: UUID,
    description: str,
    amount: Decimal,
    due_date: date,
    sale_id: Optional[UUID] = None,
    invoice_id: Optional[UUID] = None,
    notes: Optional[str] = None,
) -> AccountReceivable:
    receivable = AccountReceivable(
        number=number,
        client_id=client_id,
        description=description,
        amount=amount,
        due_date=due_date,
        sale_id=sale_id,
        invoice_id=invoice_id,
        notes=notes,
    )
    db.add(receivable)
    db.commit()
    db.refresh(receivable)
    return receivable


def get_receivable(db: Session, receivable_id: UUID) -> Optional[AccountReceivable]:
    return (
        db.query(AccountReceivable)
        .filter(
            AccountReceivable.id == receivable_id,
            AccountReceivable.deleted_at.is_(None),
        )
        .first()
    )


def list_receivables(
    db: Session,
    *,
    status: Optional[AccountReceivableStatus] = None,
    client_id: Optional[UUID] = None,
    due_before: Optional[date] = None,
    due_after: Optional[date] = None,
) -> list[AccountReceivable]:
    query = db.query(AccountReceivable).filter(AccountReceivable.deleted_at.is_(None))
    if status:
        query = query.filter(AccountReceivable.status == status)
    if client_id:
        query = query.filter(AccountReceivable.client_id == client_id)
    if due_before:
        query = query.filter(AccountReceivable.due_date <= due_before)
    if due_after:
        query = query.filter(AccountReceivable.due_date >= due_after)
    return query.order_by(AccountReceivable.due_date.asc()).all()


def count_delinquent_receivables_by_client(db: Session, client_id: UUID) -> int:
    return (
        db.query(func.count(AccountReceivable.id))
        .filter(
            AccountReceivable.client_id == client_id,
            AccountReceivable.status == AccountReceivableStatus.CANCELADA,
            AccountReceivable.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
