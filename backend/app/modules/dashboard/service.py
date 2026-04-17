from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.dashboard import repository as dashboard_repo
from app.modules.dashboard.schemas import CashFlowPoint, DashboardKPIs, DashboardOut
from app.shared.enums import NotificationType
from app.shared.models import Notification


# ---------------------------------------------------------------------------
# Type coercion helper
# ---------------------------------------------------------------------------

_TYPE_MAP: dict[str, NotificationType] = {
    "info": NotificationType.INFO,
    "warning": NotificationType.WARNING,
    "error": NotificationType.ERROR,
    "success": NotificationType.SUCCESS,
    # Map module names / legacy strings to sensible defaults
    "estoque": NotificationType.WARNING,
    "pcp": NotificationType.INFO,
    "financeiro": NotificationType.INFO,
    "comercial": NotificationType.INFO,
    "compras": NotificationType.INFO,
    "folha": NotificationType.INFO,
}


def _resolve_type(type_str: str) -> NotificationType:
    """Map an arbitrary string to a NotificationType, defaulting to INFO."""
    return _TYPE_MAP.get(type_str.lower(), NotificationType.INFO)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


def criar_notificacao(
    db: Session,
    title: str,
    message: str,
    type: str,
    module: str,
    link: Optional[str] = None,
) -> Notification:
    """
    Create a notification.
    Called by other modules (estoque, pcp, ...) to surface alerts in the UI bell.
    The `type` parameter accepts both NotificationType values and module-name
    strings (e.g. "estoque") — they are mapped to the appropriate enum value.
    """
    resolved_type = _resolve_type(type)
    return dashboard_repo.create_notification(
        db,
        title=title,
        message=message,
        type=resolved_type,
        module=module,
        link=link,
    )


def get_notifications(
    db: Session, *, unread_only: bool = False
) -> list[Notification]:
    read_filter: Optional[bool] = False if unread_only else None
    return dashboard_repo.list_notifications(db, read=read_filter)


def mark_notification_read(db: Session, notification_id: UUID) -> Notification:
    notification = dashboard_repo.get_notification(db, notification_id)
    if not notification:
        raise HTTPException(
            status_code=404, detail="Notificação não encontrada"
        )
    updated = dashboard_repo.mark_as_read(db, notification_id)
    return updated


def mark_all_read(db: Session) -> int:
    return dashboard_repo.mark_all_as_read(db)


def get_unread_count(db: Session) -> int:
    return dashboard_repo.count_unread(db)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


def get_dashboard(db: Session) -> DashboardOut:
    kpi_data = dashboard_repo.get_kpis(db)
    cash_flow_data = dashboard_repo.get_cash_flow(db, months=6)

    kpis = DashboardKPIs(**kpi_data)
    cash_flow = [CashFlowPoint(**point) for point in cash_flow_data]

    return DashboardOut(kpis=kpis, cash_flow=cash_flow)
