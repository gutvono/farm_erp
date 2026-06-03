"""add sort indexes

Demanda 0 (Infra de Paginação) — garante índice nas colunas usadas como
ordenação DEFAULT das listagens, para a paginação ordenada não fazer full scan
quando o volume crescer.

Colunas cobertas (faltavam índice):
- `stock_movements.occurred_at`  → default da aba Movimentações (occurred_at desc)
- `purchase_orders.ordered_at`   → default da lista de Compras (ordered_at desc)
- `sales.sold_at`                → default da lista de Vendas (sold_at desc)
- `invoices.issue_date`          → default da lista de Faturamento (issue_date desc)

Já possuíam índice (não recriados aqui): `financial_movements.occurred_at`,
`accounts_payable.due_date`, `accounts_receivable.due_date`, e as colunas `name`
de clients/suppliers/stock_items/employees (via `index=True` no model). Índices
btree comuns servem tanto ASC quanto DESC (Postgres faz backward scan).

Migration idempotente (CREATE INDEX IF NOT EXISTS) e reversível.

Revision ID: 0011_add_sort_indexes
Revises: 0010_add_quotations
Create Date: 2026-06-02

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0011_add_sort_indexes"
down_revision: Union[str, None] = "0010_add_quotations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (índice, tabela, coluna)
SORT_INDEXES: list[tuple[str, str, str]] = [
    ("idx_stock_movements_occurred_at", "stock_movements", "occurred_at"),
    ("idx_purchase_orders_ordered_at", "purchase_orders", "ordered_at"),
    ("idx_sales_sold_at", "sales", "sold_at"),
    ("idx_invoices_issue_date", "invoices", "issue_date"),
]


def upgrade() -> None:
    for index_name, table_name, column_name in SORT_INDEXES:
        op.execute(
            f'CREATE INDEX IF NOT EXISTS "{index_name}" '
            f'ON "{table_name}" ("{column_name}")'
        )


def downgrade() -> None:
    for index_name, _table_name, _column_name in SORT_INDEXES:
        op.execute(f'DROP INDEX IF EXISTS "{index_name}"')
