"""folha: add employee benefit columns + IRRF enum value + benefit events

Revision ID: 0022_folha_benefits
Revises: 0021_client_address
Create Date: 2026-06-09
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0022_folha_benefits"
down_revision: Union[str, None] = "0021_client_address"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BENEFIT_EVENT_IDS = (
    "dededede-dede-dede-dede-dededede0008",
    "dededede-dede-dede-dede-dededede0009",
    "dededede-dede-dede-dede-dededede0010",
)


def upgrade() -> None:
    op.execute(
        "ALTER TABLE employees "
        "ADD COLUMN IF NOT EXISTS transport_voucher_cost NUMERIC(12,2)"
    )
    op.execute(
        "ALTER TABLE employees "
        "ADD COLUMN IF NOT EXISTS meal_voucher_value NUMERIC(12,2)"
    )
    op.execute(
        "ALTER TABLE employees "
        "ADD COLUMN IF NOT EXISTS pharmacy_voucher_value NUMERIC(12,2)"
    )
    op.execute(
        "ALTER TABLE employees "
        "ADD COLUMN IF NOT EXISTS life_insurance_value NUMERIC(12,2)"
    )
    op.execute(
        "ALTER TABLE employees "
        "ADD COLUMN IF NOT EXISTS dependents_count INTEGER NOT NULL DEFAULT 0"
    )

    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE payroll_calculation_type ADD VALUE IF NOT EXISTS 'irrf'")

    op.execute(
        """
        INSERT INTO payroll_events (
            id,
            description,
            event_type,
            calculation_type,
            is_automatic,
            affects_net,
            is_active
        ) VALUES
        ('dededede-dede-dede-dede-dededede0008', 'Vale refeição',  'informativo', 'manual', FALSE, FALSE, TRUE),
        ('dededede-dede-dede-dede-dededede0009', 'Vale farmácia',  'informativo', 'manual', FALSE, FALSE, TRUE),
        ('dededede-dede-dede-dede-dededede0010', 'Seguro de vida', 'informativo', 'manual', FALSE, FALSE, TRUE)
        ON CONFLICT (id) DO NOTHING;
        """
    )


def downgrade() -> None:
    ids = ", ".join(f"'{event_id}'" for event_id in BENEFIT_EVENT_IDS)
    op.execute(
        f"DELETE FROM payroll_entry_items WHERE payroll_event_id IN ({ids})"
    )
    op.execute(f"DELETE FROM payroll_events WHERE id IN ({ids})")
    op.execute("ALTER TABLE employees DROP COLUMN IF EXISTS dependents_count")
    op.execute("ALTER TABLE employees DROP COLUMN IF EXISTS life_insurance_value")
    op.execute("ALTER TABLE employees DROP COLUMN IF EXISTS pharmacy_voucher_value")
    op.execute("ALTER TABLE employees DROP COLUMN IF EXISTS meal_voucher_value")
    op.execute("ALTER TABLE employees DROP COLUMN IF EXISTS transport_voucher_cost")
    # PostgreSQL does not support dropping enum values safely.
