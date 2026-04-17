from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.shared.enums import (
    AccountPayableStatus,
    AccountReceivableStatus,
    MovementType,
    NotificationType,
    ProductionOrderStatus,
)
from app.shared.models import Notification


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


def create_notification(
    db: Session,
    *,
    title: str,
    message: str,
    type: NotificationType,
    module: Optional[str] = None,
    link: Optional[str] = None,
) -> Notification:
    notification = Notification(
        title=title,
        message=message,
        type=type,
        module=module,
        link=link,
        is_read=False,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def list_notifications(
    db: Session, *, read: Optional[bool] = None
) -> list[Notification]:
    query = db.query(Notification)
    if read is not None:
        query = query.filter(Notification.is_read == read)
    return query.order_by(Notification.created_at.desc()).all()


def get_notification(db: Session, notification_id: UUID) -> Optional[Notification]:
    return (
        db.query(Notification)
        .filter(Notification.id == notification_id)
        .first()
    )


def mark_as_read(db: Session, notification_id: UUID) -> Optional[Notification]:
    notification = get_notification(db, notification_id)
    if not notification:
        return None
    notification.is_read = True
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def mark_all_as_read(db: Session) -> int:
    result = (
        db.query(Notification)
        .filter(Notification.is_read.is_(False))
        .update({"is_read": True}, synchronize_session="fetch")
    )
    db.commit()
    return result


def count_unread(db: Session) -> int:
    return (
        db.query(func.count(Notification.id))
        .filter(Notification.is_read.is_(False))
        .scalar()
        or 0
    )


# ---------------------------------------------------------------------------
# Dashboard KPIs
# ---------------------------------------------------------------------------


def get_kpis(db: Session) -> dict:
    from app.modules.comercial.model import Client
    from app.modules.estoque.model import StockItem
    from app.modules.financeiro.model import (
        AccountPayable,
        AccountReceivable,
        FinancialMovement,
    )
    from app.modules.pcp.model import ProductionOrder

    # ---------- Balance (all time) ----------
    entrada_total = (
        db.query(func.coalesce(func.sum(FinancialMovement.amount), 0))
        .filter(FinancialMovement.movement_type == MovementType.ENTRADA)
        .scalar()
    )
    saida_total = (
        db.query(func.coalesce(func.sum(FinancialMovement.amount), 0))
        .filter(FinancialMovement.movement_type == MovementType.SAIDA)
        .scalar()
    )
    balance = float(entrada_total) - float(saida_total)

    # ---------- Monthly revenue / expenses ----------
    now = datetime.now(timezone.utc)
    monthly_revenue = (
        db.query(func.coalesce(func.sum(FinancialMovement.amount), 0))
        .filter(
            FinancialMovement.movement_type == MovementType.ENTRADA,
            func.extract("year", FinancialMovement.occurred_at) == now.year,
            func.extract("month", FinancialMovement.occurred_at) == now.month,
        )
        .scalar()
    )
    monthly_expenses = (
        db.query(func.coalesce(func.sum(FinancialMovement.amount), 0))
        .filter(
            FinancialMovement.movement_type == MovementType.SAIDA,
            func.extract("year", FinancialMovement.occurred_at) == now.year,
            func.extract("month", FinancialMovement.occurred_at) == now.month,
        )
        .scalar()
    )

    # ---------- Pending payables ----------
    pending_payables = (
        db.query(func.count(AccountPayable.id))
        .filter(
            AccountPayable.status == AccountPayableStatus.EM_ABERTO,
            AccountPayable.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    # ---------- Pending receivables ----------
    pending_receivables = (
        db.query(func.count(AccountReceivable.id))
        .filter(
            AccountReceivable.status == AccountReceivableStatus.EM_ABERTO,
            AccountReceivable.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    # ---------- Low stock items ----------
    low_stock_items = (
        db.query(func.count(StockItem.id))
        .filter(
            StockItem.quantity_on_hand < StockItem.minimum_stock,
            StockItem.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    # ---------- Open production orders ----------
    open_production_orders = (
        db.query(func.count(ProductionOrder.id))
        .filter(
            ProductionOrder.status.in_(
                [ProductionOrderStatus.PLANEJADA, ProductionOrderStatus.EM_PRODUCAO]
            ),
            ProductionOrder.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    # ---------- Defaulter clients ----------
    defaulter_clients = (
        db.query(func.count(Client.id))
        .filter(
            Client.is_delinquent.is_(True),
            Client.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    return {
        "balance": balance,
        "monthly_revenue": float(monthly_revenue),
        "monthly_expenses": float(monthly_expenses),
        "pending_payables": int(pending_payables),
        "pending_receivables": int(pending_receivables),
        "low_stock_items": int(low_stock_items),
        "open_production_orders": int(open_production_orders),
        "defaulter_clients": int(defaulter_clients),
    }


# ---------------------------------------------------------------------------
# Cash flow
# ---------------------------------------------------------------------------


def get_cash_flow(db: Session, months: int = 6) -> list[dict]:
    from app.modules.financeiro.model import FinancialMovement

    now = datetime.now(timezone.utc)
    # Start of the month (months-1) months ago
    start = (now.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1)

    rows = (
        db.query(
            func.date_trunc("month", FinancialMovement.occurred_at).label(
                "month_trunc"
            ),
            FinancialMovement.movement_type,
            func.sum(FinancialMovement.amount).label("total"),
        )
        .filter(FinancialMovement.occurred_at >= start)
        .group_by(
            func.date_trunc("month", FinancialMovement.occurred_at),
            FinancialMovement.movement_type,
        )
        .order_by(func.date_trunc("month", FinancialMovement.occurred_at).asc())
        .all()
    )

    # Aggregate into a dict keyed by datetime for proper sorting
    buckets: dict[datetime, dict] = {}
    for row in rows:
        month_dt = row.month_trunc
        if month_dt not in buckets:
            buckets[month_dt] = {"income": 0.0, "expenses": 0.0}
        if row.movement_type == MovementType.ENTRADA:
            buckets[month_dt]["income"] = float(row.total)
        else:
            buckets[month_dt]["expenses"] = float(row.total)

    return [
        {
            "month": month_dt.strftime("%m/%Y"),
            "income": data["income"],
            "expenses": data["expenses"],
        }
        for month_dt, data in sorted(buckets.items())
    ]
