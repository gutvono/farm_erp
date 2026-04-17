from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.dashboard import service as dashboard_service
from app.modules.dashboard.schemas import NotificationOut
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


@router.get("/", response_model=SuccessResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    data = dashboard_service.get_dashboard(db)
    return success("Dashboard carregado com sucesso", data.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


@router.get("/notificacoes", response_model=SuccessResponse)
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    notifications = dashboard_service.get_notifications(db, unread_only=unread_only)
    data = [NotificationOut.from_model(n).model_dump(mode="json") for n in notifications]
    return success("Notificações listadas com sucesso", data)


@router.get("/notificacoes/count", response_model=SuccessResponse)
def count_unread(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    unread = dashboard_service.get_unread_count(db)
    return success("Contagem obtida com sucesso", {"unread": unread})


@router.patch("/notificacoes/todas-lidas", response_model=SuccessResponse)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    count = dashboard_service.mark_all_read(db)
    return success(
        f"{count} notificação(ões) marcada(s) como lida(s)",
        {"marked": count},
    )


@router.patch("/notificacoes/{notification_id}/lida", response_model=SuccessResponse)
def mark_notification_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    notification = dashboard_service.mark_notification_read(db, notification_id)
    return success(
        "Notificação marcada como lida",
        NotificationOut.from_model(notification).model_dump(mode="json"),
    )
