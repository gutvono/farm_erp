"""job positions

Demanda 2 (Folha — Cargos). O cargo do funcionário deixa de ser texto livre
(`employees.role`) e vira ENTIDADE cadastrável (`job_positions`), referenciada
por FK única (`employees.position_id`). Um funcionário tem UM cargo por vez
(NÃO é M:N); a contagem por cargo que o PCP precisará sai de
`COUNT(employees) GROUP BY position_id`.

Cria a tabela `job_positions`:
- `name VARCHAR(120)` ÚNICO NOT NULL  → nome do cargo (índice unique ix_job_positions_name).
- `description TEXT NULL`             → descrição livre.
- `base_salary NUMERIC(12,2) NOT NULL`→ salário base SUGERIDO (prefilla o do funcionário; default 0 nesta migração de dados).
- `is_active BOOLEAN NOT NULL`        → cargo disponível para uso.
- `created_at/updated_at/deleted_at`  → padrões do projeto (soft delete).

Migração de dados (na mesma migration, idempotente e reversível):
1. Cria `job_positions`.
2. Insere um cargo para cada valor DISTINTO de `employees.role` (base_salary=0;
   o ajuste fino fica para a UI — decisão documentada em schema.md).
3. Adiciona `employees.position_id` (nullable nesta etapa) + FK + índice.
4. Backfill: vincula cada funcionário ao cargo cujo `name` = seu `role` (igualdade
   EXATA de texto — "Colhedor" e "Colhedora" são cargos distintos, sem normalizar).
5. Torna `position_id` NOT NULL.
6. Torna `employees.role` NULLABLE (DEPRECATED) — NÃO dropa. O Backend ainda lê
   `role` até o passo seguinte; o DROP físico de `role` será feito lá.

`downgrade()` repopula `role` a partir do nome do cargo, volta `role` a NOT NULL,
remove `position_id` (índice/FK/coluna) e dropa `job_positions`.

Idempotente (IF NOT EXISTS / IF EXISTS / DO-block + ON CONFLICT): roda também no
caminho do banco novo, em que `0001` (`create_all`) já criou tabela/coluna a partir
dos models atualizados.

Revision ID: 0013_job_positions
Revises: 0012_invoice_cancel_fields
Create Date: 2026-06-03

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0013_job_positions"
down_revision: Union[str, None] = "0012_invoice_cancel_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Guard de create_all (banco novo): o `0001` roda `Base.metadata.create_all`
    #    sobre os models ATUAIS, que já não têm mais a coluna `role` (dropada no
    #    0014). Sem este guard, o passo 2 (`SELECT ... role`) quebraria em banco
    #    novo com "column role does not exist". Em prod a coluna já existe (0013
    #    rodou quando o model ainda tinha `role`), então isto é no-op lá. A coluna
    #    é dropada logo em seguida pelo 0014 — net-schema-neutral.
    op.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS role VARCHAR(100)")

    # 1. Tabela job_positions (sem server_default em id/base_salary/is_active para
    #    casar 1:1 com os models, que usam default Python — alembic check limpo).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS job_positions (
            id UUID NOT NULL,
            name VARCHAR(120) NOT NULL,
            description TEXT,
            base_salary NUMERIC(12, 2) NOT NULL,
            is_active BOOLEAN NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            deleted_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT job_positions_pkey PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ix_job_positions_name" '
        'ON "job_positions" ("name")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_job_positions_deleted_at" '
        'ON "job_positions" ("deleted_at")'
    )

    # 2. Um cargo por valor DISTINTO de employees.role (base_salary = 0).
    op.execute(
        """
        INSERT INTO job_positions (id, name, base_salary, is_active, created_at, updated_at)
        SELECT gen_random_uuid(), r.role, 0, TRUE, now(), now()
        FROM (SELECT DISTINCT role FROM employees WHERE role IS NOT NULL) AS r
        ON CONFLICT (name) DO NOTHING
        """
    )

    # 3. Coluna position_id (nullable) + FK + índice.
    op.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_id UUID")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_position'
            ) THEN
                ALTER TABLE employees
                    ADD CONSTRAINT fk_employees_position
                    FOREIGN KEY (position_id) REFERENCES job_positions (id);
            END IF;
        END $$
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_employees_position_id" '
        'ON "employees" ("position_id")'
    )

    # 4. Backfill por igualdade exata de texto (role -> cargo).
    op.execute(
        """
        UPDATE employees e
        SET position_id = jp.id
        FROM job_positions jp
        WHERE jp.name = e.role AND e.position_id IS NULL
        """
    )

    # 5. position_id NOT NULL (após backfill; no banco novo já é NOT NULL).
    op.execute("ALTER TABLE employees ALTER COLUMN position_id SET NOT NULL")

    # 6. role vira NULLABLE (DEPRECATED) — sem dropar (Backend ainda lê).
    op.execute("ALTER TABLE employees ALTER COLUMN role DROP NOT NULL")


def downgrade() -> None:
    # Repopula role a partir do nome do cargo antes de exigir NOT NULL.
    op.execute(
        """
        UPDATE employees e
        SET role = jp.name
        FROM job_positions jp
        WHERE jp.id = e.position_id AND e.role IS NULL
        """
    )
    op.execute("ALTER TABLE employees ALTER COLUMN role SET NOT NULL")

    op.execute('DROP INDEX IF EXISTS "ix_employees_position_id"')
    op.execute(
        "ALTER TABLE employees DROP CONSTRAINT IF EXISTS fk_employees_position"
    )
    op.execute("ALTER TABLE employees DROP COLUMN IF EXISTS position_id")

    op.execute('DROP INDEX IF EXISTS "ix_job_positions_deleted_at"')
    op.execute('DROP INDEX IF EXISTS "ix_job_positions_name"')
    op.execute("DROP TABLE IF EXISTS job_positions")
