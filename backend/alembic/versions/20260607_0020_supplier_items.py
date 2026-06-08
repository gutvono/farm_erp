"""supplier items: catálogo fornecedor ↔ item de estoque

Demanda 6 (passo 1 — schema). Cria `supplier_items`, o catálogo que liga um
fornecedor aos itens de estoque que ele vende, com preço unitário. Sem coluna de
quantidade — o estoque do fornecedor é considerado infinito.

Regra de negócio (validada pelo Backend): toda ordem de compra de produto só pode
conter itens presentes no catálogo ATIVO do fornecedor daquela ordem.

Idempotência / create_all:
- A `0001` usa `Base.metadata.create_all`, que num banco novo já cria
  `supplier_items` a partir do model (com os mesmos índices). Por isso a tabela
  usa `CREATE TABLE IF NOT EXISTS` e os índices `CREATE INDEX IF NOT EXISTS` com
  os MESMOS nomes que o model define (`uq_supplier_items_*`, `idx_supplier_items_*`,
  `ix_supplier_items_deleted_at` herdado do SoftDeleteMixin), de modo que num
  banco novo tudo vira no-op e `alembic check` fica limpo.
- O índice de unicidade é PARCIAL (`WHERE deleted_at IS NULL`): evita duplicar um
  item ativo no mesmo fornecedor sem bloquear soft-deletes históricos.

downgrade(): dropa os índices e a tabela.

Revision ID: 0020_supplier_items
Revises: 0019_supplier_address
Create Date: 2026-06-07

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0020_supplier_items"
down_revision: Union[str, None] = "0019_supplier_address"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS supplier_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            supplier_id UUID NOT NULL,
            stock_item_id UUID NOT NULL,
            unit_price NUMERIC(12, 2) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ,
            CONSTRAINT fk_supplier_items_supplier
                FOREIGN KEY (supplier_id)
                REFERENCES suppliers(id) ON DELETE RESTRICT,
            CONSTRAINT fk_supplier_items_stock_item
                FOREIGN KEY (stock_item_id)
                REFERENCES stock_items(id) ON DELETE RESTRICT
        )
        """
    )
    # Unicidade parcial: um item ativo só uma vez por fornecedor; soft-deletes
    # (deleted_at não nulo) não colidem.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_items_supplier_stock_active "
        "ON supplier_items (supplier_id, stock_item_id) WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier_id "
        "ON supplier_items (supplier_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_supplier_items_stock_item_id "
        "ON supplier_items (stock_item_id)"
    )
    # deleted_at index herda o nome gerado pelo SoftDeleteMixin (index=True).
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_supplier_items_deleted_at "
        "ON supplier_items (deleted_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_supplier_items_deleted_at")
    op.execute("DROP INDEX IF EXISTS idx_supplier_items_stock_item_id")
    op.execute("DROP INDEX IF EXISTS idx_supplier_items_supplier_id")
    op.execute("DROP INDEX IF EXISTS uq_supplier_items_supplier_stock_active")
    op.execute("DROP TABLE IF EXISTS supplier_items")
