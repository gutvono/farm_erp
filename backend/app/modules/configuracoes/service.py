from decimal import Decimal, InvalidOperation
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.configuracoes import repository as config_repo
from app.modules.configuracoes.model import StockCategory
from app.modules.configuracoes.schemas import (
    EncargosOut,
    EncargosUpdate,
    HarvestDestinationsOut,
    HarvestDestinationsUpdate,
    StockCategoryCreate,
    StockCategoryOut,
    StockCategoryUpdate,
)
from app.modules.estoque import repository as estoque_repo
from app.shared.enums import SystemRole
from app.shared.pagination import Page, PageParams


# Chaves de app_settings para os 3 itens-destino da colheita (D1).
HARVEST_INDUSTRIA_KEY = "harvest_destination_industria_item_id"
HARVEST_EMBALAGEM_KEY = "harvest_destination_embalagem_item_id"
HARVEST_DESCARTE_KEY = "harvest_destination_descarte_item_id"

# Chaves de app_settings para as taxas de encargo por atraso (Demanda 9.B).
MULTA_ATRASO_KEY = "multa_atraso_percent"
JUROS_MORA_MENSAL_KEY = "juros_mora_mensal_percent"
DEFAULT_MULTA_ATRASO_PERCENT = Decimal("2")
DEFAULT_JUROS_MORA_MENSAL_PERCENT = Decimal("1")


# ---------------------------------------------------------------------------
# Categorias
# ---------------------------------------------------------------------------


def _get_category_or_404(db: Session, category_id: UUID) -> StockCategory:
    category = config_repo.get_category(db, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return category


def create_category(db: Session, data: StockCategoryCreate) -> StockCategory:
    if config_repo.get_category_by_name(db, data.name):
        raise HTTPException(
            status_code=400, detail="Já existe uma categoria com este nome"
        )
    return config_repo.create_category(
        db,
        name=data.name,
        description=data.description,
        is_active=data.is_active,
    )


def list_categories(db: Session, *, params: PageParams) -> Page[StockCategoryOut]:
    categories, total = config_repo.list_categories_paginated(db, params=params)
    items = [StockCategoryOut.from_model(c) for c in categories]
    return Page.create(items=items, total=total, params=params)


def get_category(db: Session, category_id: UUID) -> StockCategory:
    return _get_category_or_404(db, category_id)


def update_category(
    db: Session, category_id: UUID, data: StockCategoryUpdate
) -> StockCategory:
    category = _get_category_or_404(db, category_id)
    fields = data.model_dump(exclude_unset=True)
    new_name = fields.get("name")
    if new_name and new_name != category.name:
        if config_repo.get_category_by_name(db, new_name):
            raise HTTPException(
                status_code=400, detail="Já existe uma categoria com este nome"
            )
    return config_repo.update_category(db, category_id, fields)


def delete_category(db: Session, category_id: UUID) -> StockCategory:
    _get_category_or_404(db, category_id)
    active_items = config_repo.count_active_items_by_category(db, category_id)
    if active_items > 0:
        raise HTTPException(
            status_code=400,
            detail="Não é possível excluir uma categoria com itens vinculados",
        )
    return config_repo.soft_delete_category(db, category_id)


# ---------------------------------------------------------------------------
# Papéis (roles)
# ---------------------------------------------------------------------------


def list_roles() -> list[str]:
    """Lista os valores do enum SystemRole (vocabulário fixo de papéis)."""
    return [role.value for role in SystemRole]


def update_category_roles(
    db: Session, category_id: UUID, roles: list[SystemRole]
) -> StockCategory:
    _get_category_or_404(db, category_id)
    config_repo.replace_category_roles(db, category_id, roles)
    # Recarrega a categoria com as novas assignments para serializar.
    return _get_category_or_404(db, category_id)


# ---------------------------------------------------------------------------
# Destinos da colheita (app_settings)
# ---------------------------------------------------------------------------


def _setting_uuid(db: Session, key: str) -> Optional[UUID]:
    setting = config_repo.get_setting(db, key)
    if not setting or not setting.value:
        return None
    try:
        return UUID(setting.value)
    except ValueError:
        return None


def get_harvest_destinations(db: Session) -> HarvestDestinationsOut:
    return HarvestDestinationsOut(
        industria_item_id=_setting_uuid(db, HARVEST_INDUSTRIA_KEY),
        embalagem_item_id=_setting_uuid(db, HARVEST_EMBALAGEM_KEY),
        descarte_item_id=_setting_uuid(db, HARVEST_DESCARTE_KEY),
    )


def update_harvest_destinations(
    db: Session, data: HarvestDestinationsUpdate
) -> HarvestDestinationsOut:
    # Os 3 itens-destino devem existir no estoque.
    pairs = (
        ("indústria", data.industria_item_id),
        ("embalagem", data.embalagem_item_id),
        ("descarte", data.descarte_item_id),
    )
    for label, item_id in pairs:
        if not estoque_repo.get_item(db, item_id):
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque de destino ({label}) não encontrado",
            )

    config_repo.set_setting(db, HARVEST_INDUSTRIA_KEY, str(data.industria_item_id))
    config_repo.set_setting(db, HARVEST_EMBALAGEM_KEY, str(data.embalagem_item_id))
    config_repo.set_setting(db, HARVEST_DESCARTE_KEY, str(data.descarte_item_id))
    return get_harvest_destinations(db)


