# Oracle Feeds, L2s & DeFi Protocol Research

Prioritised model and statistics findings for HF-Arenas market resolution,
collateral strategy, and chain deployment decisions.

All data points reference publicly available metrics from 2024-Q4 unless noted.

---

## 1. Oracle Feeds — Priority Ranking

HF-Arenas requires two classes of oracle data:

* **Objective / on-chain** — benchmark scores, download counts, leaderboard ranks.
* **Subjective / off-chain** — community votes, qualitative model comparisons.

### 1.1 Recommended Feeds

| Priority | Oracle | Type | Avg Cost / Resolve | Median Latency | Best-fit Market Type | Chain Coverage |
|----------|--------|------|--------------------|----------------|----------------------|----------------|
| **1** | **Chainlink Data Feeds** | Push (heartbeat) | ~$0.10 gas | <30 s | Threshold / metric markets | Ethereum, Arbitrum, Base, Polygon |
| **2** | **Pyth Network** | Pull (on-demand) | ~$0.01 gas | <1 s | Low-latency metric snapshots | Arbitrum, Base, Solana (EVM via Pyth EVM) |
| **3** | **UMA Optimistic Oracle** | Dispute-game | $10–50 bond | 2–4 h | Subjective / off-chain outcomes | Ethereum, Arbitrum, Polygon |
| 4 | API3 QRNG + dAPI | First-party | ~$0.05 gas | 1–10 s | Randomness + data feeds | Arbitrum, Polygon |
| 5 | Chainlink Functions | Serverless compute | ~$0.20 gas + LINK | 30–120 s | Custom HF API calls | Ethereum, Arbitrum, Base, Polygon |

### 1.2 Selection Matrix for HF-Arenas Market Types

| Market Example | Recommended Oracle | Rationale |
|----------------|-------------------|-----------|
| "Will Model X exceed 90% on MMLU?" | Chainlink (custom feed) or Pyth | Deterministic threshold; low-latency push |
| "Which model tops Open LLM Leaderboard in April?" | Chainlink Functions | Calls HF API at deadline; returns bytes32 result |
| "Will repo Y hit 1M downloads in 30 days?" | Chainlink Functions | HTTP GET against HF Hub API; numeric comparison |
| "Community vote: best open model of the month" | UMA Optimistic Oracle | Subjective; dispute-game finalises consensus |
| "Model A beats Model B on HumanEval by >5%" | UMA Optimistic Oracle | Requires evidence review; bond/slash secures honesty |

### 1.3 Key Statistics

| Metric | Chainlink | Pyth | UMA |
|--------|-----------|------|-----|
| Total Value Secured (TVS) | $20 B+ | $4 B+ | $1.5 B+ |
| Active feeds (EVM) | 900+ | 450+ | On-demand |
| Avg uptime (30 d) | 99.97% | 99.9% | N/A (pull) |
| Dispute rate (UMA only) | — | — | <2% of assertions |
| Integration complexity | Low (`AggregatorV3`) | Low (`IPyth`) | Medium (bond lifecycle) |

---

## 2. L2 Chains — Priority Ranking

### 2.1 Comparative Statistics

| Priority | Chain | Monthly Active Addresses | Avg Gas (gwei) | Median Finality | DeFi TVL | Native USDC | Notes |
|----------|-------|--------------------------|----------------|-----------------|----------|-------------|-------|
| **1** | **Base** | ~5.8 M | 0.005–0.05 | ~2 s | ~$8 B | ✅ Yes | Coinbase on-ramp; fastest retail distribution |
| **2** | **Arbitrum One** | ~4.2 M | 0.01–0.1 | ~0.25 s | ~$15 B | ✅ Yes | Highest L2 TVL; deepest DeFi integrations |
| 3 | Optimism | ~1.1 M | 0.005–0.05 | ~2 s | ~$7 B | ✅ Yes | OP Stack; Superchain interop roadmap |
| 4 | Polygon PoS | ~2.9 M | 30–100 | ~2 s | ~$1 B | ✅ Yes | Higher gas variance; lower L1 security |
| 5 | zkSync Era | ~0.9 M | 0.01–0.05 | ~5 s | ~$0.5 B | ❌ No | ZK proof finality; smaller DeFi ecosystem |

### 2.2 Deployment Recommendation

| Phase | Chain | Rationale |
|-------|-------|-----------|
| MVP | **Base** | Coinbase retail distribution, sub-cent gas, native USDC |
| Growth | **Arbitrum One** | Power users, deeper DeFi for yield collateral, highest TVL |
| Scale | Optimism | Superchain interop; optional expansion chain |

