"""Models do módulo Configurações (Demanda 3 / decisões D2 e D3).

- `StockCategory` (tabela `stock_categories`): categoria de estoque cadastrável
  pelo usuário, substitui o enum fixo `stock_category`. NÃO confundir com o enum
  `app.shared.enums.StockCategory` (cafe/insumo/...), que será removido no passo
  Backend; aqui a categoria é uma ENTIDADE de negócio (soft delete).
- `CategoryRoleAssignment` (tabela `category_role_assignments`): mapeamento M:N
  categoria → papel de sistema (`system_role`). Ex.: a categoria "Café" pode ter
  os papéis `produto_final` E `produto_vendavel` (duas linhas).
- `AppSetting` (tabela `app_settings`): key-value de configuração. Guarda, entre
  outros, os 3 itens-destino da colheita (D1): chaves
  `harvest_destination_industria_item_id`, `_embalagem_item_id`, `_descarte_item_id`.
"""
from sqlalchemy import Boolean, Column, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.schema import UniqueConstraint

from app.core.database import Base
from app.shared.base_model import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.shared.enums import SystemRole, sa_enum_values


class StockCategory(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "stock_categories"

    # unique=True + index=True → único índice unique `ix_stock_categories_name`
    # (espelha a migration 0015).
    name = Column(String(120), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    role_assignments = relationship(
        "CategoryRoleAssignment",
        back_populates="category",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<StockCategory {self.name}>"


class CategoryRoleAssignment(UUIDMixin, TimestampMixin, Base):
    """M:N categoria ↔ papel de sistema. Tabela de ligação (sem soft delete)."""

    __tablename__ = "category_role_assignments"
    __table_args__ = (
        UniqueConstraint("category_id", "role", name="uq_category_role"),
    )

    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "stock_categories.id",
            name="fk_cra_category",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    role = Column(
        SAEnum(SystemRole, name="system_role", values_callable=sa_enum_values),
        nullable=False,
        index=True,
    )

    category = relationship("StockCategory", back_populates="role_assignments")

    def __repr__(self) -> str:
        return f"<CategoryRoleAssignment {self.category_id} {self.role}>"


class AppSetting(UUIDMixin, TimestampMixin, Base):
    """Configuração key-value (sem soft delete)."""

    __tablename__ = "app_settings"

    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(String(500), nullable=True)

    def __repr__(self) -> str:
        return f"<AppSetting {self.key}={self.value}>"