# ---------------------------------------------------------------------------
# Encargos de atraso (multa/juros) — app_settings (Demanda 9.B)
# ---------------------------------------------------------------------------


def _setting_decimal(db: Session, key: str, default: Decimal) -> Decimal:
    """Lê uma taxa (Decimal) de app_settings; usa `default` se ausente/inválida."""
    setting = config_repo.get_setting(db, key)
    if not setting or setting.value is None:
        return default
    try:
        return Decimal(str(setting.value))
    except (InvalidOperation, ValueError):
        return default


def get_encargos(db: Session) -> EncargosOut:
    return EncargosOut(
        multa_atraso_percent=_setting_decimal(
            db, MULTA_ATRASO_KEY, DEFAULT_MULTA_ATRASO_PERCENT
        ),
        juros_mora_mensal_percent=_setting_decimal(
            db, JUROS_MORA_MENSAL_KEY, DEFAULT_JUROS_MORA_MENSAL_PERCENT
        ),
    )


def update_encargos(db: Session, data: EncargosUpdate) -> EncargosOut:
    config_repo.set_setting(
        db, MULTA_ATRASO_KEY, str(data.multa_atraso_percent)
    )
    config_repo.set_setting(
        db, JUROS_MORA_MENSAL_KEY, str(data.juros_mora_mensal_percent)
    )
    return get_encargos(db)


# ---------------------------------------------------------------------------
# Helpers públicos — consumidos por outros módulos (PCP, Estoque, Comercial)
# ---------------------------------------------------------------------------


def get_item_ids_by_role(db: Session, role: SystemRole) -> list[UUID]:
    """IDs de stock_items ativos cujas categorias têm o papel informado."""
    return config_repo.list_item_ids_by_role(db, role)


def get_categories_by_role(db: Session, role: SystemRole) -> list[StockCategory]:
    """Categorias (ativas) que têm o papel informado."""
    return config_repo.list_categories_by_role(db, role)


def get_harvest_destination_item_ids(db: Session) -> dict[str, Optional[UUID]]:
    """Os 3 itens-destino da colheita: {industria, embalagem, descarte}."""
    return {
        "industria": _setting_uuid(db, HARVEST_INDUSTRIA_KEY),
        "embalagem": _setting_uuid(db, HARVEST_EMBALAGEM_KEY),
        "descarte": _setting_uuid(db, HARVEST_DESCARTE_KEY),
    }


# ---------------------------------------------------------------------------
# Serialização (usada pelo router)
# ---------------------------------------------------------------------------


def serialize_category(category: StockCategory) -> dict:
    return StockCategoryOut.from_model(category).model_dump(mode="json")
