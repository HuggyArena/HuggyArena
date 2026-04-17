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

### Build All (5 workspaces: contracts, shared-prisma, relayer, indexer, subgraph)
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

## Repository Structure
```
packages/contracts/       — Solidity 0.8.26 (ArenaMarket, ArenaRegistry, ArenaFactory)
apps/relayer/            — NestJS gasless relayer
apps/indexer/            — NestJS event indexer
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
  --constructor-args $ADMIN_ADDRESS $USDC_ADDRESS $TREASURY_ADDRESS

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
