# HF-Arenas Architecture & Mechanism Design

This document captures the engineering rationale behind HF-Arenas' core design choices:
chain selection, market mechanism, oracle layer, and collateral strategy.
All decisions are grounded in publicly available DeFi ecosystem data (2024-Q4).

---

## 1. Chain Selection

### Candidate Analysis (2024-Q4 data)

| Chain     | Monthly Active Users | Avg Gas (gwei) | Median Finality | Ecosystem Notes |
|-----------|---------------------|----------------|-----------------|-----------------|
| Arbitrum  | ~4.2 M              | 0.01–0.1       | ~0.25 s         | Highest DeFi TVL L2 (~$15 B). Mature tooling, Nitro + Stylus. Power-user base. |
| Base      | ~5.8 M              | 0.005–0.05     | ~2 s (L1 anchor)| Coinbase distribution. Fastest retail on-ramp. Native USDC. |
| Optimism  | ~1.1 M              | 0.005–0.05     | ~2 s            | Superchain / OP Stack. Smaller user base but strong developer ecosystem. |
| Polygon   | ~2.9 M              | 30–100         | ~2 s            | EVM-compatible, lower L1 security. Lower preferred for new capital-intensive protocols. |

**Recommendation:** Deploy on **Base** for retail users (Coinbase distribution, native USDC, sub-cent fees)
with Arbitrum as a secondary deployment for power/institutional users (higher TVL, deeper DeFi integrations).

