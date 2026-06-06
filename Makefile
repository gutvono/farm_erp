.PHONY: up down reset-db logs build shell-backend shell-db e2e \
        up-prod down-prod build-prod reset-db-prod

up:
	docker-compose up

down:
	docker-compose down

build:
	docker-compose build

logs:
	docker-compose logs -f

reset-db:
	docker-compose exec -T backend poetry run python scripts/reset_db.py

# E2E (Playwright): semeia o banco de forma determinística e roda a suíte.
# Pré-requisitos (uma vez): stack de pé (`make up`) e browsers do Playwright
# instalados — `cd frontend && npx playwright install --with-deps chromium`.
e2e:
	$(MAKE) reset-db
	cd frontend && npx playwright test

shell-backend:
	docker-compose exec backend bash

shell-db:
	docker-compose exec postgres psql -U postgres -d coffee_farm_erp

# ── produção ──────────────────────────────────────────────────────────────────

up-prod:
	docker compose -f docker-compose.prod.yml --env-file .env.prod up

down-prod:
	docker compose -f docker-compose.prod.yml down

build-prod:
	docker compose -f docker-compose.prod.yml build

reset-db-prod:
	docker compose -f docker-compose.prod.yml exec backend poetry run python scripts/reset_db.py
