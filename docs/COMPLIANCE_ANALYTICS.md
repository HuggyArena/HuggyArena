# Compliance & Analytics Prioritisation

This document defines prioritisation between on-chain/off-chain compliance
controls and advanced math/ML analytics for HF-Arenas, with recommended
implementation order.

---

## 1. Prioritisation Decision

**Compliance is the prerequisite; analytics is the accelerator.**

HF-Arenas cannot launch without a defensible compliance posture. Analytics
capabilities increase market quality and user trust but are not launch-blocking.

| Category | Priority | Rationale |
|----------|----------|-----------|
| **On-chain compliance** | **P0 — Launch blocker** | Sanctions, role enforcement, and fund flow controls must be auditable before mainnet |
| **Off-chain compliance** | **P0 — Launch blocker** | KYC/AML and sanctions screening at the relayer layer prevent regulatory exposure |
| **Market analytics** | **P1 — Growth driver** | Statistical monitoring, anomaly detection, and mechanism analysis improve market quality |
| **ML analytics** | **P2 — Competitive edge** | Predictive modelling, sentiment analysis, and automated market scoring are differentiators |

---

## 2. On-chain Compliance (P0)

### 2.1 Current State

| Control | Status | Code Reference |
|---------|--------|----------------|
| `ORACLE_ROLE` gating on resolution | ✅ Implemented | [`ArenaMarket.onlyOracle`](../packages/contracts/src/ArenaMarket.sol) |
| `DEFAULT_ADMIN_ROLE` on registry | ✅ Implemented | [`ArenaRegistry`](../packages/contracts/src/ArenaRegistry.sol) |
| Sanctions mapping (`checkSanction`) | ✅ Implemented | [`ArenaRegistry.checkSanction`](../packages/contracts/src/ArenaRegistry.sol) |
| Fee cap (`MAX_FEE_BPS = 5000`) | ✅ Implemented | [`ArenaRegistry`](../packages/contracts/src/ArenaRegistry.sol) |
| Bet limit enforcement (`minBet` / `maxBet`) | ✅ Implemented | [`ArenaMarket.placeBet`](../packages/contracts/src/ArenaMarket.sol) |
| Timelock on fee changes | ✅ Implemented | [`ArenaRegistry.setFees` / `executeFees`](../packages/contracts/src/ArenaRegistry.sol) |
| Pause/unpause per market | ✅ Implemented | [`ArenaMarket` (Pausable)](../packages/contracts/src/ArenaMarket.sol) |

### 2.2 Recommended Additions

| Control | Priority | Description |
|---------|----------|-------------|
| Multi-sig enforcement | P0 | Require Safe multi-sig for `DEFAULT_ADMIN_ROLE` on mainnet |
| Role event logging | P0 | Emit events for all `grantRole` / `revokeRole` calls (OZ default) |
| Collateral whitelist audit trail | P1 | Emit events on `addCollateral` / `removeCollateral` for compliance review |

---

## 3. Off-chain Compliance (P0)

### 3.1 Current State

| Control | Status | Code Reference |
|---------|--------|----------------|
| Sanctions screening (TRM / Chainalysis) | ✅ Implemented | [`sanctions.provider.ts`](../apps/relayer/src/compliance/providers/sanctions.provider.ts) |
| Fail-closed guard | ✅ Implemented | [`sanctions.guard.ts`](../apps/relayer/src/compliance/guards/sanctions.guard.ts) |
| Sumsub KYC webhook | ✅ Scaffolded | [`sumsub.controller.ts`](../apps/relayer/src/compliance/webhooks/sumsub.controller.ts) |
| Sumsub identity provider | ✅ Scaffolded | [`sumsub.provider.ts`](../apps/relayer/src/compliance/providers/sumsub.provider.ts) |
| Env-var validation at startup | ✅ Implemented | [`main.ts`](../apps/relayer/src/main.ts) |

### 3.2 Recommended Additions

| Control | Priority | Description |
|---------|----------|-------------|
| KYC tier enforcement | P0 | Gate bet size by KYC tier (unverified → basic → enhanced) |
| Geo-fence middleware | P0 | IP + wallet jurisdiction check before relayer processes any request |
| Compliance audit log | P1 | Persistent log of all screening decisions (pass/fail/error) to Postgres |
| Webhook signature rotation | P1 | Sumsub webhook HMAC key rotation strategy without downtime |

---

## 4. Market Analytics (P1)

Statistical methods for monitoring market quality and detecting anomalies.

### 4.1 Recommended Analytics

