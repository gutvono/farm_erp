.PHONY: help reset-db backend frontend dev

help:
	@echo "Coffee Farm ERP - Available Commands"
	@echo "===================================="
	@echo "  make reset-db     Reset and populate database"
	@echo "  make backend      Start FastAPI backend server"
	@echo "  make frontend     Start Next.js frontend dev server"
	@echo "  make dev          Start both backend and frontend"

reset-db:
	python backend/scripts/reset_db.py

backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd frontend && npm run dev

dev:
	@echo "Starting Coffee Farm ERP development environment..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend logs in one terminal, frontend in another"
	@(cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) & \
	(cd frontend && npm run dev) & \
	wait

.PHONY: help reset-db backend frontend dev
