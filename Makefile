.PHONY: help install backend frontend dev reset-db

help:
	@echo "Coffee Farm ERP - Available Commands"
	@echo "===================================="
	@echo "  make install      Install all dependencies (backend + frontend)"
	@echo "  make backend      Start FastAPI backend server"
	@echo "  make frontend     Start Next.js frontend dev server"
	@echo "  make dev          Start both backend and frontend"
	@echo "  make reset-db     Reset and populate database"

install:
	cd backend && python -m poetry install
	cd frontend && npm install

backend:
	cd backend && python -m poetry run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

dev:
	make -j2 backend frontend

reset-db:
	cd backend && python -m poetry run python scripts/reset_db.py
