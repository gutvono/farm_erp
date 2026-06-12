"""sale header discount

Demanda 9.C (passo DBA). Adiciona à tabela `sales` o desconto de CABEÇALHO
(sobre o total da venda, não por item):
- `discount_percent` NUMERIC(5,2) NOT NULL DEFAULT 0 — percentual informado na venda.
- `discount_amount`  NUMERIC(12,2) NOT NULL DEFAULT 0 — valor do desconto em R$.

Modelo ERP correto: o preço de tabela do item permanece intacto (sale_items.subtotal
= preço cheio); o desconto é registrado à parte no cabeçalho e `total_amount` já é o
LÍQUIDO (subtotal − discount_amount). Auditável de ponta a ponta: venda → nota → AR.

Idempotência / create_all:
- A `0001` constrói o schema via `Base.metadata.create_all`, então no banco NOVO as
  colunas já nascem com o model (NOT NULL, SEM default no banco — o model usa
  `default=0` Python-side). O `ADD COLUMN IF NOT EXISTS` aqui vira no-op nesse caminho.
- Por isso aplicamos `SET DEFAULT 0` em seguida (sempre): no banco novo dá ao seed o
  default que o create_all não criou (senão INSERT que omite a coluna estoura NOT NULL);
  no banco existente é redundante-mas-inócuo. Ver [[project_alembic_create_all_idempotency]]
  (server-default trap). No banco existente, o `ADD COLUMN ... NOT NULL DEFAULT 0`
  preenche as linhas pré-existentes com 0 (sem backfill manual).

downgrade(): dropa as duas colunas (IF EXISTS).

Revision ID: 0023_sale_discount
Revises: 0022_fin_cat_juros_multa
Create Date: 2026-06-11

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0023_sale_discount"
down_revision: Union[str, None] = "0022_fin_cat_juros_multa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0"
    )
    # Garante o default no banco para o caminho create_all (onde o ADD acima é no-op).
    op.execute("ALTER TABLE sales ALTER COLUMN discount_percent SET DEFAULT 0")
    op.execute("ALTER TABLE sales ALTER COLUMN discount_amount SET DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE sales DROP COLUMN IF EXISTS discount_amount")
    op.execute("ALTER TABLE sales DROP COLUMN IF EXISTS discount_percent")
