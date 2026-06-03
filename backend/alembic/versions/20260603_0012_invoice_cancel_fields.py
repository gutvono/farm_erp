"""invoice cancel fields

Demanda 1 (Cancelamento de NF com estorno) — schema mínimo de auditoria do
cancelamento + índice de navegação por tipo de NF. Toda a lógica de estorno
(passo 2, Backend) reusa `financial_movements`, `stock_movements` e `stock_items`
já existentes — nenhuma tabela nova é necessária.

Adiciona em `invoices`:
- `cancelled_at TIMESTAMPTZ NULL`     → quando a NF foi cancelada (auditoria).
- `cancellation_reason TEXT NULL`     → motivo/observação do cancelamento.
  (Distinto de `deleted_at` (soft delete) — não reaproveitar.)

Índice:
- `idx_invoices_invoice_type` em `invoices.invoice_type` → filtro de NFs por tipo
  (venda/recebimento/transporte/devolucao) no despacho do cancelamento.
  `parent_invoice_id` já é indexado (`ix_invoices_parent_invoice_id`, via FK) — não recriado.

Migration idempotente (IF NOT EXISTS / IF EXISTS) e reversível.

Revision ID: 0012_invoice_cancel_fields
Revises: 0011_add_sort_indexes
Create Date: 2026-06-03

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0012_invoice_cancel_fields"
down_revision: Union[str, None] = "0011_add_sort_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE invoices "
        "ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "ALTER TABLE invoices "
        "ADD COLUMN IF NOT EXISTS cancellation_reason TEXT"
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_invoices_invoice_type" '
        'ON "invoices" ("invoice_type")'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_invoices_invoice_type"')
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS cancellation_reason")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS cancelled_at")
