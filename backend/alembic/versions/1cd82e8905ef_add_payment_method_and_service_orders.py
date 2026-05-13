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
    # Create the enum type once; all columns reuse it.
    payment_method_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        'accounts_payable',
        sa.Column('payment_method', sa.Enum(name='payment_method', create_type=False), nullable=True),
    )
    op.add_column(
        'accounts_receivable',
        sa.Column('payment_method', sa.Enum(name='payment_method', create_type=False), nullable=True),
    )
    op.add_column(
        'purchase_orders',
        sa.Column('order_type', sa.String(length=10), nullable=False, server_default='produto'),
    )
    op.add_column(
        'purchase_orders',
        sa.Column('service_description', sa.Text(), nullable=True),
    )
    op.add_column(
        'purchase_orders',
        sa.Column('payment_method', sa.Enum(name='payment_method', create_type=False), nullable=True),
    )
    op.add_column(
        'sales',
        sa.Column('payment_method', sa.Enum(name='payment_method', create_type=False), nullable=True),
    )

    # Remove the server_default so future inserts must set explicitly
    op.alter_column('purchase_orders', 'order_type', server_default=None)


def downgrade() -> None:
    op.drop_column('sales', 'payment_method')
    op.drop_column('purchase_orders', 'payment_method')
    op.drop_column('purchase_orders', 'service_description')
    op.drop_column('purchase_orders', 'order_type')
    op.drop_column('accounts_receivable', 'payment_method')
    op.drop_column('accounts_payable', 'payment_method')

    payment_method_enum.drop(op.get_bind(), checkfirst=True)
