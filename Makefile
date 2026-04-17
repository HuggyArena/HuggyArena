.PHONY: install prisma build typecheck contracts subgraph relayer indexer bootstrap test db db-stop lint

install:
	pnpm install

prisma:
	pnpm prisma:generate

build:
	pnpm build

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test:
	pnpm contracts:test
	pnpm typecheck

contracts:
	pnpm contracts:build

subgraph:
	pnpm subgraph:build

relayer:
	pnpm relayer:dev

indexer:
	pnpm indexer:dev

bootstrap: install contracts prisma build
	@echo "Bootstrap complete — all workspaces built."

db:
	docker compose -f config/docker-compose.production.yaml up -d db redis
	@echo "PostgreSQL (5432) and Redis (6379) started."

db-stop:
	docker compose -f config/docker-compose.production.yaml down
	@echo "Database services stopped."
