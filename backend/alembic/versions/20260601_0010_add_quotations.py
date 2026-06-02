"""add quotations

Adiciona o sub-fluxo de Cotações ao módulo de Compras:

- `quotations`: cotação (produto ou serviço), com soft delete, status e ponteiros
  para a proposta vencedora e para a ordem de compra gerada.
- `quotation_items`: itens (produto) cotados.
- `quotation_proposals`: propostas de fornecedores para a cotação.
- `quotation_proposal_items`: preços unitários por item dentro de cada proposta.

Há uma FK circular: `quotations.winning_proposal_id -> quotation_proposals.id`
e `quotation_proposals.quotation_id -> quotations.id`. Por isso a FK de
`winning_proposal_id` (e a de `purchase_order_id`) é adicionada via ALTER TABLE
após a criação de ambas as tabelas.

Revision ID: 0010_add_quotations
Revises: 0009_pcp_workers_services
Create Date: 2026-06-01

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
# NB: version_num é VARCHAR(32) — manter o id <= 32 caracteres.
revision: str = "0010_add_quotations"
down_revision: Union[str, None] = "0009_pcp_workers_services"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enum quotation_status — criado via DO $$ idempotente.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quotation_status') THEN
                CREATE TYPE quotation_status AS ENUM (
                    'em_andamento',
                    'aguardando_aprovacao_financeiro',
                    'aprovado_financeiro',
                    'concluida',
                    'cancelada'
                );
            END IF;
        END$$;
        """
    )

    # 2. quotations — FKs circulares (winning_proposal_id, purchase_order_id)
    #    adicionadas mais abaixo via ALTER TABLE.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS quotations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_type VARCHAR(10) NOT NULL DEFAULT 'produto',
            status quotation_status NOT NULL DEFAULT 'em_andamento',
            service_description TEXT,
            notes TEXT,
            cancellation_note TEXT,
            winning_proposal_id UUID,
            purchase_order_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations (status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_quotations_purchase_order_id ON quotations (purchase_order_id)"
    )
    # deleted_at index herda o nome gerado pelo SoftDeleteMixin (index=True).
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_quotations_deleted_at ON quotations (deleted_at)"
    )

    # 3. quotation_items
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS quotation_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quotation_id UUID NOT NULL,
            stock_item_id UUID NOT NULL,
            quantity NUMERIC(12, 3) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_qi_quotation
                FOREIGN KEY (quotation_id)
                REFERENCES quotations(id) ON DELETE CASCADE,
            CONSTRAINT fk_qi_stock_item
                FOREIGN KEY (stock_item_id)
                REFERENCES stock_items(id) ON DELETE RESTRICT
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_qi_quotation_id ON quotation_items (quotation_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_qi_stock_item_id ON quotation_items (stock_item_id)"
    )

    # 4. quotation_proposals
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS quotation_proposals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quotation_id UUID NOT NULL,
            supplier_id UUID NOT NULL,
            total_price NUMERIC(12, 2),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_qp_quotation
                FOREIGN KEY (quotation_id)
                REFERENCES quotations(id) ON DELETE CASCADE,
            CONSTRAINT fk_qp_supplier
                FOREIGN KEY (supplier_id)
                REFERENCES suppliers(id) ON DELETE RESTRICT,
            CONSTRAINT uq_qp_quotation_supplier
                UNIQUE (quotation_id, supplier_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_qp_quotation_id ON quotation_proposals (quotation_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_qp_supplier_id ON quotation_proposals (supplier_id)"
    )

    # 5. quotation_proposal_items
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS quotation_proposal_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            proposal_id UUID NOT NULL,
            quotation_item_id UUID NOT NULL,
            unit_price NUMERIC(12, 2) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_qpi_proposal
                FOREIGN KEY (proposal_id)
                REFERENCES quotation_proposals(id) ON DELETE CASCADE,
            CONSTRAINT fk_qpi_quotation_item
                FOREIGN KEY (quotation_item_id)
                REFERENCES quotation_items(id) ON DELETE CASCADE,
            CONSTRAINT uq_qpi_proposal_item
                UNIQUE (proposal_id, quotation_item_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_qpi_proposal_id ON quotation_proposal_items (proposal_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_qpi_quotation_item_id ON quotation_proposal_items (quotation_item_id)"
    )

    # 6. FKs circulares de quotations (adicionadas após ambas as tabelas existirem).
    #    ADD CONSTRAINT não suporta IF NOT EXISTS diretamente — usa DO $$ guardado
    #    contra pg_constraint para manter idempotência.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_q_winning_proposal'
            ) THEN
                ALTER TABLE quotations
                    ADD CONSTRAINT fk_q_winning_proposal
                    FOREIGN KEY (winning_proposal_id)
                    REFERENCES quotation_proposals(id) ON DELETE SET NULL;
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_q_purchase_order'
            ) THEN
                ALTER TABLE quotations
                    ADD CONSTRAINT fk_q_purchase_order
                    FOREIGN KEY (purchase_order_id)
                    REFERENCES purchase_orders(id) ON DELETE SET NULL;
            END IF;
        END$$;
        """
    )


def downgrade() -> None:
    # 1. Drop FKs circulares de quotations.
    op.execute(
        "ALTER TABLE quotations DROP CONSTRAINT IF EXISTS fk_q_winning_proposal"
    )
    op.execute(
        "ALTER TABLE quotations DROP CONSTRAINT IF EXISTS fk_q_purchase_order"
    )

    # 2-3. quotation_proposal_items (índices caem junto com a tabela, mas os drops
    #      explícitos com IF EXISTS são seguros e idempotentes).
    op.execute("DROP INDEX IF EXISTS idx_qpi_quotation_item_id")
    op.execute("DROP INDEX IF EXISTS idx_qpi_proposal_id")
    op.execute("DROP TABLE IF EXISTS quotation_proposal_items")

    # 4-5. quotation_proposals
    op.execute("DROP INDEX IF EXISTS idx_qp_supplier_id")
    op.execute("DROP INDEX IF EXISTS idx_qp_quotation_id")
    op.execute("DROP TABLE IF EXISTS quotation_proposals")

    # 6-7. quotation_items
    op.execute("DROP INDEX IF EXISTS idx_qi_stock_item_id")
    op.execute("DROP INDEX IF EXISTS idx_qi_quotation_id")
    op.execute("DROP TABLE IF EXISTS quotation_items")

    # 8-9. quotations
    op.execute("DROP INDEX IF EXISTS ix_quotations_deleted_at")
    op.execute("DROP INDEX IF EXISTS idx_quotations_purchase_order_id")
    op.execute("DROP INDEX IF EXISTS idx_quotations_status")
    op.execute("DROP TABLE IF EXISTS quotations")

    # 10. Tipo enum.
    op.execute("DROP TYPE IF EXISTS quotation_status")
