#!/bin/sh
set -e

echo "[entrypoint] Rodando migrations..."
poetry run alembic upgrade head

echo "[entrypoint] Rodando seed..."
poetry run python scripts/seed_only.py

echo "[entrypoint] Subindo servidor..."
exec poetry run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
