# HF-arenas

**THE ARENA // HF TOP** — crypto-native prediction markets for Hugging Face model performance, benchmark outcomes, and repository metrics.

> _"Polymarket for AI — where builders bet on model outcomes, benchmark victories, and leaderboard dominance."_

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/cyberblicc-sketch/HF-arenas/actions/workflows/ci.yml/badge.svg)](https://github.com/cyberblicc-sketch/HF-arenas/actions/workflows/ci.yml)

---

## Vision

HF-Arenas is a **regulated, incentive-aligned intelligence layer** for the AI ecosystem. It enables participants to create and trade prediction markets around verifiable, on-chain-resolvable outcomes sourced directly from the Hugging Face platform: model benchmark rankings, repository download velocity, leaderboard victories, and dataset adoption metrics.

Where Polymarket covers world events, **HF-Arenas covers the outcomes that matter most to the AI community** — surfacing collective intelligence about which models will dominate next month's benchmarks, which architectures will outperform, and which communities will ship fastest.

**This is not gambling. This is the AI ecosystem pricing its own future.**

---

## What this repo is

THE ARENA // HF TOP is a production-grade monorepo containing:

| Component | Description |
|-----------|-------------|
| `packages/contracts` | Solidity 0.8.26 market contracts (ArenaMarket, ArenaRegistry) with full Foundry test suite |
| `apps/relayer` | NestJS gasless relayer with EIP-712 signed execution, Gelato integration, and compliance middleware |
| `apps/indexer` | NestJS event indexer syncing on-chain market state to Postgres |
| `packages/shared-prisma` | Shared Prisma ORM client for relayer and indexer |
| `prisma` | Database schema and migrations |
| `subgraph` | The Graph subgraph for decentralized data indexing |
| `config` | Production Docker Compose and deployment configs |
| `docs` | Audit handoff, next steps, and operational documentation |

---

## Product differentiation

### 1. AI-native market outcomes
Markets resolve against **deterministic, publicly verifiable data sources**: Hugging Face model cards, benchmark leaderboards, and repository metrics. No subjective oracles. No off-chain disputes. Every resolution is cryptographically provable.

### 2. Builder & creator incentive engine
- **Market Creator Rewards** — creators earn a fee share on every bet placed in their market
- **Builder Sponsorship Pools** — sweepstakes prize pools rewarding AI builders and contributors
- **Tournament mode** — season-long competitions with staking mechanics and leaderboard rankings
- **Referral system** — protocol-level referral fees for community growth

### 3. US-legal compliance architecture
- **US market**: Sweepstakes model — no purchase necessary, compliant with US promotional law
- **International market**: [Sumsub](https://sumsub.com) KYC/AML pipeline with OFAC/sanctions screening and webhook-driven onboarding
- **Fail-closed sanctions guard**: any API error or missing address defaults to deny — no accidental bypasses
- **Geoblocking and jurisdiction matrix** built into the compliance layer from day one

### 4. Multi-chain, gasless UX
- EIP-712 meta-transactions via Gelato Network — users never pay gas
- Deployable to Polygon, Base, Ethereum, and any EVM-compatible chain
- Upgradeable contracts (OpenZeppelin transparent proxy pattern)
- USDC-denominated pools for stable-value participation

---

## Fee economics

The protocol earns on every market interaction:

| Fee type | Rate |
|----------|------|
| Protocol fee | 2.75% |
| Creator fee | 1.00% |
| Referral fee | 0.50% |
| Dispute reserve | 0.75% |
| **Total** | **5.00%** |

Fee parameters are configurable via `ArenaRegistry` within a 50% maximum cap (`MAX_FEE_BPS = 5000`). All fee flows are on-chain and auditable.

---

## Compliance posture

| Jurisdiction | Mechanism | Status |
|-------------|-----------|--------|
| United States | Sweepstakes model (no-purchase-necessary) | ✅ Architecture in place |
| International | Sumsub KYC + AML, OFAC sanctions screening | ✅ Integration scaffolded |
| Sanctions screening | TRM / Chainalysis fail-closed guard | ✅ Implemented |
| Admin controls | OpenZeppelin AccessControl + Safe multisig | ✅ Implemented |

---

## Tech stack

```
Solidity 0.8.26     Smart contracts (Foundry, OpenZeppelin)
NestJS              Relayer + Indexer (TypeScript)
Prisma + Postgres   Off-chain state storage
The Graph           Decentralized indexing / subgraph
Gelato Network      Gasless meta-transactions
Sumsub              KYC / AML identity verification
pnpm + Turbo        Monorepo tooling
Docker Compose      Production deployment
```

---

## Current status

Infrastructure and engineering scaffold is **production-ready for audit and launch**. Pre-launch gate requirements:

- [ ] External smart contract security audit
- [ ] Jurisdiction-specific legal review (sweepstakes attorney sign-off)
- [ ] Production secrets management (KMS / multisig provisioning)
- [ ] Mainnet contract deployment and subgraph activation

---

## Configuration notes

Before deploying, update these placeholder values in your `.env` (copied from `.env.example`):

- `ADMIN_ADDRESS` — set to your real admin or multisig wallet address.
  The default (`0x0000000000000000000000000000000000000001`) is a placeholder and **must not** be used on mainnet.
- `REGISTRY_ADDRESS` — set to the deployed `ArenaRegistry` contract address.
  The default (`0x0000000000000000000000000000000000000000`) is the zero address and **will cause deployments to fail**.

Use a multisig (e.g. Safe) for `ADMIN_ADDRESS` on mainnet — never a single private key.

---

## Quick start

```bash
# Install dependencies
pnpm install

# Bootstrap everything (contracts → prisma → build)
make bootstrap

# Run contract tests
cd packages/contracts && forge test

# Start relayer (dev)
make relayer

# Start indexer (dev)
make indexer
```

---

## Roadmap

| Phase | Milestone | Status |
|-------|-----------|--------|
| 0 | Monorepo scaffold + contracts + relayer + indexer | ✅ Complete |
| 1 | External audit + legal sign-off | 🔄 In progress |
| 2 | North America MVP launch (sweepstakes model) | 🔜 Pending |
| 3 | International expansion (Sumsub KYC onboarding) | 🔜 Pending |
| 4 | Tournament mode + builder incentive pools | 🔜 Planned |
| 5 | Multi-chain deployment (Polygon, Base, Ethereum) | 🔜 Planned |

---

## Investor information

For investor inquiries, partnership proposals, or build collaboration:

**Contact:** [cyberblicc@icloud.com](mailto:cyberblicc@icloud.com)  
**Investor brief:** See [INVESTOR_BRIEF.md](INVESTOR_BRIEF.md) for the full investment thesis, market opportunity, and execution plan.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, PR guidelines, and code standards.

## License

MIT — see [LICENSE](LICENSE).
