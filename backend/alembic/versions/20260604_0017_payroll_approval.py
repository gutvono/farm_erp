"""payroll approval flow

Demanda 4 (D6). Pagar funcionário(s) deixa de sair direto da conta: passa a gerar
uma SOLICITAÇÃO de aprovação que aparece na aba *Aprovações* do Financeiro. Só
após o Financeiro aprovar o dinheiro sai, e é emitida 1 NF de folha por
funcionário (`invoices.invoice_type = 'folha_pagamento'`). Esta migration entrega
só o schema; o fluxo (API) é o passo Backend.

Mudanças:
- Enum `payroll_entry_status`: adiciona o valor `aguardando_aprovacao`
  (fluxo `pendente → aguardando_aprovacao → pago`; volta a `pendente` na recusa).
- Tabela `payroll_payment_requests` (entidade de negócio → soft delete).
- Tabela `payroll_payment_request_entries` (junção solicitação ↔ holerite; sem
  soft delete; CASCADE da solicitação).

NF de folha NÃO precisa de migration: `invoices.invoice_type` já é `VARCHAR(50)`,
então `folha_pagamento` é apenas um novo valor de string.

Idempotência / create_all:
- `ALTER TYPE ... ADD VALUE IF NOT EXISTS` roda em `autocommit_block` (ADD VALUE
  não pode rodar em transação no Postgres). Como o valor também está na classe
  enum Python, no banco novo o `0001` (`create_all`) já cria o tipo COM o valor →
  o ADD VALUE vira no-op (o IF NOT EXISTS evita erro de valor duplicado).
- Tabelas criadas com `CREATE TABLE IF NOT EXISTS` + FKs em DO-block + índices
  `IF NOT EXISTS`, idempotentes contra o `create_all` do banco novo.

downgrade(): dropa as 2 tabelas. **NÃO remove o valor do enum** — Postgres não
suporta remover valor de enum de forma simples/segura; deixá-lo é inócuo (mesma
estratégia da 0002). Documentado em schema.md.

Revision ID: 0017_payroll_approval
Revises: 0016_drop_stock_category
Create Date: 2026-06-04

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0017_payroll_approval"
down_revision: Union[str, None] = "0016_drop_stock_category"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Novo valor do enum payroll_entry_status (fora de transação).
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE payroll_entry_status "
            "ADD VALUE IF NOT EXISTS 'aguardando_aprovacao'"
        )

    # 2. payroll_payment_requests (soft delete; status textual, sem server_default
    #    além de requested_at = now(), espelhando os models).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS payroll_payment_requests (
            id UUID NOT NULL,
            payroll_period_id UUID NOT NULL,
            request_type VARCHAR(20) NOT NULL,
            status VARCHAR(40) NOT NULL,
            total_amount NUMERIC(12, 2) NOT NULL,
            approval_note TEXT,
            requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            decided_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            deleted_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT payroll_payment_requests_pkey PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'payroll_payment_requests_payroll_period_id_fkey'
            ) THEN
                ALTER TABLE payroll_payment_requests
                    ADD CONSTRAINT payroll_payment_requests_payroll_period_id_fkey
                    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods (id);
            END IF;
        END $$
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_payroll_payment_requests_payroll_period_id" '
        'ON "payroll_payment_requests" ("payroll_period_id")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_payroll_payment_requests_status" '
        'ON "payroll_payment_requests" ("status")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_payroll_payment_requests_deleted_at" '
        'ON "payroll_payment_requests" ("deleted_at")'
    )

    # 3. payroll_payment_request_entries (junção; sem soft delete).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS payroll_payment_request_entries (
            id UUID NOT NULL,
            payment_request_id UUID NOT NULL,
            payroll_entry_id UUID NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT payroll_payment_request_entries_pkey PRIMARY KEY (id),
            CONSTRAINT uq_ppre_request_entry UNIQUE (payment_request_id, payroll_entry_id)
        )
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_ppre_request'
            ) THEN
                ALTER TABLE payroll_payment_request_entries
                    ADD CONSTRAINT fk_ppre_request
                    FOREIGN KEY (payment_request_id)
                    REFERENCES payroll_payment_requests (id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_ppre_entry'
            ) THEN
                ALTER TABLE payroll_payment_request_entries
                    ADD CONSTRAINT fk_ppre_entry
                    FOREIGN KEY (payroll_entry_id) REFERENCES payroll_entries (id);
            END IF;
        END $$
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_payroll_payment_request_entries_payment_request_id" '
        'ON "payroll_payment_request_entries" ("payment_request_id")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS '
        '"ix_payroll_payment_request_entries_payroll_entry_id" '
        'ON "payroll_payment_request_entries" ("payroll_entry_id")'
    )


def downgrade() -> None:
    # Dropa as tabelas (filha antes da pai). O valor de enum `aguardando_aprovacao`
    # é deixado no tipo: Postgres não remove valores de enum de forma segura
    # (mesma estratégia da 0002). Inócuo — nenhuma linha o usa após o drop.
    op.execute(
        'DROP INDEX IF EXISTS "ix_payroll_payment_request_entries_payroll_entry_id"'
    )
    op.execute(
        'DROP INDEX IF EXISTS "ix_payroll_payment_request_entries_payment_request_id"'
    )
    op.execute("DROP TABLE IF EXISTS payroll_payment_request_entries")

    op.execute('DROP INDEX IF EXISTS "ix_payroll_payment_requests_deleted_at"')
    op.execute('DROP INDEX IF EXISTS "ix_payroll_payment_requests_status"')
    op.execute('DROP INDEX IF EXISTS "ix_payroll_payment_requests_payroll_period_id"')
    op.execute("DROP TABLE IF EXISTS payroll_payment_requests")
