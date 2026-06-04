"""
Seed-only script — NÃO dropa nem recria o banco, NÃO roda alembic.
Assume que as migrations já foram aplicadas (ex: via alembic upgrade head).

Uso:
    poetry run python scripts/seed_only.py

No Railway (pre-deploy command):
    poetry run alembic upgrade head && poetry run python scripts/seed_only.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlalchemy
from sqlalchemy import text


def _normalize_url(url: str) -> str:
    # Railway (e Heroku) injetam DATABASE_URL com "postgres://" — prefixo legado
    # que o SQLAlchemy 2.x rejeita. Normaliza para "postgresql://".
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url

# Tabelas na ordem correta para DELETE sem violar FK.
# Filhas antes das pais.
TABLES_TO_CLEAR = [
    "user_sessions",
    "notifications",
    "plot_activities",
    "production_inputs",
    "production_order_workers",
    "production_order_services",
    "production_orders",
    "plots",
    "payroll_entries",
    "payroll_periods",
    "sale_items",
    "sales",
    "invoice_items",
    "invoices",
    # Cotações — filhas antes das pais. quotation_items.stock_item_id e
    # quotation_proposals.supplier_id são RESTRICT, então precisam ser limpas
    # antes de stock_items/suppliers.
    "quotation_proposal_items",
    "quotation_proposals",
    "quotation_items",
    "quotations",
    "purchase_order_receipts",
    "purchase_order_items",
    "purchase_orders",
    "stock_movements",
    "stock_items",
    "accounts_receivable",
    "accounts_payable",
    "financial_movements",
    "employees",
    # job_positions DEPOIS de employees: employees.position_id → job_positions
    # (fk_employees_position, sem ON DELETE CASCADE). Precisa ser limpa
    # explicitamente, senão as linhas que a migration 0013 criou em prod (a
    # partir do role legado) sobrevivem e colidem por NOME com o seed
    # (ix_job_positions_name) — ON CONFLICT (id) não protege contra esse conflito.
    "job_positions",
    "suppliers",
    "clients",
    "users",
]


def main() -> None:
    database_url = _normalize_url(os.environ.get("DATABASE_URL", ""))
    if not database_url:
        print("[seed-only] ERROR: DATABASE_URL não está definida no ambiente")
        sys.exit(1)

    print(f"[seed-only] Conectando ao banco...")
    engine = sqlalchemy.create_engine(database_url)

    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    seed_file = os.path.join(scripts_dir, "seed.sql")

    if not os.path.exists(seed_file):
        print(f"[seed-only] ERROR: seed.sql não encontrado em {seed_file}")
        sys.exit(1)

    with engine.connect() as conn:
        # ── 1. Limpa tabelas na ordem correta ─────────────────────────────────
        print(f"[seed-only] Limpando {len(TABLES_TO_CLEAR)} tabelas...")
        for table in TABLES_TO_CLEAR:
            conn.execute(text(f'DELETE FROM "{table}"'))
            print(f"[seed-only]   ✓ {table}")
        conn.commit()
        print("[seed-only] Tabelas limpas.")

        # ── 2. Executa seed.sql ────────────────────────────────────────────────
        # exec_driver_sql passa o SQL diretamente ao cursor do psycopg2,
        # suportando múltiplos statements separados por ponto-e-vírgula.
        print(f"[seed-only] Aplicando seed de {seed_file}...")
        with open(seed_file, "r", encoding="utf-8") as f:
            sql = f.read()
        conn.exec_driver_sql(sql)
        conn.commit()
        print("[seed-only] Seed aplicado com sucesso.")

    engine.dispose()
    print("[seed-only] Concluído.")


if __name__ == "__main__":
    main()
