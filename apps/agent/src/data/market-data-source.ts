import type { Market, Portfolio, PriceSnapshot } from "../types";

/**
 * Read-only data source for HuggyArena market state.
 *
 * Three implementations ship with Phase 1A:
 *   • {@link MockMarketDataSource}      — bundled seed JSON (zero-config demo)
 *   • {@link SubgraphMarketDataSource}  — The Graph HTTP endpoint (on-chain truth)
 *   • {@link AppSyncMarketDataSource}   — Huggypredict AppSync GraphQL (product state)
 *
 * The selector in {@link ./index.ts} picks one based on `HUGGYARENA_AGENT_SOURCE`,
 * so the MCP server tools don't need to know which backend they're reading.
 *
 * All methods are idempotent and safe to call from parallel Converse turns.
 * No write methods here — mutating tools belong in Phase 1B and go through
 * the relayer with explicit human-confirmation gating.
 */
export interface MarketDataSource {
  readonly name: string;

  listMarkets(filter?: ListMarketsFilter): Promise<Market[]>;

  getMarket(id: string): Promise<Market | null>;

  /**
   * Returns price snapshots for a market, newest last. Bucket granularity
   * depends on the source — callers should not assume uniform spacing.
   */
  priceHistory(marketId: string, windowHours?: number): Promise<PriceSnapshot[]>;

  /**
   * Returns an aggregated portfolio view for a user. For sources that don't
   * track per-user positions (e.g. the raw subgraph), this returns an empty
   * portfolio rather than throwing — the agent can then surface the limitation.
   */
  portfolio(userId: string): Promise<Portfolio>;
}

export interface ListMarketsFilter {
  category?: Market["category"];
  status?: Market["status"];
  /** Substring match against title + description (case-insensitive). */
  query?: string;
  limit?: number;
}
