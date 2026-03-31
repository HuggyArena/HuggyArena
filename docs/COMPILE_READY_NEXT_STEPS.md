# Compile-ready next steps

## 1. Install dependencies
- `pnpm install`
- install Foundry dependencies for `packages/contracts`

## 2. Database
- set `DATABASE_URL`
- run `pnpm --dir prisma run generate`
- run `pnpm --dir prisma run migrate:deploy`

## 3. Contracts
- add OpenZeppelin and forge-std libs
- run `pnpm --dir packages/contracts run build`
- run `pnpm --dir packages/contracts run test`

## 4. Backend
- type-check relayer and indexer
- wire real env vars
- test Sumsub and sanctions adapters in staging

## 5. Subgraph
- replace placeholder addresses and start blocks
- refresh ABI JSON files
- run codegen and build

## 6. Release gating
- external contract audit
- legal localization
- secrets/KMS/multisig setup
