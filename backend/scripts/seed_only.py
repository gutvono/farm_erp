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

# Tabelas na ordem correta para DELETE sem violar FK.
# Filhas antes das pais.
TABLES_TO_CLEAR = [
    "user_sessions",
    "notifications",
    "plot_activities",
    "production_inputs",
    "production_orders",
    "plots",
    "payroll_entries",
    "payroll_periods",
    "sale_items",
    "sales",
    "invoice_items",
    "invoices",
    "purchase_order_items",
    "purchase_orders",
    "stock_movements",
    "stock_items",
    "accounts_receivable",
    "accounts_payable",
    "financial_movements",
    "employees",
    "suppliers",
    "clients",
    "users",
]


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "")
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
        print(f"[seed-only] Aplicando seed de {seed_file}...")
        with open(seed_file, "r", encoding="utf-8") as f:
            sql = f.read()
        conn.execute(text(sql))
        conn.commit()
        print("[seed-only] Seed aplicado com sucesso.")

    engine.dispose()
    print("[seed-only] Concluído.")


if __name__ == "__main__":
    main()
