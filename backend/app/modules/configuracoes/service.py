from decimal import Decimal, InvalidOperation
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.configuracoes import repository as config_repo
from app.modules.configuracoes.model import StockCategory
from app.modules.configuracoes.schemas import (
    EmitenteOut,
    EmitenteUpdate,
    EncargosOut,
    EncargosUpdate,
    ImpostosOut,
    ImpostosUpdate,
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

# Chaves de app_settings para as alíquotas fiscais (Demanda 11.2).
# Defaults = valores hoje hardcoded no frontend (FaturaCard.tsx).
ICMS_PERCENT_KEY = "icms_percent"
PIS_PERCENT_KEY = "pis_percent"
COFINS_PERCENT_KEY = "cofins_percent"
IPI_PERCENT_KEY = "ipi_percent"
DEFAULT_ICMS_PERCENT = Decimal("12")
DEFAULT_PIS_PERCENT = Decimal("0.65")
DEFAULT_COFINS_PERCENT = Decimal("3")
DEFAULT_IPI_PERCENT = Decimal("0")

# Chaves de app_settings para o emitente da fazenda (Demanda 11.1).
# Dados exibidos no cabeçalho da NF (razão social, CNPJ, IE, endereço).
EMITTER_LEGAL_NAME_KEY = "emitter_legal_name"
EMITTER_TRADE_NAME_KEY = "emitter_trade_name"
EMITTER_CNPJ_KEY = "emitter_cnpj"
EMITTER_STATE_REGISTRATION_KEY = "emitter_state_registration"
EMITTER_CEP_KEY = "emitter_cep"
EMITTER_STREET_KEY = "emitter_street"
EMITTER_NUMBER_KEY = "emitter_number"
EMITTER_COMPLEMENT_KEY = "emitter_complement"
EMITTER_NEIGHBORHOOD_KEY = "emitter_neighborhood"
EMITTER_CITY_KEY = "emitter_city"
EMITTER_STATE_KEY = "emitter_state"
EMITTER_PHONE_KEY = "emitter_phone"
EMITTER_EMAIL_KEY = "emitter_email"

# Defaults fictícios (fazenda de café em MG) — semeados no seed.sql.
DEFAULT_EMITTER_LEGAL_NAME = "Fazenda Santa Esperança Café Ltda"
DEFAULT_EMITTER_TRADE_NAME = "Café Santa Esperança"
DEFAULT_EMITTER_CNPJ = "12.345.678/0001-90"
DEFAULT_EMITTER_STATE_REGISTRATION = "062.307.831.0500"
DEFAULT_EMITTER_CEP = "35400-000"
DEFAULT_EMITTER_STREET = "Rodovia MG-187, km 12"
DEFAULT_EMITTER_NUMBER = "s/n"
DEFAULT_EMITTER_COMPLEMENT = "Zona Rural"
DEFAULT_EMITTER_NEIGHBORHOOD = "Distrito de São Bartolomeu"
DEFAULT_EMITTER_CITY = "Ouro Preto"
DEFAULT_EMITTER_STATE = "MG"
DEFAULT_EMITTER_PHONE = "(31) 3551-7788"
DEFAULT_EMITTER_EMAIL = "contato@cafesantaesperanca.com.br"


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
# Impostos (alíquotas fiscais) — app_settings (Demanda 11.2)
# ---------------------------------------------------------------------------


def get_impostos(db: Session) -> ImpostosOut:
    return ImpostosOut(
        icms_percent=_setting_decimal(db, ICMS_PERCENT_KEY, DEFAULT_ICMS_PERCENT),
        pis_percent=_setting_decimal(db, PIS_PERCENT_KEY, DEFAULT_PIS_PERCENT),
        cofins_percent=_setting_decimal(
            db, COFINS_PERCENT_KEY, DEFAULT_COFINS_PERCENT
        ),
        ipi_percent=_setting_decimal(db, IPI_PERCENT_KEY, DEFAULT_IPI_PERCENT),
    )


def update_impostos(db: Session, data: ImpostosUpdate) -> ImpostosOut:
    config_repo.set_setting(db, ICMS_PERCENT_KEY, str(data.icms_percent))
    config_repo.set_setting(db, PIS_PERCENT_KEY, str(data.pis_percent))
    config_repo.set_setting(db, COFINS_PERCENT_KEY, str(data.cofins_percent))
    config_repo.set_setting(db, IPI_PERCENT_KEY, str(data.ipi_percent))
    return get_impostos(db)


# ---------------------------------------------------------------------------
# Emitente da fazenda (dados da empresa que emite a NF) — app_settings (D11.1)
# ---------------------------------------------------------------------------


def _setting_str(db: Session, key: str, default: str) -> str:
    """Lê um texto de app_settings; usa `default` se ausente/vazio."""
    setting = config_repo.get_setting(db, key)
    if not setting or setting.value is None:
        return default
    return str(setting.value)


def get_emitente(db: Session) -> EmitenteOut:
    return EmitenteOut(
        legal_name=_setting_str(
            db, EMITTER_LEGAL_NAME_KEY, DEFAULT_EMITTER_LEGAL_NAME
        ),
        trade_name=_setting_str(
            db, EMITTER_TRADE_NAME_KEY, DEFAULT_EMITTER_TRADE_NAME
        ),
        cnpj=_setting_str(db, EMITTER_CNPJ_KEY, DEFAULT_EMITTER_CNPJ),
        state_registration=_setting_str(
            db, EMITTER_STATE_REGISTRATION_KEY, DEFAULT_EMITTER_STATE_REGISTRATION
        ),
        cep=_setting_str(db, EMITTER_CEP_KEY, DEFAULT_EMITTER_CEP),
        street=_setting_str(db, EMITTER_STREET_KEY, DEFAULT_EMITTER_STREET),
        number=_setting_str(db, EMITTER_NUMBER_KEY, DEFAULT_EMITTER_NUMBER),
        complement=_setting_str(
            db, EMITTER_COMPLEMENT_KEY, DEFAULT_EMITTER_COMPLEMENT
        ),
        neighborhood=_setting_str(
            db, EMITTER_NEIGHBORHOOD_KEY, DEFAULT_EMITTER_NEIGHBORHOOD
        ),
        city=_setting_str(db, EMITTER_CITY_KEY, DEFAULT_EMITTER_CITY),
        state=_setting_str(db, EMITTER_STATE_KEY, DEFAULT_EMITTER_STATE),
        phone=_setting_str(db, EMITTER_PHONE_KEY, DEFAULT_EMITTER_PHONE),
        email=_setting_str(db, EMITTER_EMAIL_KEY, DEFAULT_EMITTER_EMAIL),
    )


def update_emitente(db: Session, data: EmitenteUpdate) -> EmitenteOut:
    config_repo.set_setting(db, EMITTER_LEGAL_NAME_KEY, data.legal_name)
    config_repo.set_setting(db, EMITTER_TRADE_NAME_KEY, data.trade_name)
    config_repo.set_setting(db, EMITTER_CNPJ_KEY, data.cnpj)
    config_repo.set_setting(
        db, EMITTER_STATE_REGISTRATION_KEY, data.state_registration
    )
    config_repo.set_setting(db, EMITTER_CEP_KEY, data.cep)
    config_repo.set_setting(db, EMITTER_STREET_KEY, data.street)
    config_repo.set_setting(db, EMITTER_NUMBER_KEY, data.number)
    config_repo.set_setting(db, EMITTER_COMPLEMENT_KEY, data.complement)
    config_repo.set_setting(db, EMITTER_NEIGHBORHOOD_KEY, data.neighborhood)
    config_repo.set_setting(db, EMITTER_CITY_KEY, data.city)
    config_repo.set_setting(db, EMITTER_STATE_KEY, data.state)
    config_repo.set_setting(db, EMITTER_PHONE_KEY, data.phone)
    config_repo.set_setting(db, EMITTER_EMAIL_KEY, data.email)
    return get_emitente(db)


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
