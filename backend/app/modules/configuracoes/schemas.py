from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


# ---------------------------------------------------------------------------
# Encargos de atraso (multa/juros) — app_settings (Demanda 9.B)
# ---------------------------------------------------------------------------


class EncargosOut(BaseModel):
    """Taxas de encargo por atraso (percentuais)."""

    multa_atraso_percent: Decimal
    juros_mora_mensal_percent: Decimal


class EncargosUpdate(BaseModel):
    multa_atraso_percent: Decimal = Field(ge=0)
    juros_mora_mensal_percent: Decimal = Field(ge=0)


# ---------------------------------------------------------------------------
# Impostos (alíquotas fiscais) — app_settings (Demanda 11.2)
# ---------------------------------------------------------------------------


class ImpostosOut(BaseModel):
    """Alíquotas fiscais (percentuais) aplicadas no cálculo da NF."""

    icms_percent: Decimal
    pis_percent: Decimal
    cofins_percent: Decimal
    ipi_percent: Decimal


class ImpostosUpdate(BaseModel):
    icms_percent: Decimal = Field(ge=0, le=100)
    pis_percent: Decimal = Field(ge=0, le=100)
    cofins_percent: Decimal = Field(ge=0, le=100)
    ipi_percent: Decimal = Field(ge=0, le=100)


# ---------------------------------------------------------------------------
# Emitente da fazenda (dados da empresa que emite a NF) — app_settings (D11.1)
# ---------------------------------------------------------------------------


class EmitenteOut(BaseModel):
    """Dados do emitente (a fazenda) exibidos no cabeçalho da NF."""

    legal_name: str
    trade_name: str
    cnpj: str
    state_registration: str
    cep: str
    street: str
    number: str
    complement: str
    neighborhood: str
    city: str
    state: str
    phone: str
    email: str


class EmitenteUpdate(BaseModel):
    legal_name: str = Field(min_length=1, max_length=255)
    trade_name: str = Field(default="", max_length=255)
    cnpj: str = Field(default="", max_length=18)
    state_registration: str = Field(default="", max_length=30)
    cep: str = Field(default="", max_length=9)
    street: str = Field(default="", max_length=255)
    number: str = Field(default="", max_length=30)
    complement: str = Field(default="", max_length=120)
    neighborhood: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    state: str = Field(default="", max_length=2)
    phone: str = Field(default="", max_length=30)
    email: str = Field(default="", max_length=255)

    @field_validator(
        "legal_name",
        "trade_name",
        "cnpj",
        "state_registration",
        "cep",
        "street",
        "number",
        "complement",
        "neighborhood",
        "city",
        "state",
        "phone",
        "email",
        mode="before",
    )
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("state")
    @classmethod
    def _upper_uf(cls, v: str) -> str:
        return v.upper()
