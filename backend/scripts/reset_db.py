"""
Reset database script.
Usage: poetry run python scripts/reset_db.py
"""
import os
import sys
import subprocess

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import sqlalchemy
from sqlalchemy import text


def _normalize_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def get_db_parts(database_url: str) -> tuple[str, str]:
    """Extract base URL (without db name) and db name from DATABASE_URL."""
    # e.g. postgresql://user:pass@host:port/dbname
    base, db_name = database_url.rsplit("/", 1)
    return base, db_name


def main() -> None:
    database_url = _normalize_url(os.environ.get("DATABASE_URL", ""))
    if not database_url:
        print("ERROR: DATABASE_URL not set in .env")
        sys.exit(1)

    base_url, db_name = get_db_parts(database_url)
    postgres_url = f"{base_url}/postgres"  # Connect to postgres default db

    print(f"[reset-db] Connecting to: {postgres_url}")
    engine = sqlalchemy.create_engine(postgres_url, isolation_level="AUTOCOMMIT")

    with engine.connect() as conn:
        # Terminate existing connections
        print(f"[reset-db] Terminating connections to '{db_name}'...")
        conn.execute(text(
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{db_name}' AND pid <> pg_backend_pid()"
        ))

        # Drop database
        print(f"[reset-db] Dropping database '{db_name}'...")
        conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}"'))

        # Create database
        print(f"[reset-db] Creating database '{db_name}'...")
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))

    engine.dispose()

    # Run alembic upgrade head
    print("[reset-db] Running alembic upgrade head...")
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(scripts_dir)
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        capture_output=False,
    )
    if result.returncode != 0:
        print("[reset-db] ERROR: alembic upgrade head failed")
        sys.exit(1)

    # Run seed.sql if it exists
    seed_file = os.path.join(scripts_dir, "seed.sql")
    if os.path.exists(seed_file):
        print(f"[reset-db] Applying seed data from {seed_file}...")
        seed_engine = sqlalchemy.create_engine(database_url)
        with seed_engine.connect() as conn:
            with open(seed_file, "r", encoding="utf-8") as f:
                sql = f.read()
            conn.exec_driver_sql(sql)
            conn.commit()
        seed_engine.dispose()
        print("[reset-db] Seed data applied.")
    else:
        print("[reset-db] No seed.sql found, skipping seed step.")

    print("[reset-db] Database reset complete.")


if __name__ == "__main__":
    main()
