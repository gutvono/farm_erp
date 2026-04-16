"""pcp: add planejada/em_producao statuses, nullable executed_at, planned_date

Revision ID: 0002_pcp_planejada_status
Revises: 0001_initial_schema
Create Date: 2026-04-16
"""
import sqlalchemy as sa
from alembic import op


revision = "0002_pcp_planejada_status"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE must run outside a transaction in PostgreSQL.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE production_order_status ADD VALUE IF NOT EXISTS 'planejada'"
        )
        op.execute(
            "ALTER TYPE production_order_status ADD VALUE IF NOT EXISTS 'em_producao'"
        )

    # executed_at becomes nullable (planejada orders have no execution date yet).
    op.alter_column(
        "production_orders",
        "executed_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )

    # New column: planned_date (nullable) for ordens planejadas.
    op.add_column(
        "production_orders",
        sa.Column("planned_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("production_orders", "planned_date")
    op.alter_column(
        "production_orders",
        "executed_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    # Enum values cannot be easily removed in PostgreSQL; keep as-is on downgrade.
