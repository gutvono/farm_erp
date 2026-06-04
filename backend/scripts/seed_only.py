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


# Tabelas que SOBREVIVEM ao re-seed (NÃO são limpas). Mantenha explícito e
# comentado — exceções futuras (config persistente etc.) entram aqui.
# - alembic_version: estado das migrations. Limpá-la faria o próximo
#   `alembic upgrade head` tentar re-rodar a cadeia inteira e quebrar.
PRESERVE_TABLES = {"alembic_version"}


def _tables_to_clear(conn) -> list[str]:
    """Limpeza DERIVADA DO SCHEMA (não mais lista manual).

    Descobre todas as tabelas BASE do schema `public` no banco real e remove o
    conjunto de preservação. Motivo: a lista fixa antiga era um campo minado —
    toda tabela nova precisava ser lembrada, e esquecê-la quebrava o re-seed em
    prod por colisão de UNIQUE(name) entre a data-migration e o seed (incidentes
    `job_positions` na Demanda 2 e quase-incidente `stock_categories` na Demanda
    3). Derivando do schema, qualquer tabela nova (Demandas 4/5/…) entra na
    limpeza AUTOMATICAMENTE, sem editar este script.
    """
    rows = conn.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
            "ORDER BY table_name"
        )
    )
    return [r[0] for r in rows if r[0] not in PRESERVE_TABLES]


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
        # ── 1. Limpa tabelas (derivadas do schema) ─────────────────────────────
        # Um único TRUNCATE ... CASCADE: ordem-independente (o CASCADE resolve as
        # FKs), e a lista vem do banco — nenhuma tabela nova pode ser esquecida.
        tables = _tables_to_clear(conn)
        print(
            f"[seed-only] Limpando {len(tables)} tabelas "
            f"(derivadas do schema; preservadas: {', '.join(sorted(PRESERVE_TABLES))})..."
        )
        identifiers = ", ".join(f'"{t}"' for t in tables)
        conn.execute(text(f"TRUNCATE TABLE {identifiers} CASCADE"))
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
