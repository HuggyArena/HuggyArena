# HF-Arenas — Investor Brief

**THE ARENA // HF TOP**  
Polymarket-class prediction markets for Hugging Face AI outcomes.

**Contact:** [cyberblicc@icloud.com](mailto:cyberblicc@icloud.com)  
**Stage:** Pre-seed / Raising now  
**Geography:** North America MVP → Global  
**Chains:** Polygon · Base · Ethereum (multi-chain)

---

## Executive Summary

HF-Arenas is a **regulated, crypto-native prediction market platform** purpose-built for the AI ecosystem. Participants create and trade markets on verifiable outcomes drawn directly from the Hugging Face platform: model benchmark rankings, repository download velocity, leaderboard victories, and dataset adoption metrics.

Where Polymarket covers world events, **HF-Arenas covers the outcomes that matter most to the AI-native community** — pricing the future of models, architectures, and builders in real time.

The platform is live at the engineering level: contracts are written and tested, a gasless relayer is operational, compliance infrastructure (US sweepstakes + Sumsub KYC) is scaffolded, and the full monorepo is ready for audit and launch. **We are raising to fund the audit, legal sign-off, and go-to-market execution.**

---

## The Problem

The AI community has no efficient price discovery mechanism for model outcomes. Benchmark results arrive with no predictive signal, leaderboard races produce no financial stake, and the billions of dollars flowing through AI research generate no liquid market for outcome forecasting.

Meanwhile:
- Polymarket has proven that crypto-native prediction markets work at scale ($1B+ in monthly volume)
- The Hugging Face community has 500,000+ models, 200,000+ datasets, and millions of active practitioners
- Outcome data on Hugging Face is **publicly available, machine-readable, and dispute-free** — the ideal oracle substrate

**The gap is enormous. Nobody has built this.**

---

## The Solution

HF-Arenas turns every benchmark race, leaderboard competition, and repository metric into a **liquid, verifiable prediction market**.

**Example markets:**
- "Will Llama-4 outperform GPT-5 on MMLU by Q3 2026?" → YES / NO
- "Will this model exceed 1M downloads in 30 days?" → YES / NO
- "Which team will top the Open LLM Leaderboard in April 2026?" → multi-outcome
- "Will this open-source model beat its closed competitor on HumanEval?" → YES / NO

Every market resolves against **deterministic, publicly verifiable data** from Hugging Face. No subjective oracles. No dispute theater. The outcome is the data.

---

## Market Opportunity

| Segment | Size / Signal |
|---------|---------------|
| Global prediction market volume | $1B+ monthly (Polymarket alone, 2024) |
| Hugging Face registered users | 1M+ |
| Hugging Face monthly active community | Millions of researchers, builders, practitioners |
| AI developer tools market | $28B+ by 2026 (Grand View Research) |
| Crypto prediction market TAM | Projected $10B+ by 2027 (decentralized segment) |

**HF-Arenas targets the intersection of two high-growth verticals**: crypto-native prediction markets and the AI practitioner ecosystem. Both are growing rapidly, and no platform has captured their overlap.

---

## Compliance Posture

Regulatory clarity is our **moat**, not our risk.

### United States — Sweepstakes Model
HF-Arenas operates under the proven US sweepstakes compliance framework:
- **No purchase necessary** — alternative free entry method available to all US participants
- Modeled after established sweepstakes operators (PrizePicks, Underdog, DraftKings Pickems)
- Sweepstakes attorney review is part of the pre-launch gate
- Users play with sweepstakes coins redeemable for cryptocurrency prizes

