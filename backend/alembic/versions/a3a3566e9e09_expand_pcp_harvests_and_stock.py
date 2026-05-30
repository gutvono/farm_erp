"""expand_pcp_harvests_and_stock

Revision ID: a3a3566e9e09
Revises: 6e4876a9a7e8
Create Date: 2026-05-13 02:03:20.533933

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a3a3566e9e09'
down_revision: Union[str, None] = '6e4876a9a7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Expand production_order_status enum with new values.
    # ADD VALUE IF NOT EXISTS is safe and transactionless in PostgreSQL.
    op.execute("ALTER TYPE production_order_status ADD VALUE IF NOT EXISTS 'em_execucao'")
    op.execute("ALTER TYPE production_order_status ADD VALUE IF NOT EXISTS 'pausada'")

    # Idempotente: a migration inicial (0001) usa create_all e já cria o schema
    # atual. Cada operação é guardada para permitir `alembic upgrade head` em banco
    # novo. NB: `responsible_employee_id` NÃO existe no create_all (removido do model
    # pela 0009), então é adicionado aqui e removido novamente pela 0009.
    insp = sa.inspect(op.get_bind())

    if not insp.has_table("production_harvests"):
        op.create_table(
            "production_harvests",
            sa.Column("production_order_id", sa.UUID(), nullable=False),
            sa.Column("harvest_number", sa.Integer(), nullable=False),
            sa.Column("percentage_harvested", sa.Numeric(precision=5, scale=2), nullable=False),
            sa.Column("sacks_total", sa.Numeric(precision=8, scale=2), nullable=False, server_default="0"),
            sa.Column("sacks_especial", sa.Numeric(precision=8, scale=2), nullable=False, server_default="0"),
            sa.Column("sacks_superior", sa.Numeric(precision=8, scale=2), nullable=False, server_default="0"),
            sa.Column("sacks_tradicional", sa.Numeric(precision=8, scale=2), nullable=False, server_default="0"),
            sa.Column("inputs_consumed", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("is_final", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("harvested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["production_order_id"], ["production_orders.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    op.execute("CREATE INDEX IF NOT EXISTS ix_production_harvests_production_order_id ON production_harvests (production_order_id)")

    # plot_activities: novas colunas
    op.execute("ALTER TABLE plot_activities ADD COLUMN IF NOT EXISTS hours_spent NUMERIC(6,2)")
    op.execute("ALTER TABLE plot_activities ADD COLUMN IF NOT EXISTS employee_id UUID")
    op.execute("ALTER TABLE plot_activities ADD COLUMN IF NOT EXISTS quantity_applied NUMERIC(10,3)")
    op.execute("ALTER TABLE plot_activities ADD COLUMN IF NOT EXISTS quantity_unit VARCHAR(20)")
    op.execute("ALTER TABLE plot_activities ADD COLUMN IF NOT EXISTS result VARCHAR(20)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_plot_activities_employee_id ON plot_activities (employee_id)")
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'plot_activities_employee_id_fkey'
              AND conrelid = 'plot_activities'::regclass
          ) THEN
            ALTER TABLE plot_activities ADD CONSTRAINT plot_activities_employee_id_fkey
              FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
          END IF;
        END $$;
        """
    )

    # production_orders: novas colunas
    op.execute("ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20)")
    op.execute("ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS start_date DATE")
    op.execute("ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS expected_end_date DATE")
    op.execute("ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS responsible_employee_id UUID")

    for col in ("estimated_cost", "realized_cost"):
        op.execute(f"ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS {col} NUMERIC(12,2) DEFAULT 0")
        op.execute(f"ALTER TABLE production_orders ALTER COLUMN {col} SET DEFAULT 0")
        op.execute(f"UPDATE production_orders SET {col} = 0 WHERE {col} IS NULL")
        op.execute(f"ALTER TABLE production_orders ALTER COLUMN {col} SET NOT NULL")
    op.execute("ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS harvest_progress NUMERIC(5,2) DEFAULT 0")
    op.execute("ALTER TABLE production_orders ALTER COLUMN harvest_progress SET DEFAULT 0")
    op.execute("UPDATE production_orders SET harvest_progress = 0 WHERE harvest_progress IS NULL")
    op.execute("ALTER TABLE production_orders ALTER COLUMN harvest_progress SET NOT NULL")

    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_production_orders_order_number ON production_orders (order_number)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_production_orders_responsible_employee_id ON production_orders (responsible_employee_id)")
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'production_orders_responsible_employee_id_fkey'
              AND conrelid = 'production_orders'::regclass
          ) THEN
            ALTER TABLE production_orders ADD CONSTRAINT production_orders_responsible_employee_id_fkey
              FOREIGN KEY (responsible_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
          END IF;
        END $$;
        """
    )

    # stock_items
    op.execute("ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS hourly_cost NUMERIC(10,2)")


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('stock_items', 'hourly_cost')
    op.drop_constraint(None, 'production_orders', type_='foreignkey')
    op.drop_index(op.f('ix_production_orders_responsible_employee_id'), table_name='production_orders')
    op.drop_index(op.f('ix_production_orders_order_number'), table_name='production_orders')
    op.drop_column('production_orders', 'harvest_progress')
    op.drop_column('production_orders', 'realized_cost')
    op.drop_column('production_orders', 'estimated_cost')
    op.drop_column('production_orders', 'responsible_employee_id')
    op.drop_column('production_orders', 'expected_end_date')
    op.drop_column('production_orders', 'start_date')
    op.drop_column('production_orders', 'order_number')
    op.drop_constraint(None, 'plot_activities', type_='foreignkey')
    op.drop_index(op.f('ix_plot_activities_employee_id'), table_name='plot_activities')
    op.drop_column('plot_activities', 'result')
    op.drop_column('plot_activities', 'quantity_unit')
    op.drop_column('plot_activities', 'quantity_applied')
    op.drop_column('plot_activities', 'employee_id')
    op.drop_column('plot_activities', 'hours_spent')
    op.drop_index(op.f('ix_production_harvests_production_order_id'), table_name='production_harvests')
    op.drop_table('production_harvests')
    # Removing enum values from PostgreSQL requires recreating the type.
    # Only safe if no rows use 'em_execucao' or 'pausada'.
    op.execute("""
        ALTER TYPE production_order_status RENAME TO production_order_status_old;
        CREATE TYPE production_order_status AS ENUM (
            'planejada', 'em_producao', 'concluida', 'cancelada'
        );
        ALTER TABLE production_orders
            ALTER COLUMN status TYPE production_order_status
            USING status::text::production_order_status;
        DROP TYPE production_order_status_old;
    """)
    # ### end Alembic commands ###
