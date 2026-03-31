# HF-arenas

HF arenas — crypto-native prediction markets for Hugging Face models, datasets, and Spaces.

## What this repo is

THE ARENA // HF TOP is a compile-ready monorepo for:
- Solidity market contracts
- NestJS relayer and compliance services
- Indexer / subgraph scaffolding
- Prisma schema and migrations
- Production config examples
- Operational and audit handoff docs

## Current status

Pre-production engineering scaffold. Useful for implementation, review, and build-out, but not a substitute for:
- successful compilation and tests
- external smart contract audit
- jurisdiction-specific legal review
- production secrets management and deployment hardening

## Included

- `apps/relayer`
- `apps/indexer`
- `packages/contracts`
- `packages/shared-prisma`
- `prisma`
- `subgraph`
- `config`
- `docs`

## Recommended launch fee defaults

- Protocol: 2.75%
- Creator: 1.00%
- Referral: 0.50%
- Dispute reserve: 0.75%
- Total default fee: 5.00%

## Next steps

1. Install dependencies
2. Run Prisma migrations
3. Compile contracts
4. Type-check relayer and indexer
5. Build subgraph against final deployed addresses
6. Complete external audit and legal localization
