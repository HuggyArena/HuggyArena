# HuggyArena — Agent Skills

## Project Overview
HuggyArena is a crypto-native prediction market platform for Hugging Face AI outcomes. Monorepo with Solidity contracts, NestJS backend services, Prisma/PostgreSQL, The Graph subgraph.

## Environment Setup

### Prerequisites
- Node.js 18+ with pnpm 9.12.3
- Foundry (forge, cast, anvil, chisel)
- Docker + Docker Compose (for PostgreSQL + Redis)

### Bootstrap Commands
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc && foundryup

# Install dependencies
pnpm install

# Install Forge libraries
cd packages/contracts
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable --no-git
cd ../..

# Setup environment
cp .env.example .env

# Generate Prisma client
pnpm prisma:generate

# Start database services
docker compose -f config/docker-compose.production.yaml up -d db redis

# Run migrations
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/arena" pnpm prisma:migrate

# Build all workspaces
pnpm build
```

## Build & Test

### Build All (workspaces: contracts, shared-prisma, relayer, indexer, subgraph, analytics-agent)
```bash
pnpm build
```

### Smart Contract Tests (58 tests)
```bash
export PATH="$HOME/.foundry/bin:$PATH"
pnpm contracts:test
# Or verbose:
cd packages/contracts && forge test -vvv
```

### TypeScript Typecheck
```bash
pnpm typecheck
```

### Lint
```bash
pnpm lint
```

## Running Services

### Relayer (port 3001) — Gasless EIP-712 transaction relay via Gelato
```bash
pnpm relayer:dev
```

### Indexer (port 3002) — On-chain event sync to PostgreSQL
```bash
pnpm indexer:dev
```

### Analytics Agent (port 3003) — Purchase intelligence & signals API
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/arena" PORT=3003 pnpm --filter @arena/analytics-agent start:dev
# Swagger docs: http://localhost:3003/api/docs
# Health check: http://localhost:3003/api/health
```

### Database
```bash
# Start PostgreSQL (5432) + Redis (6379)
docker compose -f config/docker-compose.production.yaml up -d db redis

# Local connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/arena"
REDIS_URL="redis://localhost:6379"

# Apply migrations
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/arena" pnpm prisma:migrate

# Open Prisma Studio (visual DB browser)
cd prisma && npx prisma studio
```

## Testing the Analytics Agent

### Seeding Test Data
Use `docker exec` with individual psql commands to insert seed data. Heredocs through `docker exec` may silently fail — use single `-c` flag commands instead:
```bash
# Example: seed users
docker exec config-db-1 psql -U postgres -d arena -c "INSERT INTO \"User\" (id, \"walletAddress\", ...) VALUES (...);"
```

Recommended seed data for comprehensive testing:
- 3 users (whale: $10K wagered, power: $2.8K wagered, casual: $100 wagered)
- 3 markets (2 OPEN, 1 RESOLVED) with outcomes
- 9 bets across all users and markets
- 4 positions (2 open, 2 settled with varying claimable amounts)
- 3 relay transactions (2 CONFIRMED, 1 PENDING)

### Key API Endpoints to Test
| Endpoint | Key Assertions |
|----------|---------------|
| GET /api/health | `status: "ok"`, `database: "ok"` |
| GET /api/signals/dashboard | totalVolume, totalBets, totalUsers, activeMarkets match seed data |
| GET /api/signals/purchases?window=all | Returns all bets with user/market/outcome relations |
| GET /api/signals/markets?window=all | Markets sorted by totalPool desc |
| GET /api/customers/profiles?minWagered=X | `total` reflects filtered count (not raw DB count) |
| GET /api/customers/segments | Segment counts match thresholds: whale>=5000, power>=1000, regular>=100 |
| GET /api/customers/whales?minBetAmount=X | Only users whose largest single bet >= X |
| GET /api/revenue/breakdown?window=all | Fee BPS: protocol=2.75%, creator=1%, referral=0.5%, dispute=0.75% |
| GET /api/revenue/relay?window=all | Transaction counts by status |
| PATCH /api/alerts/rules/:id | Returns 404 for nonexistent rule IDs |

### Known Behaviors
- Dashboard `estimatedRevenue` shows protocol fee only (2.75%), not total 5%. Full breakdown at `/api/revenue/breakdown`.
- Dashboard `topWhale` is null until the first 5-minute collector cron cycle runs. Use `/api/customers/whales` for on-demand whale queries.
- Fired alerts are empty until the first 1-minute alert cron cycle. Rules are configured at startup.
- The collector cron (every 5 min) caches a snapshot; most endpoints fall back to live DB queries if no snapshot exists.

### CI Notes
- CodeQL SARIF upload failures (Analyze actions/python/javascript-typescript) are pre-existing GitHub infrastructure issues, not code-related.
- Actual code checks: `Contracts (forge test)` and `pnpm typecheck` are the ones to watch.

## Repository Structure
```
packages/contracts/       — Solidity 0.8.26 (ArenaMarket, ArenaRegistry, ArenaFactory)
apps/relayer/            — NestJS gasless relayer (port 3001)
apps/indexer/            — NestJS event indexer (port 3002)
apps/analytics-agent/    — NestJS analytics & signals API (port 3003)
packages/shared-prisma/  — Shared Prisma ORM client
prisma/                  — Database schema + migrations
subgraph/                — The Graph subgraph
config/                  — Docker Compose + OpenAPI spec
docs/                    — Architecture, compliance, oracle research
scripts/                 — Backtest scripts, demo checklist
.github/agents/          — GitHub Copilot agent definitions
```

## Key Architecture Decisions
- **Parimutuel market mechanism** with EIP-712 oracle-signed bet gating
- **Beacon Proxy pattern** for upgradeable market contracts
- **Dual-path oracle** via IOracleModule (Chainlink + UMA)
- **Fail-closed sanctions** — deny on any screening error
- **Gasless UX** — Gelato Network meta-transactions
- **Multi-chain** — Base (primary), Arbitrum (secondary), Polygon (legacy)

## Fee Structure
| Fee | Rate |
|-----|------|
| Protocol | 2.75% |
| Creator | 1.00% |
| Referral | 0.50% |
| Dispute Reserve | 0.75% |
| **Total** | **5.00%** |

## Contract Deployment
```bash
# Deploy to Base
export RPC_URL="https://mainnet.base.org"
cd packages/contracts
forge create src/ArenaRegistry.sol:ArenaRegistry \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY \
  --constructor-args $USDC_ADDRESS $ADMIN_ADDRESS

# Verify
forge verify-contract $ADDRESS src/ArenaRegistry.sol:ArenaRegistry \
  --chain base --etherscan-api-key $BASESCAN_API_KEY
```

## Subgraph Deployment
```bash
cd subgraph
graph auth --studio $GRAPH_DEPLOY_KEY
graph deploy --studio arena-hf-top
```

## Environment Variables (see .env.example)
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — Redis connection
- `RPC_URL` — EVM RPC (Alchemy/Infura)
- `ORACLE_PRIVATE_KEY` — Oracle signer for EIP-712
- `GELATO_API_KEY` — Gasless relay
- `TRM_API_KEY` — Sanctions screening
- `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY` — KYC
- `ADMIN_ADDRESS` — Multisig admin (NEVER use placeholder on mainnet)
- `REGISTRY_ADDRESS` — Deployed ArenaRegistry address

## Devin Secrets Needed
No secrets required for local testing — the analytics-agent only needs `DATABASE_URL` which uses the local Docker PostgreSQL instance with default credentials (`postgres:postgres`).
