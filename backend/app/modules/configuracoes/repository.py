from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from app.modules.configuracoes.model import (
    AppSetting,
    CategoryRoleAssignment,
    StockCategory,
)
from app.modules.estoque.model import StockItem
from app.shared.enums import SystemRole
from app.shared.pagination import PageParams, paginate_query


# Allowlist de ordenação da listagem paginada de categorias (Demanda 3).
# Coluna fora da lista cai no default (name asc), nunca 500.
CATEGORY_ORDER_COLUMNS = {
    "name": StockCategory.name,
}


# ---------------------------------------------------------------------------
# Stock Categories
# ---------------------------------------------------------------------------


def create_category(
    db: Session,
    *,
    name: str,
    description: Optional[str],
    is_active: bool,
) -> StockCategory:
    category = StockCategory(
        name=name,
        description=description,
        is_active=is_active,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def get_category(db: Session, category_id: UUID) -> Optional[StockCategory]:
    return (
        db.query(StockCategory)
        .options(selectinload(StockCategory.role_assignments))
        .filter(StockCategory.id == category_id, StockCategory.deleted_at.is_(None))
        .first()
    )


def get_category_by_name(db: Session, name: str) -> Optional[StockCategory]:
    return (
        db.query(StockCategory)
        .filter(StockCategory.name == name, StockCategory.deleted_at.is_(None))
        .first()
    )


def list_categories_paginated(
    db: Session, *, params: PageParams
) -> tuple[list[StockCategory], int]:
    query = (
        db.query(StockCategory)
        .options(selectinload(StockCategory.role_assignments))
        .filter(StockCategory.deleted_at.is_(None))
    )
    if params.search:
        query = query.filter(StockCategory.name.ilike(f"%{params.search}%"))
    return paginate_query(
        query,
        params,
        allowed_order_by=CATEGORY_ORDER_COLUMNS,
        default_order=StockCategory.name.asc(),
        tiebreaker=StockCategory.id,
    )


def update_category(
    db: Session, category_id: UUID, fields: dict
) -> Optional[StockCategory]:
    category = get_category(db, category_id)
    if not category:
        return None
    for key, value in fields.items():
        setattr(category, key, value)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def soft_delete_category(db: Session, category_id: UUID) -> Optional[StockCategory]:
    category = get_category(db, category_id)
    if not category:
        return None
    category.deleted_at = datetime.now(timezone.utc)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def count_active_items_by_category(db: Session, category_id: UUID) -> int:
    return (
        db.query(StockItem)
        .filter(
            StockItem.category_id == category_id,
            StockItem.deleted_at.is_(None),
        )
        .count()
    )


# ---------------------------------------------------------------------------
# Category role assignments (M:N)
# ---------------------------------------------------------------------------


def replace_category_roles(
    db: Session, category_id: UUID, roles: list[SystemRole]
) -> list[CategoryRoleAssignment]:
    """Apaga as assignments atuais da categoria e insere o novo conjunto."""
    db.query(CategoryRoleAssignment).filter(
        CategoryRoleAssignment.category_id == category_id
    ).delete(synchronize_session=False)

    assignments: list[CategoryRoleAssignment] = []
    for role in dict.fromkeys(roles):  # deduplica preservando ordem
        assignment = CategoryRoleAssignment(category_id=category_id, role=role)
        db.add(assignment)
        assignments.append(assignment)
    db.commit()
    return assignments


def list_item_ids_by_role(db: Session, role: SystemRole) -> list[UUID]:
    """IDs de stock_items ativos cujas categorias têm o papel informado."""
    rows = (
        db.query(StockItem.id)
        .join(StockCategory, StockCategory.id == StockItem.category_id)
        .join(
            CategoryRoleAssignment,
            CategoryRoleAssignment.category_id == StockCategory.id,
        )
        .filter(
            CategoryRoleAssignment.role == role,
            StockItem.deleted_at.is_(None),
            StockCategory.deleted_at.is_(None),
        )
        .distinct()
        .all()
    )
    return [row[0] for row in rows]


def list_categories_by_role(db: Session, role: SystemRole) -> list[StockCategory]:
    return (
        db.query(StockCategory)
        .join(
            CategoryRoleAssignment,
            CategoryRoleAssignment.category_id == StockCategory.id,
        )
        .filter(
            CategoryRoleAssignment.role == role,
            StockCategory.deleted_at.is_(None),
        )
        .distinct()
        .order_by(StockCategory.name.asc())
        .all()
    )


# ---------------------------------------------------------------------------
# App settings (key-value)
# ---------------------------------------------------------------------------


def get_setting(db: Session, key: str) -> Optional[AppSetting]:
    return db.query(AppSetting).filter(AppSetting.key == key).first()


def set_setting(db: Session, key: str, value: Optional[str]) -> AppSetting:
    setting = get_setting(db, key)
    if setting is None:
        setting = AppSetting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting
