from sqlalchemy import Boolean, Column, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.shared.base_model import TimestampMixin, UUIDMixin
from app.shared.enums import NotificationType, sa_enum_values


class Notification(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notifications"

    type = Column(
        SAEnum(
            NotificationType,
            name="notification_type",
            values_callable=sa_enum_values,
        ),
        nullable=False,
        default=NotificationType.INFO,
    )
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    module = Column(String(50), nullable=True, index=True)
    link = Column(String(500), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<Notification {self.title}>"
