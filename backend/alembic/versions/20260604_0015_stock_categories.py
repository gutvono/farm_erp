"""stock categories configuráveis + papéis de sistema + app_settings

Demanda 3 (D2 + D3). A categoria do item deixa de ser enum fixo
(`stock_items.category`) e vira tabela cadastrável (`stock_categories`),
referenciada por FK (`stock_items.category_id`). Para o sistema continuar
"entendendo" o que é máquina/veículo/insumo/etc., entra um mapeamento M:N
categoria → papel de sistema (`category_role_assignments`, papéis no enum
`system_role`). Um key-value (`app_settings`) guarda os 3 itens-destino da
colheita (D1).

Entrega só schema + migração de dados + (no seed.sql) os dados demo. O módulo
Configurações (API/UI) e o DROP do enum/coluna `stock_category` vêm no Backend.

Passos do upgrade (idempotentes — rodam em prod E em banco novo via create_all):
 0. GUARD create_all: garante o tipo `stock_category` e a coluna
    `stock_items.category` antes de lê-los no backfill. Necessário porque o passo
    Backend removerá `category` do model; aí, em banco novo, o `0001`
    (`create_all`) não criaria nem o tipo nem a coluna, e o backfill quebraria
    com "column category does not exist" (foi o que derrubou o reset_db na
    Demanda 2). Em prod/banco atual é no-op (ambos já existem). Net-schema-neutral:
    o Backend dropa coluna+tipo depois.
 1. Cria tipo `system_role`, tabelas `stock_categories`, `category_role_assignments`
    e `app_settings` (+ índices/constraints espelhando os models).
 2. Insere as 5 categorias do enum atual com IDS FIXOS (referenciados pelo seed/
    backfill): Café(cafe), Insumo(insumo), Veículo(veiculo), Equipamento(equipamento),
    Outro(outro).
 3. Atribui papéis default: Café → produto_final + produto_vendavel; Insumo → insumo;
    Veículo → veiculo; Equipamento → maquina; Outro → (nenhum).
 4. Adiciona `stock_items.category_id` (nullable) + FK + índice; backfill a partir
    do enum `category` de cada item; torna `category_id` NOT NULL.
 5. Torna `stock_items.category` NULLABLE (deprecated) — NÃO dropa (nem o tipo).

downgrade(): repopula `category` a partir de `category_id`, restaura NOT NULL,
remove `category_id`, e dropa `app_settings`, `category_role_assignments`,
`stock_categories` e o tipo `system_role`. (NÃO dropa o tipo `stock_category`,
que é anterior a esta migration.)

Revision ID: 0015_stock_categories
Revises: 0014_drop_employee_role
Create Date: 2026-06-04

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0015_stock_categories"
down_revision: Union[str, None] = "0014_drop_employee_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# IDs fixos das categorias (espelhados no seed.sql).
CAT_CAFE = "66666666-6666-6666-6666-666666660001"
CAT_INSUMO = "66666666-6666-6666-6666-666666660002"
CAT_VEICULO = "66666666-6666-6666-6666-666666660003"
CAT_EQUIP = "66666666-6666-6666-6666-666666660004"
CAT_OUTRO = "66666666-6666-6666-6666-666666660005"


def upgrade() -> None:
    # 0. GUARD create_all (banco novo onde o Backend já removeu `category`):
    #    garante tipo `stock_category` e a coluna antes do backfill. No-op em prod.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_category') THEN
                CREATE TYPE stock_category AS ENUM
                    ('cafe', 'insumo', 'veiculo', 'equipamento', 'outro');
            END IF;
        END $$
        """
    )
    op.execute(
        "ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS category stock_category"
    )

    # 1a. Tipo system_role (ordem espelha o enum SystemRole no model).
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_role') THEN
                CREATE TYPE system_role AS ENUM (
                    'maquina', 'veiculo', 'embalagem', 'insumo',
                    'produto_final', 'produto_inacabado',
                    'produto_descartado', 'produto_vendavel'
                );
            END IF;
        END $$
        """
    )

    # 1b. stock_categories (sem server_default em is_active — model usa default
    #     Python; created_at/updated_at têm DEFAULT now() como o TimestampMixin).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS stock_categories (
            id UUID NOT NULL,
            name VARCHAR(120) NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            deleted_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT stock_categories_pkey PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ix_stock_categories_name" '
        'ON "stock_categories" ("name")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_stock_categories_deleted_at" '
        'ON "stock_categories" ("deleted_at")'
    )

    # 1c. category_role_assignments (M:N, sem soft delete).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS category_role_assignments (
            id UUID NOT NULL,
            category_id UUID NOT NULL,
            role system_role NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT category_role_assignments_pkey PRIMARY KEY (id),
            CONSTRAINT uq_category_role UNIQUE (category_id, role)
        )
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_cra_category'
            ) THEN
                ALTER TABLE category_role_assignments
                    ADD CONSTRAINT fk_cra_category
                    FOREIGN KEY (category_id) REFERENCES stock_categories (id)
                    ON DELETE CASCADE;
            END IF;
        END $$
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_category_role_assignments_category_id" '
        'ON "category_role_assignments" ("category_id")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_category_role_assignments_role" '
        'ON "category_role_assignments" ("role")'
    )

    # 1d. app_settings (key-value).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            id UUID NOT NULL,
            key VARCHAR(100) NOT NULL,
            value VARCHAR(500),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT app_settings_pkey PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ix_app_settings_key" '
        'ON "app_settings" ("key")'
    )

    # 2. Categorias a partir do enum (ids fixos).
    op.execute(
        f"""
        INSERT INTO stock_categories (id, name, is_active, created_at, updated_at)
        VALUES
            ('{CAT_CAFE}',    'Café',        TRUE, now(), now()),
            ('{CAT_INSUMO}',  'Insumo',      TRUE, now(), now()),
            ('{CAT_VEICULO}', 'Veículo',     TRUE, now(), now()),
            ('{CAT_EQUIP}',   'Equipamento', TRUE, now(), now()),
            ('{CAT_OUTRO}',   'Outro',       TRUE, now(), now())
        ON CONFLICT (id) DO NOTHING
        """
    )

    # 3. Papéis default (Café recebe DOIS papéis; Outro nenhum).
    #    IDS FIXOS espelham o seed.sql: assim, no reset_db (onde migration E seed
    #    rodam), o `ON CONFLICT (id)` do seed deduplica estas linhas em vez de
    #    bater na UNIQUE(category_id, role) — mesma armadilha do job_positions.
    op.execute(
        f"""
        INSERT INTO category_role_assignments (id, category_id, role, created_at, updated_at)
        VALUES
            ('77777777-7777-7777-7777-777777770001', '{CAT_CAFE}',   'produto_final',    now(), now()),
            ('77777777-7777-7777-7777-777777770002', '{CAT_CAFE}',   'produto_vendavel', now(), now()),
            ('77777777-7777-7777-7777-777777770003', '{CAT_INSUMO}', 'insumo',           now(), now()),
            ('77777777-7777-7777-7777-777777770004', '{CAT_VEICULO}','veiculo',          now(), now()),
            ('77777777-7777-7777-7777-777777770005', '{CAT_EQUIP}',  'maquina',          now(), now())
        ON CONFLICT (id) DO NOTHING
        """
    )

    # 4. category_id em stock_items + FK + índice + backfill + NOT NULL.
    op.execute(
        "ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS category_id UUID"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_items_category'
            ) THEN
                ALTER TABLE stock_items
                    ADD CONSTRAINT fk_stock_items_category
                    FOREIGN KEY (category_id) REFERENCES stock_categories (id);
            END IF;
        END $$
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_stock_items_category_id" '
        'ON "stock_items" ("category_id")'
    )
    op.execute(
        f"""
        UPDATE stock_items SET category_id = CASE category
            WHEN 'cafe'        THEN '{CAT_CAFE}'::uuid
            WHEN 'insumo'      THEN '{CAT_INSUMO}'::uuid
            WHEN 'veiculo'     THEN '{CAT_VEICULO}'::uuid
            WHEN 'equipamento' THEN '{CAT_EQUIP}'::uuid
            ELSE '{CAT_OUTRO}'::uuid
        END
        WHERE category_id IS NULL AND category IS NOT NULL
        """
    )
    op.execute("ALTER TABLE stock_items ALTER COLUMN category_id SET NOT NULL")

    # 5. category vira NULLABLE (deprecated) — sem dropar coluna nem tipo.
    op.execute("ALTER TABLE stock_items ALTER COLUMN category DROP NOT NULL")


def downgrade() -> None:
    # Repopula o enum `category` a partir da FK antes de exigir NOT NULL.
    op.execute(
        f"""
        UPDATE stock_items SET category = CASE category_id
            WHEN '{CAT_CAFE}'::uuid    THEN 'cafe'::stock_category
            WHEN '{CAT_INSUMO}'::uuid  THEN 'insumo'::stock_category
            WHEN '{CAT_VEICULO}'::uuid THEN 'veiculo'::stock_category
            WHEN '{CAT_EQUIP}'::uuid   THEN 'equipamento'::stock_category
            ELSE 'outro'::stock_category
        END
        WHERE category IS NULL
        """
    )
    op.execute("ALTER TABLE stock_items ALTER COLUMN category SET NOT NULL")

    op.execute('DROP INDEX IF EXISTS "ix_stock_items_category_id"')
    op.execute(
        "ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS fk_stock_items_category"
    )
    op.execute("ALTER TABLE stock_items DROP COLUMN IF EXISTS category_id")

    op.execute('DROP INDEX IF EXISTS "ix_app_settings_key"')
    op.execute("DROP TABLE IF EXISTS app_settings")

    op.execute('DROP INDEX IF EXISTS "ix_category_role_assignments_role"')
    op.execute('DROP INDEX IF EXISTS "ix_category_role_assignments_category_id"')
    op.execute("DROP TABLE IF EXISTS category_role_assignments")

    op.execute('DROP INDEX IF EXISTS "ix_stock_categories_deleted_at"')
    op.execute('DROP INDEX IF EXISTS "ix_stock_categories_name"')
    op.execute("DROP TABLE IF EXISTS stock_categories")

    op.execute("DROP TYPE IF EXISTS system_role")
