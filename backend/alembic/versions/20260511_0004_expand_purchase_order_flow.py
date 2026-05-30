"""expand purchase order flow

Revision ID: 0004_expand_purchase_order_flow
Revises: 0003_folha_extra_columns
Create Date: 2026-05-11

Adds:
- New values to purchaseorderstatus enum
- New table purchase_order_receipts
- Fields financial_approval_note and receipt_total_amount on purchase_orders
"""
from alembic import op

revision = "0004_expand_purchase_order_flow"
down_revision = "0003_folha_extra_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE must run outside a transaction in PostgreSQL.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'aguardando_aprovacao_financeiro'"
        )
        op.execute(
            "ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'aprovada'"
        )
        op.execute(
            "ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'em_conferencia'"
        )
        op.execute(
            "ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'aguardando_pagamento'"
        )

    # New columns on purchase_orders
    op.execute(
        "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS financial_approval_note TEXT"
    )
    op.execute(
        "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS receipt_total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0"
    )
    # Garante o default mesmo quando a coluna já foi criada pelo create_all da 0001
    # (nesse caso o ADD COLUMN IF NOT EXISTS acima é no-op e não aplica o DEFAULT).
    op.execute(
        "ALTER TABLE purchase_orders ALTER COLUMN receipt_total_amount SET DEFAULT 0"
    )

    # New enum type for receipt status — created via raw SQL for idempotency
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_order_receipt_status') THEN
                CREATE TYPE purchase_order_receipt_status AS ENUM ('pendente', 'conferido');
            END IF;
        END$$;
        """
    )

    # New table purchase_order_receipts
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS purchase_order_receipts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            purchase_order_id UUID NOT NULL,
            purchase_order_item_id UUID NOT NULL,
            quantity_ordered NUMERIC(10, 3) NOT NULL,
            quantity_accepted NUMERIC(10, 3) NOT NULL DEFAULT 0,
            quantity_rejected NUMERIC(10, 3) NOT NULL DEFAULT 0,
            rejection_reason TEXT,
            status purchase_order_receipt_status NOT NULL DEFAULT 'pendente',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_receipt_purchase_order
                FOREIGN KEY (purchase_order_id)
                REFERENCES purchase_orders(id) ON DELETE CASCADE,
            CONSTRAINT fk_receipt_purchase_order_item
                FOREIGN KEY (purchase_order_item_id)
                REFERENCES purchase_order_items(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_receipt_purchase_order_id ON purchase_order_receipts (purchase_order_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_receipt_purchase_order_item_id ON purchase_order_receipts (purchase_order_item_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS purchase_order_receipts")
    op.execute("DROP TYPE IF EXISTS purchase_order_receipt_status")
    op.execute(
        "ALTER TABLE purchase_orders DROP COLUMN IF EXISTS receipt_total_amount"
    )
    op.execute(
        "ALTER TABLE purchase_orders DROP COLUMN IF EXISTS financial_approval_note"
    )
    # Enum values cannot be removed in PostgreSQL; keep purchase_order_status as-is.
