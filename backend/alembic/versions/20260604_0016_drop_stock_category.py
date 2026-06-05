"""drop stock_items.category enum + stock_category type

Demanda 3, passo final. A coluna `stock_items.category` (enum livre) foi
rebaixada a NULLABLE/DEPRECATED na migration 0015 e, a partir do Backend da
Demanda 3, NENHUM ponto do código lê ou escreve `category` — o dado canônico da
categoria é `stock_items.category_id` (FK → `stock_categories`). Esta migration
faz o DROP físico da coluna e, em seguida, do TIPO enum Postgres `stock_category`.

Ordem importa: primeiro DROP da coluna que usa o tipo, depois DROP do tipo
(`DROP TYPE` falha enquanto houver coluna dependente).

`downgrade()` recria o tipo `stock_category` e a coluna `category` (NULLABLE),
sem repopular — quem precisar resolve via `category_id`/papéis. (A 0015, se
revertida na sequência, repopula `category` a partir de `category_id`.)

Idempotente (IF EXISTS / DO-block): roda também no caminho do banco novo, em que
o GUARD da 0015 já criou tipo+coluna para viabilizar o backfill e esta migration
os remove logo após (net-schema-neutral). NÃO remover o guard da 0015.

Revision ID: 0016_drop_stock_category
Revises: 0015_stock_categories
Create Date: 2026-06-04

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0016_drop_stock_category"
down_revision: Union[str, None] = "0015_stock_categories"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. DROP da coluna (índice ix_stock_items_category cai junto com a coluna).
    op.execute("ALTER TABLE stock_items DROP COLUMN IF EXISTS category")
    # 2. DROP do tipo enum Postgres (sem dependentes após o passo 1).
    op.execute("DROP TYPE IF EXISTS stock_category")


def downgrade() -> None:
    # Recria o tipo e a coluna (nullable) — sem repopular.
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
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_stock_items_category" '
        'ON "stock_items" ("category")'
    )
