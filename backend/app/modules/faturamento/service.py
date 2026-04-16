from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session


def criar_fatura(
    db: Session,
    *,
    sale_id: Optional[UUID] = None,
    client_id: UUID,
    items: list,
    total_amount: Decimal,
    source_module: str = "comercial",
) -> None:
    """Placeholder — será implementado no módulo Faturamento."""
    pass
