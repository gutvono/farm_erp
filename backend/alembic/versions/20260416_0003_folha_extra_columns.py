"""folha: add termination_cost_override and payroll period total_amount

Revision ID: 0003_folha_extra_columns
Revises: 0002_pcp_planejada_status
Create Date: 2026-04-16
"""
import sqlalchemy as sa
from alembic import op


revision = "0003_folha_extra_columns"
down_revision = "0002_pcp_planejada_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS termination_cost_override NUMERIC(12, 2)"
    )
    op.execute(
        "ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0"
    )
    # Ensure DEFAULT exists even if column was already created by migration 0001 (create_all)
    op.execute(
        "ALTER TABLE payroll_periods ALTER COLUMN total_amount SET DEFAULT 0"
    )


def downgrade() -> None:
    op.drop_column("payroll_periods", "total_amount")
    op.drop_column("employees", "termination_cost_override")
