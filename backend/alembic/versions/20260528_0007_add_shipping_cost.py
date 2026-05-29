"""add_shipping_cost_to_sales_and_orders

Revision ID: 0007_add_shipping_cost
Revises: 0006_payroll_events_items
Create Date: 2026-05-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0007_add_shipping_cost"
down_revision: Union[str, None] = "0006_payroll_events_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales",
        sa.Column("shipping_cost", sa.Numeric(12, 2), nullable=True, server_default="0"),
    )
    op.add_column(
        "purchase_orders",
        sa.Column("shipping_cost", sa.Numeric(12, 2), nullable=True, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("purchase_orders", "shipping_cost")
    op.drop_column("sales", "shipping_cost")
