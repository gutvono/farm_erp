from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.shared.enums import NotificationType


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class NotificationOut(BaseModel):
    id: UUID
    type: NotificationType
    title: str
    message: str
    module: Optional[str] = None
    read: bool  # exposed as "read" in the API; maps from model field "is_read"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, notification) -> "NotificationOut":
        return cls(
            id=notification.id,
            type=notification.type,
            title=notification.title,
            message=notification.message,
            module=notification.module,
            read=notification.is_read,
            created_at=notification.created_at,
        )


# ---------------------------------------------------------------------------
# Dashboard KPIs
# ---------------------------------------------------------------------------


class DashboardKPIs(BaseModel):
    balance: float
    monthly_revenue: float
    monthly_expenses: float
    pending_payables: int
    pending_receivables: int
    low_stock_items: int
    open_production_orders: int
    defaulter_clients: int


class CashFlowPoint(BaseModel):
    month: str  # "MM/YYYY"
    income: float
    expenses: float


class DashboardOut(BaseModel):
    kpis: DashboardKPIs
    cash_flow: list[CashFlowPoint]
