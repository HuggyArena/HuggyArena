.PHONY: install prisma build typecheck contracts subgraph relayer indexer

install:
	pnpm install

prisma:
	pnpm prisma:generate

build:
	pnpm build

typecheck:
	pnpm typecheck

contracts:
	pnpm contracts:build

subgraph:
	pnpm subgraph:build

relayer:
	pnpm relayer:dev

indexer:
	pnpm indexer:dev
