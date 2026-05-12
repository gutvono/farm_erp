"""invoice client_id nullable

Revision ID: 0005_invoice_client_optional
Revises: 0004_expand_purchase_order_flow
Create Date: 2026-05-11

Makes ``invoices.client_id`` nullable so the faturamento module can issue
purchase-related fiscal notes (recebimento e devolução) that have no
customer (cliente).
"""
from alembic import op


revision = "0005_invoice_client_optional"
down_revision = "0004_expand_purchase_order_flow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE invoices ALTER COLUMN client_id DROP NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE invoices ALTER COLUMN client_id SET NOT NULL")
