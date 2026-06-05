"""pcp resources

Adds PCP production resources after the stock category refactor:

- ensures the configurable stock category "Embalagem" has the system role
  `embalagem`;
- creates resource association tables for production orders:
  * production_equipments: reserved resources, integer quantity;
  * production_vehicles: reserved resources, integer quantity;
  * production_packagings: consumable resources, integer quantity and cost.

Revision ID: 0018_pcp_resources
Revises: 0017_payroll_approval
Create Date: 2026-06-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0018_pcp_resources"
down_revision: Union[str, None] = "0017_payroll_approval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())

    # stock_category was removed by 0016. Packaging semantics now come from the
    # configurable category + system role mapping.
    op.execute(
        """
        INSERT INTO stock_categories (id, name, description, is_active)
        VALUES (
            '66666666-6666-6666-6666-666666660006',
            'Embalagem',
            'Embalagens consumidas nas ordens de producao',
            TRUE
        )
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO category_role_assignments (id, category_id, role)
        VALUES (
            '77777777-7777-7777-7777-777777770007',
            '66666666-6666-6666-6666-666666660006',
            'embalagem'
        )
        ON CONFLICT (id) DO NOTHING
        """
    )

    if not insp.has_table("production_equipments"):
        op.create_table(
            "production_equipments",
            sa.Column(
                "id",
                sa.UUID(),
                server_default=sa.text("gen_random_uuid()"),
                nullable=False,
            ),
            sa.Column("production_order_id", sa.UUID(), nullable=False),
            sa.Column("stock_item_id", sa.UUID(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["production_order_id"],
                ["production_orders.id"],
                name="fk_pe_order",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["stock_item_id"],
                ["stock_items.id"],
                name="fk_pe_stock_item",
                ondelete="RESTRICT",
            ),
            sa.UniqueConstraint(
                "production_order_id", "stock_item_id", name="uq_pe_order_item"
            ),
            sa.CheckConstraint("quantity > 0", name="ck_pe_quantity_positive"),
            sa.PrimaryKeyConstraint("id"),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pe_production_order "
        "ON production_equipments (production_order_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pe_stock_item "
        "ON production_equipments (stock_item_id)"
    )

    if not insp.has_table("production_vehicles"):
        op.create_table(
            "production_vehicles",
            sa.Column(
                "id",
                sa.UUID(),
                server_default=sa.text("gen_random_uuid()"),
                nullable=False,
            ),
            sa.Column("production_order_id", sa.UUID(), nullable=False),
            sa.Column("stock_item_id", sa.UUID(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["production_order_id"],
                ["production_orders.id"],
                name="fk_pv_order",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["stock_item_id"],
                ["stock_items.id"],
                name="fk_pv_stock_item",
                ondelete="RESTRICT",
            ),
            sa.UniqueConstraint(
                "production_order_id", "stock_item_id", name="uq_pv_order_item"
            ),
            sa.CheckConstraint("quantity > 0", name="ck_pv_quantity_positive"),
            sa.PrimaryKeyConstraint("id"),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pv_production_order "
        "ON production_vehicles (production_order_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pv_stock_item "
        "ON production_vehicles (stock_item_id)"
    )

    if not insp.has_table("production_packagings"):
        op.create_table(
            "production_packagings",
            sa.Column(
                "id",
                sa.UUID(),
                server_default=sa.text("gen_random_uuid()"),
                nullable=False,
            ),
            sa.Column("production_order_id", sa.UUID(), nullable=False),
            sa.Column("stock_item_id", sa.UUID(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column(
                "unit_cost",
                sa.Numeric(precision=12, scale=2),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "subtotal",
                sa.Numeric(precision=12, scale=2),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["production_order_id"],
                ["production_orders.id"],
                name="fk_pk_order",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["stock_item_id"],
                ["stock_items.id"],
                name="fk_pk_stock_item",
                ondelete="RESTRICT",
            ),
            sa.UniqueConstraint(
                "production_order_id", "stock_item_id", name="uq_pk_order_item"
            ),
            sa.CheckConstraint("quantity > 0", name="ck_pk_quantity_positive"),
            sa.PrimaryKeyConstraint("id"),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pk_production_order "
        "ON production_packagings (production_order_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pk_stock_item "
        "ON production_packagings (stock_item_id)"
    )


def downgrade() -> None:
    # Keep the Embalagem category/role to avoid breaking existing stock_items FKs.
    op.execute("DROP TABLE IF EXISTS production_packagings")
    op.execute("DROP TABLE IF EXISTS production_vehicles")
    op.execute("DROP TABLE IF EXISTS production_equipments")