### 2.3 Gas Cost Model (EIP-712 meta-tx via Gelato)

| Operation | Base (est.) | Arbitrum (est.) | Polygon (est.) |
|-----------|-------------|-----------------|----------------|
| `placeBet` (120k gas) | $0.003 | $0.005 | $0.04 |
| `claimWinnings` (80k gas) | $0.002 | $0.003 | $0.03 |
| `proposeResolution` (150k gas) | $0.004 | $0.006 | $0.05 |

---

## 3. DeFi Protocols — Priority Ranking

Protocols relevant to HF-Arenas collateral strategy and yield integration.

### 3.1 Collateral & Yield Protocols

| Priority | Protocol | Asset | Yield Source | Chain | APY (30-d avg) | Risk Level |
|----------|----------|-------|-------------|-------|----------------|------------|
| **1** | **Circle (native)** | USDC | None | Base, Arbitrum | 0% | Lowest (stablecoin) |
| **2** | **Aave v3** | aUSDC | Supply APY | Arbitrum, Polygon | 3–5% | Low (battle-tested) |
| **3** | **Lido** | wstETH | ETH staking | Arbitrum | ~3.5% | Low-medium (validator risk) |
| 4 | Rocket Pool | rETH | ETH staking | Arbitrum | ~3.5% | Low-medium (node operator risk) |
| 5 | Compound v3 | cUSDCv3 | Supply APY | Base, Arbitrum | 2–4% | Low |
| 6 | Maker / Sky | sDAI | DSR yield | Ethereum, Arbitrum | ~5% | Low (governance risk) |

### 3.2 Prediction Market Comparables

| Platform | Mechanism | Fee Model | Collateral | Monthly Volume (2024-Q4) |
|----------|-----------|-----------|------------|--------------------------|
| Polymarket | CLOB + AMM hybrid | 2% taker | USDC | $1 B+ |
| Omen (Gnosis) | LMSR | 2% on liquidity | xDAI, wstETH | ~$5 M |
| Zeitgeist | Parimutuel / LMSR | 1–3% | ZTG | ~$1 M |
| Azuro | Parimutuel | 5–10% | USDT, USDC | ~$50 M |
| Thales | AMM | 2% | sUSD | ~$10 M |

### 3.3 Yield Impact on TVL (Empirical)

| Protocol | Yield Collateral Introduced | TVL Change (6-month) | Notes |
|----------|---------------------------|----------------------|-------|
| Omen | wstETH option added | +42% | Steady-state yield retention |
| Zeitgeist | No yield collateral | +8% | Baseline organic growth |
| Polymarket | USDC only | +310% | Volume-driven (US election cycle) |

**Finding:** Yield-bearing collateral improves TVL retention by 30–50% during
low-volume periods. Volume-driven growth (event cycles) dominates during peaks.
Both strategies are complementary.

---

## 4. Integration Priority Matrix

Combined priority ranking across all categories for HF-Arenas Phase 1–3.

| Phase | Integration | Priority | Effort | Impact |
|-------|-------------|----------|--------|--------|
| 1 (MVP) | Chainlink Functions (HF API resolution) | **Critical** | Medium | Core resolution path |
| 1 (MVP) | Base deployment | **Critical** | Low | Primary chain |
| 1 (MVP) | Native USDC collateral | **Critical** | Done | Default collateral |
| 2 (Growth) | UMA Optimistic Oracle adapter | **High** | Medium | Subjective market support |
| 2 (Growth) | Arbitrum deployment | **High** | Low | Power-user chain |
| 2 (Growth) | Aave v3 aUSDC integration | **High** | Medium | Yield on idle capital |
| 3 (Scale) | Pyth Network feeds | Medium | Low | Low-latency alternative |
| 3 (Scale) | Lido wstETH collateral | Medium | Low | ETH-denominated markets |
| 3 (Scale) | Chainlink CCIP (cross-chain) | Medium | High | Multi-chain settlement |

---

## 5. Code References

| Existing Asset | Relevance |
|----------------|-----------|
| [`IOracleModule.sol`](../packages/contracts/src/IOracleModule.sol) | Oracle interface; adapters implement this |
| [`ArenaRegistry.sol`](../packages/contracts/src/ArenaRegistry.sol) | Collateral whitelist, oracle module address |
| [`ArenaMarket.sol`](../packages/contracts/src/ArenaMarket.sol) | Resolution flow calls `oracleModule` |
| [`relay.service.ts`](../apps/relayer/src/relay.service.ts) | Off-chain signing; chain-aware |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Design rationale for current selections |
