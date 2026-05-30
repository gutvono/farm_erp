"""pcp_workers_services

Adiciona suporte a múltiplos trabalhadores e serviços externos em ordens de produção:

- `production_order_workers`: funcionários alocados na ordem, com snapshot de salário
  e flag `is_responsible` (substitui o antigo `responsible_employee_id`).
- `production_order_services`: serviços externos contratados (equipes terceirizadas),
  com valor fixo, vencimento e conta a pagar opcional.

Remove a coluna `responsible_employee_id` de `production_orders` — a responsabilidade
passa a ser controlada por `production_order_workers.is_responsible`.

Revision ID: 0009_pcp_workers_services
Revises: 0008_fix_payroll_desc_index
Create Date: 2026-05-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0009_pcp_workers_services"
down_revision: Union[str, None] = "0008_fix_payroll_desc_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotente contra o create_all da 0001 (que já cria production_order_workers
    # e production_order_services conforme os models atuais).
    insp = sa.inspect(op.get_bind())

    # a) Trabalhadores alocados na ordem de produção.
    if not insp.has_table("production_order_workers"):
        op.create_table(
            "production_order_workers",
            sa.Column(
                "id",
                sa.UUID(),
                server_default=sa.text("gen_random_uuid()"),
                nullable=False,
            ),
            sa.Column("production_order_id", sa.UUID(), nullable=False),
            sa.Column("employee_id", sa.UUID(), nullable=False),
            sa.Column("salary_snapshot", sa.Numeric(precision=12, scale=2), nullable=False),
            sa.Column(
                "is_responsible",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
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
                name="fk_pow_order",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["employee_id"],
                ["employees.id"],
                name="fk_pow_employee",
                ondelete="RESTRICT",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "production_order_id", "employee_id", name="uq_pow_order_employee"
            ),
        )
    op.execute("CREATE INDEX IF NOT EXISTS idx_pow_production_order ON production_order_workers (production_order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_pow_employee ON production_order_workers (employee_id)")

    # b) Serviços externos contratados para a ordem de produção.
    if not insp.has_table("production_order_services"):
        op.create_table(
            "production_order_services",
            sa.Column(
                "id",
                sa.UUID(),
                server_default=sa.text("gen_random_uuid()"),
                nullable=False,
            ),
            sa.Column("production_order_id", sa.UUID(), nullable=False),
            sa.Column("supplier_id", sa.UUID(), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=False),
            sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
            sa.Column("due_date", sa.Date(), nullable=False),
            sa.Column("accounts_payable_id", sa.UUID(), nullable=True),
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
                name="fk_pos_order",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["supplier_id"],
                ["suppliers.id"],
                name="fk_pos_supplier",
                ondelete="RESTRICT",
            ),
            sa.ForeignKeyConstraint(
                ["accounts_payable_id"],
                ["accounts_payable.id"],
                name="fk_pos_ap",
                ondelete="SET NULL",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    op.execute("CREATE INDEX IF NOT EXISTS idx_pos_production_order ON production_order_services (production_order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_pos_supplier ON production_order_services (supplier_id)")

    # c) Remove responsible_employee_id de production_orders.
    # Em banco novo a coluna é (re)criada pela a3a3566e9e09; em banco existente já
    # existe desde a a3a3566e9e09. Guardas IF EXISTS tornam a remoção idempotente.
    op.execute(
        "ALTER TABLE production_orders DROP CONSTRAINT IF EXISTS production_orders_responsible_employee_id_fkey"
    )
    op.execute("DROP INDEX IF EXISTS ix_production_orders_responsible_employee_id")
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS responsible_employee_id")


def downgrade() -> None:
    # Recria responsible_employee_id (nullable, sem dados) e sua FK/índice.
    op.add_column(
        "production_orders",
        sa.Column("responsible_employee_id", sa.UUID(), nullable=True),
    )
    op.create_index(
        "ix_production_orders_responsible_employee_id",
        "production_orders",
        ["responsible_employee_id"],
        unique=False,
    )
    op.create_foreign_key(
        "production_orders_responsible_employee_id_fkey",
        "production_orders",
        "employees",
        ["responsible_employee_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Dropa as tabelas novas (índices caem junto com as tabelas).
    op.drop_index(
        "idx_pos_supplier", table_name="production_order_services"
    )
    op.drop_index(
        "idx_pos_production_order", table_name="production_order_services"
    )
    op.drop_table("production_order_services")

    op.drop_index("idx_pow_employee", table_name="production_order_workers")
    op.drop_index(
        "idx_pow_production_order", table_name="production_order_workers"
    )
    op.drop_table("production_order_workers")
