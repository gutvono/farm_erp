"""Generic, reusable pagination/ordering contract for the API.

This module provides three building blocks that any module can reuse:

- ``PageParams``  — standard pagination/ordering query parameters.
- ``get_page_params`` — FastAPI dependency that reads those query params.
- ``Page[T]``     — generic paginated response envelope.
- ``paginate_query`` — repository helper that applies ordering + limit/offset
  to a SQLAlchemy ``Query`` and returns ``(items, total)``.

See ``docs/backend/_shared-paginacao.md`` for the step-by-step on how to
paginate a new endpoint.
"""

from __future__ import annotations

import math
from typing import Any, Generic, Literal, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field
from sqlalchemy import asc, desc
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.sql.elements import ColumnElement

T = TypeVar("T")

OrderDir = Literal["asc", "desc"]

# Columns that can be referenced by an allowlist or used as a default order.
Orderable = InstrumentedAttribute[Any] | ColumnElement[Any]


class PageParams(BaseModel):
    """Standard pagination and ordering parameters.

    Built by the ``get_page_params`` dependency from the request query string.
    ``order_by`` is validated against a per-endpoint allowlist inside
    ``paginate_query`` (never trusted blindly), so an unknown column falls back
    to the endpoint default instead of raising.
    """

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    order_by: str | None = Field(default=None)
    order_dir: OrderDir = Field(default="desc")
    search: str | None = Field(default=None)

    @property
    def offset(self) -> int:
        """Zero-based offset for ``LIMIT/OFFSET``."""
        return (self.page - 1) * self.page_size


def get_page_params(
    page: int = Query(1, ge=1, description="Página (1-based)"),
    page_size: int = Query(
        20, ge=1, le=100, description="Itens por página (máximo 100)"
    ),
    order_by: str | None = Query(
        None, description="Coluna de ordenação (validada por allowlist)"
    ),
    order_dir: OrderDir = Query("desc", description="Direção da ordenação"),
    search: str | None = Query(None, description="Busca textual livre"),
) -> PageParams:
    """FastAPI dependency that assembles ``PageParams`` from query params."""
    return PageParams(
        page=page,
        page_size=page_size,
        order_by=order_by,
        order_dir=order_dir,
        search=search,
    )


class Page(BaseModel, Generic[T]):
    """Generic paginated response envelope.

    ``pages`` is the total number of pages: ``ceil(total / page_size)`` when
    there is at least one row, and ``0`` when the result set is empty.
    """

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def create(cls, *, items: list[T], total: int, params: PageParams) -> "Page[T]":
        """Build a ``Page`` computing ``pages`` from ``total`` and ``page_size``."""
        pages = math.ceil(total / params.page_size) if total > 0 else 0
        return cls(
            items=items,
            total=total,
            page=params.page,
            page_size=params.page_size,
            pages=pages,
        )


def paginate_query(
    query: SAQuery[Any],
    params: PageParams,
    *,
    allowed_order_by: dict[str, Orderable],
    default_order: Any,
    tiebreaker: Orderable | None = None,
) -> tuple[list[Any], int]:
    """Apply ordering + pagination to a query and return ``(items, total)``.

    The helper is model-agnostic: the repository builds and filters the query,
    then hands it over here.

    - ``total`` is counted on the base query (filters applied, ordering removed)
      **before** ``LIMIT/OFFSET``, so it reflects the full filtered set.
    - ``params.order_by`` is validated against ``allowed_order_by``. If it is
      missing or not in the allowlist, ``default_order`` is used — never a 500.
    - ``params.order_dir`` selects ``asc``/``desc`` for the allowlisted column.
    - ``tiebreaker`` (recommended: the primary key) is appended as a final,
      deterministic ORDER BY so rows do not shift between pages when the primary
      sort column has ties.

    Args:
        query: SQLAlchemy ``Query`` already built/filtered by the repository.
        params: Pagination/ordering parameters.
        allowed_order_by: Map of accepted ``order_by`` values to ORM columns.
        default_order: Fully-formed ORDER BY expression applied when
            ``order_by`` is absent/invalid (e.g. ``Model.occurred_at.desc()``).
        tiebreaker: Unique column appended last to keep pagination stable.

    Returns:
        Tuple ``(items, total)``.
    """
    # Count on the filtered base query, without ORDER BY (cheaper and safe).
    total = query.order_by(None).count()

    column = allowed_order_by.get(params.order_by) if params.order_by else None
    if column is not None:
        direction = desc if params.order_dir == "desc" else asc
        query = query.order_by(direction(column))
    else:
        query = query.order_by(default_order)

    if tiebreaker is not None:
        query = query.order_by(tiebreaker.asc())

    items = query.offset(params.offset).limit(params.page_size).all()
    return items, total
