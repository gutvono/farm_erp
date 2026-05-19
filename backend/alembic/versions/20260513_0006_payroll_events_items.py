"""folha: add payroll events and entry items

Revision ID: 0006_payroll_events_items
Revises: 1cd82e8905ef
Create Date: 2026-05-13
"""
from alembic import op


revision = "0006_payroll_events_items"
down_revision = "1cd82e8905ef"
branch_labels = None
depends_on = None


DEFAULT_EVENTS_SQL = """
INSERT INTO payroll_events (
    id,
    description,
    event_type,
    calculation_type,
    is_automatic,
    affects_net,
    is_active
) VALUES
('dededede-dede-dede-dede-dededede0001', 'Salario base',       'provento',    'manual',            FALSE, TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0002', 'Hora extra',         'provento',    'overtime',          TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0003', 'Adicional noturno',  'provento',    'night_shift',       TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0004', 'INSS',               'desconto',    'inss',              TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0005', 'Vale transporte',    'desconto',    'transport_voucher', TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0006', 'FGTS',               'informativo', 'fgts',              TRUE,  FALSE, TRUE),
('dededede-dede-dede-dede-dededede0007', 'Descontos manuais',  'desconto',    'manual',            FALSE, TRUE,  TRUE)
ON CONFLICT (id) DO NOTHING;
"""


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_event_type') THEN
                CREATE TYPE payroll_event_type AS ENUM ('provento', 'desconto', 'informativo');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_calculation_type') THEN
                CREATE TYPE payroll_calculation_type AS ENUM (
                    'manual',
                    'overtime',
                    'night_shift',
                    'inss',
                    'fgts',
                    'transport_voucher'
                );
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_item_source') THEN
                CREATE TYPE payroll_item_source AS ENUM ('manual', 'automatic');
            END IF;
        END$$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS payroll_events (
            id UUID PRIMARY KEY,
            description VARCHAR(255) NOT NULL UNIQUE,
            event_type payroll_event_type NOT NULL,
            calculation_type payroll_calculation_type NOT NULL DEFAULT 'manual',
            is_automatic BOOLEAN NOT NULL DEFAULT FALSE,
            affects_net BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payroll_events_description ON payroll_events (description)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payroll_events_event_type ON payroll_events (event_type)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payroll_events_calculation_type ON payroll_events (calculation_type)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payroll_events_is_active ON payroll_events (is_active)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payroll_events_deleted_at ON payroll_events (deleted_at)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS payroll_entry_items (
            id UUID PRIMARY KEY,
            payroll_entry_id UUID NOT NULL,
            payroll_event_id UUID NOT NULL,
            amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
            calculation_base NUMERIC(12, 2),
            quantity NUMERIC(12, 4),
            percentage NUMERIC(7, 2),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            source payroll_item_source NOT NULL DEFAULT 'manual',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_payroll_entry_items_entry
                FOREIGN KEY (payroll_entry_id)
                REFERENCES payroll_entries(id) ON DELETE CASCADE,
            CONSTRAINT fk_payroll_entry_items_event
                FOREIGN KEY (payroll_event_id)
                REFERENCES payroll_events(id) ON DELETE RESTRICT,
            CONSTRAINT uq_payroll_entry_item_entry_event
                UNIQUE (payroll_entry_id, payroll_event_id),
            CONSTRAINT ck_payroll_entry_items_amount_non_negative
                CHECK (amount >= 0)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payroll_entry_items_payroll_entry_id ON payroll_entry_items (payroll_entry_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payroll_entry_items_payroll_event_id ON payroll_entry_items (payroll_event_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payroll_entry_items_source ON payroll_entry_items (source)"
    )

    op.execute(DEFAULT_EVENTS_SQL)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS payroll_entry_items")
    op.execute("DROP TABLE IF EXISTS payroll_events")
    op.execute("DROP TYPE IF EXISTS payroll_item_source")
    op.execute("DROP TYPE IF EXISTS payroll_calculation_type")
    op.execute("DROP TYPE IF EXISTS payroll_event_type")