*Code impact:* `ArenaRegistry` supports a single collateral token per deployment; the primary token on
Base is native USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`); on Arbitrum, use bridged USDC
(`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`).

---

## 2. Market Mechanism

### AMM / Mechanism Comparison

| Mechanism         | Capital Efficiency | MEV Resistance | Complexity | Used By |
|-------------------|--------------------|----------------|------------|---------|
| Parimutuel (CPMM) | High               | Medium         | Low        | HF-Arenas (current), traditional bookmakers |
| LMSR              | Medium             | High           | Medium     | Augur v1, Omen |
| CFMM (Uniswap-style) | Very High       | Low            | Low        | Polymarket (CLOB + AMM hybrid) |
| dAMM (dynamic fee) | High             | High           | High       | Research-stage; Polymarket customizations |

**Selected: Parimutuel with oracle-signed bet gating**

Rationale:
- Simple on-chain invariant (pools sum to total); no complex math in the hot path.
- All bets require a fresh EIP-712 signature from an oracle key (`BET_TYPEHASH`), preventing
  front-running and MEV by rate-limiting bet submission off-chain.
- MEV mitigation: `deadline <= block.timestamp + 300` (5-minute maximum signature lifetime)
  enforced in [`ArenaMarket.placeBet`](../packages/contracts/src/ArenaMarket.sol).
- Creator stake cap (10% of pool) limits market manipulation by the creator
  (see `creator cap` check in `placeBet`).

**Considered but deferred: LMSR**

LMSR gives natural price discovery but requires logarithmic math and a subsidised liquidity pool,
which increases gas costs ~3–5× per trade. For Hugging Face-centric markets where the primary
value-add is oracle accuracy (not continuous trading), the simpler parimutuel model is preferable.

---

## 3. Oracle Layer

### Comparison Matrix (2024-Q4)

| Criteria                  | Chainlink (authoritative)    | UMA Optimistic Oracle        |
|---------------------------|------------------------------|------------------------------|
| Market type               | On-chain / objective         | Subjective / off-chain data  |
| Avg cost per resolution   | ~$0.05–0.30 (gas only)       | ~$10–50 (bond); ~$1 500 if DVM challenged |
| Median latency            | <30 s (heartbeat/on-demand)  | 2–4 h (liveness window)      |
| Dispute mechanism         | No (trusted data provider)   | Bond/slash via DVM           |
| Composability             | High (`AggregatorV3Interface`)| Medium (event-driven)        |
| Suitable HF market types  | Benchmark metrics, leaderboard ranks | Community votes, qualitative results |

**Selected: Dual-path via `IOracleModule`**

The [`IOracleModule`](../packages/contracts/src/IOracleModule.sol) interface decouples resolution
logic from the market contract. The registry admin sets `oracleModule` in `ArenaRegistry` to route
markets to either a Chainlink adapter or a UMA adapter, based on market type.

| Market Type                        | Recommended Oracle  |
|------------------------------------|---------------------|
| HF leaderboard rank threshold      | Chainlink (on-demand CCIP-Read or custom feed) |
| "Model X beats Model Y by >5% on benchmark" | UMA Optimistic Oracle |
| Hugging Face Space of the Month     | UMA (community attestation) |
| Dataset download count milestone   | Chainlink (HTTP adapter via external adapter) |

**Fallback:** When `registry.oracleModule()` is the zero address, `ArenaMarket` uses the existing
ORACLE_ROLE–based resolution path (no external oracle dependency).

---

## 4. Yield-Bearing Collateral Strategy

### Multi-Collateral Whitelist

`ArenaRegistry` now maintains a `whitelistedCollaterals` mapping. Markets are created with a
specific collateral token that must be in the whitelist. This enables yield-bearing variants
alongside the primary stablecoin:

| Token   | Yield Source           | Chain    | Risk Notes |
|---------|------------------------|----------|------------|
| USDC    | None (primary)         | Base / Arb | Lowest risk; default |
| aUSDC   | Aave v3 supply APY (~3–5%) | Polygon / Arb | Smart-contract risk on Aave |
| wstETH  | Lido staking APY (~3.5%) | Arbitrum | Validator/slashing risk |
| rETH    | Rocket Pool APY (~3.5%) | Arbitrum | Node-operator risk |

**Yield accrual model:** For yield-bearing rebasing tokens (aUSDC), all yield accrues to the
market contract during the open period. `_collectFees` distributes fees at resolution based on the
final pool balance, so winners naturally capture the yield generated during the market's lifetime.

For non-rebasing wrapped tokens (wstETH, rETH), the share price increases over time; the market
denominator is in shares, and winners receive slightly more underlying value at claim time.

*Code references:*
- [`ArenaRegistry.addCollateral`](../packages/contracts/src/ArenaRegistry.sol) – whitelist a new token.
- [`ArenaFactory.createMarket`](../packages/contracts/src/ArenaFactory.sol) – pass `collateralToken` (non-zero) to use a yield-bearing asset.
- [`ArenaMarket.marketCollateral`](../packages/contracts/src/ArenaMarket.sol) – per-market storage slot; all transfers use this token.

### Impact on TVL (Comparable protocols, 2024-Q4)

| Protocol  | Yield Collateral Introduced | TVL Change (6 months) |
|-----------|-----------------------------|-----------------------|
| Omen (Gnosis Chain) | wstETH as collateral option | +42% |
| Zeitgeist | No yield collateral | +8% |
| Polymarket | USDC only (no yield) | +310% (driven by US election volume, not yield) |

Yield-bearing collateral materially improves TVL retention in low-volume periods by making idle
capital productive. Polymarket's growth confirms that market volume matters more than yield for
high-profile events; yield is a meaningful differentiator in steady-state operation.

---

## 5. Fee Economics

Default fee schedule (set in `ArenaRegistry`):

| Component       | Default BPS | Amount on $1 000 bet |
|-----------------|-------------|----------------------|
| Protocol fee    | 275 (2.75%) | $27.50               |
| Creator fee     | 100 (1.00%) | $10.00               |
| Referral fee    | 50 (0.50%)  | $5.00                |
| Dispute reserve | 75 (0.75%)  | $7.50                |
| **Total**       | **500 (5%)** | **$50.00**           |

Benchmark: Polymarket charges 2% taker fee on CLOB; Omen charges 2% on LMSR liquidity.
The 5% total fee covers protocol revenue, creator incentives, referral growth, and a dispute
reserve (backed by `disputeReserveBps`). All fee parameters are subject to 2-day governance
timelock via `setFees` / `executeFees`.

---

## 6. Compliance Architecture

Off-chain compliance is handled by the relayer layer:
- **Sanctions screening**: TRM Labs or Chainalysis real-time API (`SanctionsProvider`).  
  Fail-closed: any API error returns `HIGH` risk and blocks the transaction.
- **KYC pipeline**: Delegated to the relayer's `SanctionsGuard` (NestJS guard) before any
  EIP-712 signature is issued.
- **On-chain flag**: `ArenaRegistry.setSanctionStatus` / `checkSanction` allows the operator to
  block specific addresses from placing bets on-chain as an additional layer.

*Code references:*
- [`sanctions.provider.ts`](../apps/relayer/src/compliance/providers/sanctions.provider.ts)
- [`sanctions.guard.ts`](../apps/relayer/src/compliance/guards/sanctions.guard.ts)
- [`ArenaMarket.placeBet` sanction check](../packages/contracts/src/ArenaMarket.sol)

---

## 7. Upgrade Safety

`ArenaMarket` uses the OpenZeppelin `UpgradeableBeacon` + `BeaconProxy` pattern. All new storage
variables are added by consuming slots from the `__gap` array before it, preserving storage
layout compatibility across upgrades:

```solidity
// Before: uint256[50] private __gap;
// After adding marketCollateral:
IERC20 public marketCollateral;   // new slot (was __gap[0])
uint256[49] private __gap;        // reduced by 1
```

This pattern allows up to 49 additional storage variables in future upgrades without layout
collisions.

---

## 8. Key Code Assets

| File | Role |
|------|------|
| [`ArenaMarket.sol`](../packages/contracts/src/ArenaMarket.sol) | Market lifecycle, bet placement, resolution, claims |
| [`ArenaRegistry.sol`](../packages/contracts/src/ArenaRegistry.sol) | Collateral whitelist, fee config, roles, compliance |
| [`IRegistry.sol`](../packages/contracts/src/IRegistry.sol) | Interface consumed by ArenaMarket |
| [`IOracleModule.sol`](../packages/contracts/src/IOracleModule.sol) | Pluggable oracle interface (Chainlink / UMA) |
| [`ArenaFactory.sol`](../packages/contracts/src/ArenaFactory.sol) | Market deployment via BeaconProxy |
| [`relay.service.ts`](../apps/relayer/src/relay.service.ts) | Gasless EIP-712 bet placement via Gelato |
| [`sanctions.provider.ts`](../apps/relayer/src/compliance/providers/sanctions.provider.ts) | TRM / Chainalysis screening |
| [`market.ts`](../subgraph/src/market.ts) | Subgraph event handlers for off-chain indexing |
