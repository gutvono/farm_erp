"""folha: add IRRF payroll event

Revision ID: 0023_folha_irrf_event
Revises: 0022_folha_benefits
Create Date: 2026-06-09
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0023_folha_irrf_event"
down_revision: Union[str, None] = "0022_folha_benefits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


IRRF_EVENT_ID = "dededede-dede-dede-dede-dededede0011"


def upgrade() -> None:
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
        ('dededede-dede-dede-dede-dededede0011', 'IRRF', 'desconto', 'irrf', TRUE, TRUE, TRUE)
        ON CONFLICT (id) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        f"DELETE FROM payroll_entry_items WHERE payroll_event_id = '{IRRF_EVENT_ID}'"
    )
    op.execute(f"DELETE FROM payroll_events WHERE id = '{IRRF_EVENT_ID}'")
