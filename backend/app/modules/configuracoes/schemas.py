from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import SystemRole


# ---------------------------------------------------------------------------
# Stock Categories
# ---------------------------------------------------------------------------


class StockCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)


class StockCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None)
    is_active: Optional[bool] = None


class StockCategoryOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    is_active: bool
    roles: list[SystemRole] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(cls, category) -> "StockCategoryOut":
        roles = sorted(
            {a.role for a in (category.role_assignments or [])},
            key=lambda r: r.value if hasattr(r, "value") else str(r),
        )
        return cls(
            id=category.id,
            name=category.name,
            description=category.description,
            is_active=category.is_active,
            roles=roles,
            created_at=category.created_at,
            updated_at=category.updated_at,
        )


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------


class CategoryRolesUpdate(BaseModel):
    """Conjunto de papéis que SUBSTITUI as assignments da categoria."""

    roles: list[SystemRole] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Harvest destinations (app_settings)
# ---------------------------------------------------------------------------


class HarvestDestinationsUpdate(BaseModel):
    industria_item_id: UUID
    embalagem_item_id: UUID
    descarte_item_id: UUID


class HarvestDestinationsOut(BaseModel):
    industria_item_id: Optional[UUID] = None
    embalagem_item_id: Optional[UUID] = None
    descarte_item_id: Optional[UUID] = None
