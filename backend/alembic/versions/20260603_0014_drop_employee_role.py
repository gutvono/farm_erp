"""drop employee role

Demanda 2 (Folha — Cargos), passo final. A coluna texto livre ``employees.role``
foi rebaixada a NULLABLE/DEPRECATED na migration 0013 e, a partir do Backend da
Demanda 2, NENHUM ponto do código lê ou escreve ``role`` — o dado canônico do
cargo é ``employees.position_id`` (FK → ``job_positions``). Esta migration faz o
DROP físico da coluna.

``downgrade()`` apenas recria a coluna ``role`` (VARCHAR(100) NULLABLE). NÃO
repopula, pois o dado canônico é ``position_id`` — quem precisar do texto resolve
via ``JOIN job_positions``. (A migration 0013, se revertida na sequência, repopula
``role`` a partir do nome do cargo antes de exigir NOT NULL.)

Idempotente (IF EXISTS / IF NOT EXISTS): roda também no caminho do banco novo, em
que ``0001`` (``create_all``) já criou a tabela ``employees`` sem a coluna ``role``
a partir do model atualizado.

Revision ID: 0014_drop_employee_role
Revises: 0013_job_positions
Create Date: 2026-06-03

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0014_drop_employee_role"
down_revision: Union[str, None] = "0013_job_positions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE employees DROP COLUMN IF EXISTS role")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS role VARCHAR(100)"
    )
