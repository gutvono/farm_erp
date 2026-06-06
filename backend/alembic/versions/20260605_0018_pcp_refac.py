"""pcp refac: hectares, cargos, recursos, colheita por destino

Demanda 5 (passo 1 — schema). Refatora o PCP para o modelo realista:

- **Talhão em hectares** (`plots.total_hectares`): base do controle de área.
- **OP usa hectares** (`production_orders.hectares_used`) e pode ser encerrada
  antes de 100% por praga (`production_orders.early_closed_reason`).
- **Colheita por destino**: as colunas de qualidade `*_especial/superior/
  tradicional` em `production_orders` e `production_harvests` dão lugar a
  `*_industria/embalagem/descarte` (cada destino = um item-destino configurado).
  Dados históricos são copiados best-effort (especial→industria,
  superior→embalagem, tradicional→descarte) antes de remover as antigas.
  `production_harvests` ganha `hectares_harvested`.
- **Requisitos por cargo** (substitui a alocação nominal): a tabela
  `production_order_workers` é removida e dá lugar a
  `production_order_position_requirements` ({ cargo, quantidade, vínculo }).
- **Recursos de estoque** (`production_order_resources`): máquinas/veículos
  (reservados, custo por hora acumulada) e embalagens (consumo).

Idempotência / create_all:
- A `0001` usa `Base.metadata.create_all`, que num banco novo já cria o schema
  ATUAL (com as novas colunas/tabelas e SEM as antigas, pois o model já reflete
  o novo estado). Por isso toda operação aqui é guardada:
  `ADD/DROP COLUMN IF [NOT] EXISTS`, `CREATE TABLE/INDEX IF NOT EXISTS`,
  `DROP TABLE IF EXISTS`, e a cópia de dados históricos só roda quando as colunas
  legadas ainda existem (DO-block sobre `information_schema`). As enums
  `contract_type` (Folha) e `system_role` (Configurações) já existem; aqui são
  apenas referenciadas.
- Constraints/índices usam os MESMOS nomes que o `create_all` geraria a partir
  do model (FKs `fk_popr_*`/`fk_por_*`, PK `*_pkey`, índices `ix_*`), de modo que
  num banco novo o `IF NOT EXISTS` vira no-op e `alembic check` fica limpo.

downgrade(): reverte tudo — recria `production_order_workers`, restaura as colunas
de qualidade legadas (copiando de volta) e remove as novas tabelas/colunas.

Revision ID: 0018_pcp_refac
Revises: 0017_payroll_approval
Create Date: 2026-06-05

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0018_pcp_refac"
down_revision: Union[str, None] = "0017_payroll_approval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_not_null_numeric(table: str, col: str, type_: str) -> None:
    """Adiciona uma coluna NUMERIC NOT NULL DEFAULT 0 de forma idempotente."""
    op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {type_} DEFAULT 0")
    op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} SET DEFAULT 0")
    op.execute(f"UPDATE {table} SET {col} = 0 WHERE {col} IS NULL")
    op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} SET NOT NULL")


def upgrade() -> None:
    # --- P1: plots.total_hectares ---
    _add_not_null_numeric("plots", "total_hectares", "NUMERIC(10,2)")

    # --- P2: production_orders.hectares_used + early_closed_reason ---
    _add_not_null_numeric("production_orders", "hectares_used", "NUMERIC(10,2)")
    op.execute(
        "ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS early_closed_reason TEXT"
    )

    # --- P3a: production_orders -> sacas por destino (substitui qualidade) ---
    for col in ("industria_sacas", "embalagem_sacas", "descarte_sacas"):
        _add_not_null_numeric("production_orders", col, "NUMERIC(12,3)")
    # Cópia best-effort dos dados históricos (só se as colunas legadas existem).
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'production_orders'
                  AND column_name = 'especial_sacas'
            ) THEN
                UPDATE production_orders SET
                    industria_sacas = COALESCE(especial_sacas, 0),
                    embalagem_sacas = COALESCE(superior_sacas, 0),
                    descarte_sacas  = COALESCE(tradicional_sacas, 0);
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS especial_sacas")
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS superior_sacas")
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS tradicional_sacas")

    # --- P3b: production_harvests -> sacas por destino + hectares_harvested ---
    for col in ("sacks_industria", "sacks_embalagem", "sacks_descarte"):
        _add_not_null_numeric("production_harvests", col, "NUMERIC(8,2)")
    op.execute(
        "ALTER TABLE production_harvests "
        "ADD COLUMN IF NOT EXISTS hectares_harvested NUMERIC(10,2)"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'production_harvests'
                  AND column_name = 'sacks_especial'
            ) THEN
                UPDATE production_harvests SET
                    sacks_industria = COALESCE(sacks_especial, 0),
                    sacks_embalagem = COALESCE(sacks_superior, 0),
                    sacks_descarte  = COALESCE(sacks_tradicional, 0);
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE production_harvests DROP COLUMN IF EXISTS sacks_especial")
    op.execute("ALTER TABLE production_harvests DROP COLUMN IF EXISTS sacks_superior")
    op.execute("ALTER TABLE production_harvests DROP COLUMN IF EXISTS sacks_tradicional")

    # --- P4: remove workers nominais; cria requisitos por cargo ---
    op.execute("DROP TABLE IF EXISTS production_order_workers")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS production_order_position_requirements (
            id UUID NOT NULL,
            production_order_id UUID NOT NULL,
            position_id UUID NOT NULL,
            quantity INTEGER NOT NULL,
            contract_type contract_type NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT production_order_position_requirements_pkey PRIMARY KEY (id),
            CONSTRAINT ck_popr_quantity_positive CHECK (quantity > 0),
            CONSTRAINT fk_popr_order FOREIGN KEY (production_order_id)
                REFERENCES production_orders (id) ON DELETE CASCADE,
            CONSTRAINT fk_popr_position FOREIGN KEY (position_id)
                REFERENCES job_positions (id) ON DELETE RESTRICT
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_production_order_position_requirements_production_order_id" '
        'ON "production_order_position_requirements" ("production_order_id")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_production_order_position_requirements_position_id" '
        'ON "production_order_position_requirements" ("position_id")'
    )

    # --- P4/P5: recursos de estoque (máquina/veículo reservados, embalagem consumo) ---
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS production_order_resources (
            id UUID NOT NULL,
            production_order_id UUID NOT NULL,
            stock_item_id UUID NOT NULL,
            resource_role system_role NOT NULL,
            quantity NUMERIC(12,3),
            accumulated_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT production_order_resources_pkey PRIMARY KEY (id),
            CONSTRAINT fk_por_order FOREIGN KEY (production_order_id)
                REFERENCES production_orders (id) ON DELETE CASCADE,
            CONSTRAINT fk_por_stock_item FOREIGN KEY (stock_item_id)
                REFERENCES stock_items (id) ON DELETE RESTRICT
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_production_order_resources_production_order_id" '
        'ON "production_order_resources" ("production_order_id")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_production_order_resources_stock_item_id" '
        'ON "production_order_resources" ("stock_item_id")'
    )


def downgrade() -> None:
    # Recria production_order_workers (estado anterior).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS production_order_workers (
            id UUID NOT NULL,
            production_order_id UUID NOT NULL,
            employee_id UUID NOT NULL,
            salary_snapshot NUMERIC(12,2) NOT NULL,
            is_responsible BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT production_order_workers_pkey PRIMARY KEY (id),
            CONSTRAINT uq_pow_order_employee
                UNIQUE (production_order_id, employee_id),
            CONSTRAINT fk_pow_order FOREIGN KEY (production_order_id)
                REFERENCES production_orders (id) ON DELETE CASCADE,
            CONSTRAINT fk_pow_employee FOREIGN KEY (employee_id)
                REFERENCES employees (id) ON DELETE RESTRICT
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_pow_production_order" '
        'ON "production_order_workers" ("production_order_id")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_pow_employee" '
        'ON "production_order_workers" ("employee_id")'
    )

    # Dropa as novas tabelas.
    op.execute('DROP INDEX IF EXISTS "ix_production_order_resources_stock_item_id"')
    op.execute(
        'DROP INDEX IF EXISTS "ix_production_order_resources_production_order_id"'
    )
    op.execute("DROP TABLE IF EXISTS production_order_resources")
    op.execute(
        'DROP INDEX IF EXISTS '
        '"ix_production_order_position_requirements_position_id"'
    )
    op.execute(
        'DROP INDEX IF EXISTS '
        '"ix_production_order_position_requirements_production_order_id"'
    )
    op.execute("DROP TABLE IF EXISTS production_order_position_requirements")

    # production_harvests: restaura colunas de qualidade legadas (copiando de volta).
    for col in ("sacks_especial", "sacks_superior", "sacks_tradicional"):
        op.execute(
            f"ALTER TABLE production_harvests ADD COLUMN IF NOT EXISTS {col} "
            "NUMERIC(8,2) DEFAULT 0"
        )
        op.execute(f"ALTER TABLE production_harvests ALTER COLUMN {col} SET DEFAULT 0")
    op.execute(
        """
        UPDATE production_harvests SET
            sacks_especial    = COALESCE(sacks_industria, 0),
            sacks_superior    = COALESCE(sacks_embalagem, 0),
            sacks_tradicional = COALESCE(sacks_descarte, 0);
        """
    )
    for col in ("sacks_especial", "sacks_superior", "sacks_tradicional"):
        op.execute(f"ALTER TABLE production_harvests ALTER COLUMN {col} SET NOT NULL")
    op.execute("ALTER TABLE production_harvests DROP COLUMN IF EXISTS hectares_harvested")
    op.execute("ALTER TABLE production_harvests DROP COLUMN IF EXISTS sacks_descarte")
    op.execute("ALTER TABLE production_harvests DROP COLUMN IF EXISTS sacks_embalagem")
    op.execute("ALTER TABLE production_harvests DROP COLUMN IF EXISTS sacks_industria")

    # production_orders: restaura colunas de qualidade legadas (copiando de volta).
    for col in ("especial_sacas", "superior_sacas", "tradicional_sacas"):
        op.execute(
            f"ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS {col} "
            "NUMERIC(12,3) DEFAULT 0"
        )
        op.execute(f"ALTER TABLE production_orders ALTER COLUMN {col} SET DEFAULT 0")
    op.execute(
        """
        UPDATE production_orders SET
            especial_sacas    = COALESCE(industria_sacas, 0),
            superior_sacas    = COALESCE(embalagem_sacas, 0),
            tradicional_sacas = COALESCE(descarte_sacas, 0);
        """
    )
    for col in ("especial_sacas", "superior_sacas", "tradicional_sacas"):
        op.execute(f"ALTER TABLE production_orders ALTER COLUMN {col} SET NOT NULL")
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS descarte_sacas")
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS embalagem_sacas")
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS industria_sacas")
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS early_closed_reason")
    op.execute("ALTER TABLE production_orders DROP COLUMN IF EXISTS hectares_used")

    # plots.total_hectares.
    op.execute("ALTER TABLE plots DROP COLUMN IF EXISTS total_hectares")
