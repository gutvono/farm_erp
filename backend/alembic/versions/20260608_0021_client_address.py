"""client address: endereço estruturado do cliente

Demanda 7 (passo 1 — schema). Espelha a Demanda 6 (`0019_supplier_address`):
adiciona em `clients` os campos de endereço estruturado (cep, street, number,
complement, neighborhood, city, state), dando ao cadastro de cliente a mesma
paridade que o fornecedor ganhou.

Decisão do PO (travada, igual à D6): a coluna legada `address` (texto livre) é
MANTIDA por compatibilidade — NÃO é dropada. NÃO há backfill parseando `address`
→ campos estruturados (texto livre, parsing não confiável → dado sujo). Nas
linhas existentes os novos campos ficam NULL; quem popula de verdade é o
seed/cadastro.

Idempotência / create_all:
- A `0001` usa `Base.metadata.create_all`, que num banco novo já cria `clients`
  com os novos campos (o model já os reflete). Por isso cada `ADD COLUMN` é
  guardado com `IF NOT EXISTS`, virando no-op no banco novo e mantendo
  `alembic check` limpo.

downgrade(): remove os sete campos (DROP COLUMN IF EXISTS); a coluna `address`
legada é preservada.

Revision ID: 0021_client_address
Revises: 0020_supplier_items
Create Date: 2026-06-08

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0021_client_address"
down_revision: Union[str, None] = "0020_supplier_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (coluna, tipo) — todos nullable, sem backfill.
_ADDRESS_COLUMNS = (
    ("cep", "VARCHAR(9)"),
    ("street", "VARCHAR(255)"),
    ("number", "VARCHAR(20)"),
    ("complement", "VARCHAR(120)"),
    ("neighborhood", "VARCHAR(120)"),
    ("city", "VARCHAR(120)"),
    ("state", "VARCHAR(2)"),
)


def upgrade() -> None:
    for col, type_ in _ADDRESS_COLUMNS:
        op.execute(f"ALTER TABLE clients ADD COLUMN IF NOT EXISTS {col} {type_}")


def downgrade() -> None:
    for col, _type in reversed(_ADDRESS_COLUMNS):
        op.execute(f"ALTER TABLE clients DROP COLUMN IF EXISTS {col}")
