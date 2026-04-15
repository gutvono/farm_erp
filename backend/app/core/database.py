from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Import all models so Alembic autogenerate can detect them.
# Order matters: referenced tables must be imported before tables that reference them.
from app.modules.auth.model import User  # noqa: E402, F401
from app.modules.estoque.model import StockItem, StockMovement  # noqa: E402, F401
from app.modules.comercial.model import Client, Sale, SaleItem  # noqa: E402, F401
from app.modules.compras.model import (  # noqa: E402, F401
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
)
from app.modules.faturamento.model import Invoice, InvoiceItem  # noqa: E402, F401
from app.modules.financeiro.model import (  # noqa: E402, F401
    AccountPayable,
    AccountReceivable,
    FinancialMovement,
)
from app.modules.folha.model import (  # noqa: E402, F401
    Employee,
    PayrollEntry,
    PayrollPeriod,
)
from app.modules.pcp.model import (  # noqa: E402, F401
    Plot,
    PlotActivity,
    ProductionInput,
    ProductionOrder,
)
from app.shared.models import Notification  # noqa: E402, F401
