from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.configuracoes import service as config_service
from app.modules.configuracoes.schemas import (
    CategoryRolesUpdate,
    HarvestDestinationsUpdate,
    StockCategoryCreate,
    StockCategoryOut,
    StockCategoryUpdate,
)
from app.shared.pagination import Page, PageParams, get_page_params
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Categorias de estoque
# ---------------------------------------------------------------------------


@router.get("/categorias", response_model=Page[StockCategoryOut])
def list_categories(
    params: PageParams = Depends(get_page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[StockCategoryOut]:
    return config_service.list_categories(db, params=params)


@router.post("/categorias", response_model=SuccessResponse, status_code=201)
def create_category(
    body: StockCategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    category = config_service.create_category(db, body)
    return success(
        "Categoria criada com sucesso",
        config_service.serialize_category(category),
    )


@router.get("/categorias/{category_id}", response_model=SuccessResponse)
def get_category(
    category_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    category = config_service.get_category(db, category_id)
    return success(
        "Categoria obtida com sucesso",
        config_service.serialize_category(category),
    )


@router.put("/categorias/{category_id}", response_model=SuccessResponse)
def update_category(
    category_id: UUID,
    body: StockCategoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    category = config_service.update_category(db, category_id, body)
    return success(
        "Categoria atualizada com sucesso",
        config_service.serialize_category(category),
    )


@router.delete("/categorias/{category_id}", response_model=SuccessResponse)
def delete_category(
    category_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    config_service.delete_category(db, category_id)
    return success("Categoria excluída com sucesso")


@router.put("/categorias/{category_id}/papeis", response_model=SuccessResponse)
def update_category_roles(
    category_id: UUID,
    body: CategoryRolesUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    category = config_service.update_category_roles(db, category_id, body.roles)
    return success(
        "Papéis da categoria atualizados com sucesso",
        config_service.serialize_category(category),
    )


# ---------------------------------------------------------------------------
# Papéis de sistema
# ---------------------------------------------------------------------------


@router.get("/papeis", response_model=SuccessResponse)
def list_roles(
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    return success("Papéis listados com sucesso", config_service.list_roles())


# ---------------------------------------------------------------------------
# Destinos da colheita
# ---------------------------------------------------------------------------


@router.get("/destinos-colheita", response_model=SuccessResponse)
def get_harvest_destinations(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    destinations = config_service.get_harvest_destinations(db)
    return success(
        "Destinos da colheita obtidos com sucesso",
        destinations.model_dump(mode="json"),
    )


@router.put("/destinos-colheita", response_model=SuccessResponse)
def update_harvest_destinations(
    body: HarvestDestinationsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    destinations = config_service.update_harvest_destinations(db, body)
    return success(
        "Destinos da colheita atualizados com sucesso",
        destinations.model_dump(mode="json"),
    )
