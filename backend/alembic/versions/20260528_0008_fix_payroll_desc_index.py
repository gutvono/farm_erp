"""fix_payroll_events_description_index

Alinha o índice de `payroll_events.description` ao model (`unique=True, index=True`).

A migration 0006 criou dois objetos para a coluna:
- constraint `UNIQUE` (`payroll_events_description_key`, com índice unique de apoio);
- índice **não-unique** `ix_payroll_events_description`.

O model declara apenas um índice **unique** chamado `ix_payroll_events_description`.
Esta migration remove a constraint e o índice não-unique e recria o índice unique,
eliminando o diff residual detectado por `alembic check`.

Revision ID: 0008_fix_payroll_desc_index
Revises: 0007_add_shipping_cost
Create Date: 2026-05-28

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0008_fix_payroll_desc_index"
down_revision: Union[str, None] = "0007_add_shipping_cost"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotente contra o create_all da 0001 (que já cria o índice unique
    # conforme o model, sem a constraint payroll_events_description_key).
    # Remove a constraint UNIQUE (e seu índice de apoio) e o índice não-unique,
    # depois recria como índice unique conforme o model.
    op.execute(
        "ALTER TABLE payroll_events DROP CONSTRAINT IF EXISTS payroll_events_description_key"
    )
    op.execute("DROP INDEX IF EXISTS ix_payroll_events_description")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_payroll_events_description "
        "ON payroll_events (description)"
    )


def downgrade() -> None:
    # Reverte ao estado da 0006: índice não-unique + constraint UNIQUE separada.
    op.drop_index("ix_payroll_events_description", table_name="payroll_events")
    op.create_index(
        "ix_payroll_events_description",
        "payroll_events",
        ["description"],
        unique=False,
    )
    op.create_unique_constraint(
        "payroll_events_description_key", "payroll_events", ["description"]
    )
