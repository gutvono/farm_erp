"""financial category juros_multa

Demanda 9.B (passo DBA). Adiciona a categoria financeira `juros_multa` ao enum
`financial_category`, para classificar o encargo (multa + juros de mora) cobrado
na baixa de uma parcela vencida. O cálculo do encargo e o lançamento do movimento
são da etapa Backend; aqui só entra o valor do enum.

Idempotência / create_all:
- `ALTER TYPE ... ADD VALUE IF NOT EXISTS` roda em `autocommit_block` (ADD VALUE
  não pode rodar dentro de transação no Postgres). Como o valor também está na
  classe enum Python `FinancialCategory`, no banco novo o `0001` (`create_all`) já
  cria o tipo COM o valor → o ADD VALUE vira no-op (o IF NOT EXISTS evita erro de
  valor duplicado). Mesma estratégia da `0017_payroll_approval` (Demanda 4).

downgrade(): NO-OP. Postgres não remove valores de enum de forma simples/segura
(mesma estratégia da 0002/0017). Deixar o valor é inócuo — nenhuma linha o usa
após reverter. Documentado em schema.md.

Revision ID: 0024_fin_cat_juros_multa
Revises: 0023_folha_irrf_event
Create Date: 2026-06-09

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0024_fin_cat_juros_multa"
down_revision: Union[str, None] = "0023_folha_irrf_event"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE não roda dentro de transação → autocommit_block.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE financial_category ADD VALUE IF NOT EXISTS 'juros_multa'"
        )


def downgrade() -> None:
    # NO-OP: Postgres não suporta remover valor de enum de forma segura.
    # Deixar 'juros_multa' no tipo é inócuo (nenhuma linha o referencia após
    # reverter). Mesma estratégia da 0002/0017.
    pass
