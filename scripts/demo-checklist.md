# Investor Demo Checklist

## Required before demo
- pnpm install
- pnpm prisma:generate
- pnpm build
- forge test (contracts)
- Start relayer + indexer
- Verify /health and /health/ready

## Demo flow
1. Create market
2. Submit signed tx via relayer
3. Show indexer sync
4. Show API health endpoints
5. Show market resolution
