.PHONY: help up down build rebuild logs ps health migrate psql clean dev-be dev-fe backup restore backups

help:
	@echo "Qlio — make targets"
	@echo "  make up        Start all services"
	@echo "  make down      Stop all services"
	@echo "  make rebuild   Full rebuild + recreate (use this after code changes)"
	@echo "  make logs      Tail all logs"
	@echo "  make health    Check backend + frontend health"
	@echo "  make psql      Open a psql shell"
	@echo "  make backup    Dump the database now (gzipped, to backups/)"
	@echo "  make backups   List available backups"
	@echo "  make restore   Restore the newest backup (DESTRUCTIVE, prompts first)"
	@echo "  make dev-be    Run backend locally (needs local DATABASE_URL)"
	@echo "  make dev-fe    Run frontend dev server on :3007"

backup:
	./scripts/backup.sh

backups:
	./scripts/restore.sh --list

restore:
	./scripts/restore.sh

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

rebuild:
	docker compose build --no-cache
	docker compose up -d --force-recreate

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

health:
	@curl -fsS http://localhost:8087/api/health && echo "  <- backend OK" || echo "  x backend FAILED"
	@curl -fsS -o /dev/null -w "  frontend HTTP %{http_code}\n" http://localhost:3007/ || echo "  x frontend FAILED"

psql:
	docker compose exec db psql -U qlio -d qlio

clean:
	docker compose down -v
	@echo "Volumes removed. All data gone."

dev-be:
	cd backend && go run ./cmd/server

dev-fe:
	cd frontend && npm run dev