### International — Sumsub KYC/AML
For non-US jurisdictions where prediction markets or crypto wagering are permitted:
- Full KYC onboarding via [Sumsub](https://sumsub.com), the industry-standard identity verification provider
- Webhook-driven applicant lifecycle management (pending → approved → rejected)
- OFAC and international sanctions screening on every wallet address
- Fail-closed model: any screening error defaults to **deny** — no accidental bypasses

### On-chain Compliance
- OFAC/sanctions guard on every relayer transaction (TRM Labs / Chainalysis compatible)
- Geoblocking enforced at API and contract level
- Auditable resolution logs for every market outcome
- OpenZeppelin AccessControl with role separation (ORACLE_ROLE, OPERATOR_ROLE, ADMIN)
- Safe multisig required for admin operations on mainnet

**The compliance infrastructure is built. We are not retrofitting regulation — we launched with it.**

---

## Product Architecture

### Smart Contracts (Solidity 0.8.26)
- `ArenaRegistry` — fee configuration, access control, sanctions integration, bet limits
- `ArenaMarket` — market lifecycle (open → locked → resolved → disputed), position management, fee distribution, dispute bond mechanics
- Upgradeable via OpenZeppelin transparent proxy
- Full Foundry test suite with fuzz coverage
- `MAX_FEE_BPS = 5000` hard cap prevents fee extraction abuse

### Gasless Relayer (NestJS)
- EIP-712 signed meta-transactions — users never pay gas
- Gelato Network integration for sponsored execution
- Rate limiting, anti-abuse middleware, and allowance/permit validation
- Compliance middleware stack: sanctions guard → KYC check → execution

### Indexer & Subgraph
- NestJS event indexer for real-time off-chain state sync
- The Graph subgraph for decentralized data access
- Canonical block cursors for full bet/claim reconciliation

### Database
- Prisma ORM with Postgres
- Shared schema across relayer and indexer (`packages/shared-prisma`)
- Migrations-first approach for production safety

---

## Fee Economics

The protocol earns on every market interaction. At scale, this is a **high-margin, recurring revenue engine**.

| Fee | Rate | Recipient |
|-----|------|-----------|
| Protocol fee | 2.75% | Treasury |
| Creator fee | 1.00% | Market creator |
| Referral fee | 0.50% | Referrer |
| Dispute reserve | 0.75% | Dispute pool (claimable on resolution) |
| **Total take rate** | **5.00%** | — |

**Unit economics example:**
- $10M monthly prediction volume → $275K monthly protocol revenue
- $100M monthly prediction volume → $2.75M monthly protocol revenue

Creator and referral fees are **protocol-level incentives that drive market creation and user acquisition** — the platform grows faster the more it pays creators.

---

## Builder & Creator Incentive Engine

This is HF-Arenas' structural moat against generic prediction market competitors.

### For AI Builders (Supply Side)
- **Sponsored prize pools** — sweepstakes rewards for builders whose models win tracked markets
- **Market creation rewards** — anyone can create a market and earn 1% of all volume in it
- **Season leaderboards** — recurring tournament cycles with pooled prizes, driving sustained engagement
- **Performance multipliers** — builders with consistent winning models earn bonus pool allocations

### For Traders & Forecasters (Demand Side)
- **Gasless participation** — no ETH needed, no friction, no gas anxiety
- **USDC-denominated** — stable-value pools eliminate crypto volatility from the betting experience
- **Information advantage** — practitioners with deep model knowledge have genuine edge
- **Referral rewards** — 0.5% protocol-level fee for bringing in new participants

### Flywheel
```
Builder competition → market creation → trading liquidity
       ↑                                        ↓
  More builders  ←  public visibility  ←  resolution events
```

The more builders compete on Hugging Face, the more markets are created. The more markets exist, the more traders participate. The more traders participate, the more valuable it is to be a builder on the platform.

---

## Competitive Landscape

| Platform | Markets | Compliance | AI-native | Builder incentives |
|----------|---------|------------|-----------|-------------------|
| **HF-Arenas** | AI / HF outcomes | ✅ Sweeps + Sumsub | ✅ Yes | ✅ Yes |
| Polymarket | World events | ⚠️ Geo-restricted | ❌ No | ❌ No |
| Manifold | General | ❌ Play money | ❌ No | ❌ No |
| Metaculus | General | ❌ No money | ❌ No | ❌ No |
| Augur / Gnosis | General | ❌ Unregulated | ❌ No | ❌ No |

**No platform combines AI-native outcomes, regulated compliance, and builder incentives.** This is a category creation opportunity.

---

## Go-to-Market Strategy

### Phase 1 — North America MVP (sweepstakes)
- Launch with sweepstakes model to capture US market legally
- Seed markets around high-visibility AI events (major benchmark releases, model launches)
- Partner with AI newsletter operators and YouTube educators for referral growth
- Sponsor prize pools around major HF competitions and Open LLM Leaderboard cycles

### Phase 2 — International Expansion
- Activate Sumsub KYC onboarding for permitted international jurisdictions
- Target AI-heavy communities in EU, Canada, Singapore, UAE
- Multi-language support and regional market creation incentives

### Phase 3 — Tournament Mode
- Seasonal competitions with pooled prizes and leaderboard rankings
- Creator leagues: builders earn status and rewards based on market quality and volume
- Institutional market creation: AI labs sponsor markets around their own model releases

### Phase 4 — Multi-chain
- Deploy on Polygon PoS for low-cost volume
- Base for Coinbase user acquisition
- Ethereum mainnet for institutional and high-value markets

---

## Execution Milestones

| Milestone | Status |
|-----------|--------|
| Monorepo architecture + contracts written | ✅ Complete |
| Gasless relayer + compliance middleware | ✅ Complete |
| Sumsub KYC integration | ✅ Scaffolded |
| Sanctions screening (fail-closed) | ✅ Implemented |
| Subgraph indexing pipeline | ✅ Complete |
| CI/CD pipeline (GitHub Actions) | ✅ Running |
| External smart contract audit | 🔄 Scoping |
| Sweepstakes attorney legal review | 🔄 In progress |
| North America MVP launch | 🔜 Post-audit |
| International KYC activation | 🔜 Phase 2 |
| Tournament mode | 🔜 Phase 3 |
| Multi-chain deployment | 🔜 Phase 4 |

---

## Use of Funds

| Allocation | Purpose |
|------------|---------|
| Smart contract audit | Industry-standard security audit (Trail of Bits / Spearbit class) |
| Legal & compliance | Sweepstakes attorney, jurisdiction matrix, terms and policies |
| Engineering | Core team expansion, audit remediation, feature buildout |
| Market seeding | Initial liquidity and prize pool funding for launch markets |
| Go-to-market | Community partnerships, creator acquisition, referral program launch |

---

## Why Now

1. **Polymarket has proven the market**: $1B+ monthly volume demonstrates real demand for crypto prediction markets
2. **AI benchmark racing is at peak intensity**: GPT-5, Llama-4, Gemini Ultra — leaderboard outcomes are front-page news
3. **Regulatory clarity is improving**: Sweepstakes and skill-based contest frameworks are established paths
4. **Hugging Face is the platform**: 1M+ models, community-native discoverability, and open data make it the ideal oracle layer
5. **Infrastructure costs are minimal**: Multi-chain L2s (Polygon, Base) make gasless participation economically viable at any volume

---

## Team & Vision

**Montana Magerus** — Founder  
Vision: Build the intelligence layer for the AI ecosystem — where prediction markets surface collective knowledge about which models, architectures, and builders will define the next generation of AI.

**We are actively recruiting:**
- Protocol engineers (Solidity / EVM)
- Full-stack engineers (TypeScript / Next.js)
- Compliance and legal advisors
- Growth and community leads
- AI community evangelists

---

## Investment Thesis (Summary)

> HF-Arenas sits at the intersection of two rapidly growing markets — AI development tooling and crypto prediction markets — with a unique, defensible position: the only regulated platform purpose-built for AI outcome prediction, with native incentives for the Hugging Face builder community.
>
> The compliance infrastructure is built. The technical foundation is production-ready. The market opportunity is uncontested. We are raising to execute.

---

## Contact

**Montana Magerus**  
[cyberblicc@icloud.com](mailto:cyberblicc@icloud.com)  
GitHub: [cyberblicc-sketch/HF-arenas](https://github.com/cyberblicc-sketch/HF-arenas)

_This document is for informational purposes only and does not constitute an offer or solicitation to sell securities. Past performance of comparable platforms does not guarantee future results. All forward-looking statements involve risk and uncertainty._
