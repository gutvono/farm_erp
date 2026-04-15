"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-14

Creates the complete initial schema for Coffee Farm ERP.

Implementation note
-------------------
This revision uses ``Base.metadata.create_all`` / ``drop_all`` on the bound
connection. All 22 tables are defined declaratively in ``app/core/database.py``
(which imports every module ``model.py``), so this is equivalent to the
autogenerate output while avoiding brittle duplication in the migration file.
Subsequent migrations should use ``alembic revision --autogenerate`` so the
diffs remain explicit.
"""
from alembic import op

from app.core.database import Base

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