| Analytic | Method | Purpose | Data Source |
|----------|--------|---------|-------------|
| **Bet distribution skew** | Kolmogorov–Smirnov test | Detect abnormal clustering on one outcome | Indexed bet events |
| **Volume anomaly detection** | Z-score / IQR on rolling 1h windows | Flag sudden volume spikes (wash trading) | Subgraph or indexer |
| **Price impact tracking** | Implied probability delta per bet | Monitor market manipulation attempts | On-chain pool ratios |
| **Creator concentration** | Herfindahl–Hirschman Index (HHI) | Flag markets dominated by the creator's bets | Bet history per market |
| **Resolution latency** | Survival analysis (Kaplan–Meier) | Track oracle resolution reliability | Resolution events |

### 4.2 Implementation Approach

```
Postgres (indexed events)
    ↓
Analytics worker (scheduled cron in indexer)
    ↓
Metrics table (anomaly scores, timestamps)
    ↓
Admin dashboard / alerts (webhook or Slack)
```

No additional infrastructure required; analytics queries run against the existing
Postgres database populated by the indexer.

---

## 5. ML Analytics (P2)

Advanced modelling capabilities for competitive differentiation.

### 5.1 Recommended Models

| Model | Method | Purpose | Input |
|-------|--------|---------|-------|
| **Market outcome forecasting** | Logistic regression / XGBoost | Predict resolution probability from bet distribution | Historical bet data |
| **Anomaly detection** | Isolation Forest | Identify outlier betting patterns (bot, sybil) | Bet timing, amounts, addresses |
| **Sentiment scoring** | BERT / DistilBERT on HF model cards | Score community sentiment towards model outcomes | HF Hub API text data |
| **Market quality scoring** | Composite index (volume, diversity, accuracy) | Rank markets by quality for featured placement | Multi-source aggregation |

### 5.2 Implementation Approach

ML analytics are not embedded in the core protocol. They run as a separate
offline pipeline:

```
Postgres + HF Hub API
    ↓
Python batch jobs (scheduled)
    ↓
Model artefacts (MLflow or HF Hub)
    ↓
Prediction API (FastAPI or serverless)
    ↓
Admin dashboard + market scoring
```

### 5.3 Backtesting

The [`scripts/backtest/`](../scripts/backtest/) directory contains a Python
backtesting framework for hypothesis-driven market mechanism selection. See
[`scripts/backtest/README.md`](../scripts/backtest/README.md) for usage.

---

## 6. Implementation Roadmap

| Phase | Deliverable | Priority | Dependencies |
|-------|-------------|----------|--------------|
| 1 (Pre-launch) | Multi-sig enforcement on mainnet | P0 | Safe deployment |
| 1 (Pre-launch) | Geo-fence middleware in relayer | P0 | IP geolocation service |
| 1 (Pre-launch) | KYC tier enforcement | P0 | Sumsub webhook activation |
| 2 (Post-launch) | Bet distribution analytics | P1 | Indexer + Postgres |
| 2 (Post-launch) | Volume anomaly alerting | P1 | Indexer + alerting service |
| 2 (Post-launch) | Compliance audit log | P1 | Postgres migration |
| 3 (Growth) | ML anomaly detection | P2 | Training data from Phase 2 |
| 3 (Growth) | Sentiment scoring pipeline | P2 | HF Hub API integration |
| 3 (Growth) | Market quality scoring | P2 | Multi-source aggregation |

---

## 7. Code References

| Existing Asset | Relevance |
|----------------|-----------|
| [`ArenaRegistry.sol`](../packages/contracts/src/ArenaRegistry.sol) | On-chain roles, sanctions, fees |
| [`ArenaMarket.sol`](../packages/contracts/src/ArenaMarket.sol) | Bet placement, resolution, claims |
| [`sanctions.provider.ts`](../apps/relayer/src/compliance/providers/sanctions.provider.ts) | Off-chain sanctions screening |
| [`sanctions.guard.ts`](../apps/relayer/src/compliance/guards/sanctions.guard.ts) | Fail-closed guard middleware |
| [`sumsub.provider.ts`](../apps/relayer/src/compliance/providers/sumsub.provider.ts) | KYC identity verification |
| [`sumsub.controller.ts`](../apps/relayer/src/compliance/webhooks/sumsub.controller.ts) | KYC webhook handler |
| [`sync.service.ts`](../apps/indexer/src/sync.service.ts) | Event indexer (analytics data source) |
| [`scripts/backtest/`](../scripts/backtest/) | Mechanism backtesting framework |
