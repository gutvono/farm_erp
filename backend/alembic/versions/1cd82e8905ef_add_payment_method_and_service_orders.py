"""add_payment_method_and_service_orders

Revision ID: 1cd82e8905ef
Revises: a3a3566e9e09
Create Date: 2026-05-13 04:01:27.640392

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1cd82e8905ef'
down_revision: Union[str, None] = 'a3a3566e9e09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

payment_method_enum = sa.Enum(
    'a_vista', 'parcelado', 'pix', 'boleto',
    name='payment_method',
)


def upgrade() -> None:
    # Idempotente contra o create_all da 0001. Create the enum type once; all
    # columns reuse it.
    payment_method_enum.create(op.get_bind(), checkfirst=True)

    for tbl in ("accounts_payable", "accounts_receivable", "purchase_orders", "sales"):
        op.execute(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS payment_method payment_method")

    op.execute("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS service_description TEXT")

    # order_type NOT NULL; default 'produto' apenas para backfill, depois removido
    # (inserts devem informar o tipo explicitamente).
    op.execute("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(10) DEFAULT 'produto'")
    op.execute("UPDATE purchase_orders SET order_type = 'produto' WHERE order_type IS NULL")
    op.execute("ALTER TABLE purchase_orders ALTER COLUMN order_type SET NOT NULL")
    op.execute("ALTER TABLE purchase_orders ALTER COLUMN order_type DROP DEFAULT")


def downgrade() -> None:
    op.drop_column('sales', 'payment_method')
    op.drop_column('purchase_orders', 'payment_method')
    op.drop_column('purchase_orders', 'service_description')
    op.drop_column('purchase_orders', 'order_type')
    op.drop_column('accounts_receivable', 'payment_method')
    op.drop_column('accounts_payable', 'payment_method')

    payment_method_enum.drop(op.get_bind(), checkfirst=True)
