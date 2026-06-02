"""pcp_equipamentos_veiculos_embalagens

Adiciona suporte a equipamentos, veículos e embalagens nas ordens de produção:

- Adiciona o valor 'embalagem' ao enum stock_category.
- Cria 3 novas tabelas associativas para ordens de produção:
    * production_equipments  (reserva — não consome estoque, quantidade inteira)
    * production_vehicles    (reserva — não consome estoque, quantidade inteira)
    * production_packagings  (consumível — abate estoque, quantidade inteira, com custo)

Embalagens funcionam como insumos (são consumidas proporcionalmente nas colheitas),
mas com quantidade restrita a inteiros. Equipamentos e veículos são "reservados"
enquanto a ordem está ativa e ficam indisponíveis para outras ordens.

Revision ID: 0010_pcp_eq_veic_emb
Revises: 0009_pcp_workers_services
Create Date: 2026-06-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0010_pcp_eq_veic_emb"
down_revision: Union[str, None] = "0009_pcp_workers_services"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # a) Adicionar 'embalagem' ao enum stock_category — precisa rodar fora de
    # transação porque ALTER TYPE ... ADD VALUE não é transacional no Postgres.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE stock_category ADD VALUE IF NOT EXISTS 'embalagem'"
        )

    insp = sa.inspect(op.get_bind())

    # b) production_equipments
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

    # c) production_vehicles
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

    # d) production_packagings (com custo, como insumos)
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
    # Drop tabelas (índices caem junto).
    op.drop_table("production_packagings")
    op.drop_table("production_vehicles")
    op.drop_table("production_equipments")
    # Valores de enum não podem ser removidos no Postgres — 'embalagem' permanece.
