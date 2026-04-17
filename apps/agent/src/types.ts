/**
 * Core domain types for the HuggyArena agent.
 *
 * The agent speaks in two coordinate systems:
 *   (1) on-chain state  — what `ArenaMarket.sol` records
 *   (2) product state   — the market as a user sees it (title, category, closesAt, etc.)
 *
 * {@link Market} is the product view, used by both the MCP server tools
 * and the Bedrock Converse loop. On-chain-only fields live under
 * {@link OnChainState} and are optional — populated when the agent has
 * subgraph / RPC access, omitted in mock mode.
 */

export type Outcome = "YES" | "NO";

export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED";

export interface OnChainState {
  /** `ArenaMarket` contract address, if deployed. */
  marketAddress?: string;
  /** Chain id the market is deployed on. */
  chainId?: number;
  /** Aggregate stake on YES in USDC (6-decimal units). */
  yesStakeBase?: string;
  /** Aggregate stake on NO in USDC (6-decimal units). */
  noStakeBase?: string;
  /** Block number the data was observed at. */
  blockNumber?: number;
}

export interface Market {
  id: string;
  title: string;
  description: string;
  category: "politics" | "crypto" | "sports" | "science" | "other";
  imageUrl?: string;
  /** ISO 8601 close time. */
  closesAt: string;
  /** ISO 8601 resolution time, once settled. */
  resolvedAt?: string;
  winningOutcome?: Outcome;
  status: MarketStatus;
  /** Total volume in USD cents. */
  volumeCents: number;
  /** Current YES price, 0–10000 basis points (1bp = 0.01%). */
  priceYesBps: number;
  /** Current NO price. priceYesBps + priceNoBps always equals 10000. */
  priceNoBps: number;
  /** Optional on-chain state (present when sourced from subgraph / RPC). */
  onChain?: OnChainState;
  tags?: string[];
}

export interface PriceSnapshot {
  /** ISO 8601 timestamp. */
  timestamp: string;
  priceYesBps: number;
}

export interface PortfolioPosition {
  marketId: string;
  marketTitle: string;
  outcome: Outcome;
  /** Realized + unrealized position size in USD cents. */
  stakeCents: number;
  avgPriceBps: number;
  /** Mark-to-market value at current price, USD cents. */
  currentValueCents: number;
  /** Signed PnL in USD cents (current - stake). */
  pnlCents: number;
  status: "OPEN" | "SETTLED_WIN" | "SETTLED_LOSS";
}

export interface Portfolio {
  userId: string;
  totalStakedCents: number;
  totalCurrentValueCents: number;
  totalPnlCents: number;
  positions: PortfolioPosition[];
}
