import type { MarketDataSource } from "./market-data-source";
import { MockMarketDataSource } from "./mock-source";
import { SubgraphMarketDataSource } from "./subgraph-source";
import { AppSyncMarketDataSource } from "./appsync-source";

export type { MarketDataSource, ListMarketsFilter } from "./market-data-source";
export { MockMarketDataSource } from "./mock-source";
export { SubgraphMarketDataSource } from "./subgraph-source";
export { AppSyncMarketDataSource } from "./appsync-source";

/**
 * Resolves the active market data source from environment.
 *
 *   HUGGYARENA_AGENT_SOURCE = mock | subgraph | appsync    (default: mock)
 *
 * Callers who want deterministic behaviour (tests, eval harness) can bypass
 * the env and pass their own source directly to the runner.
 */
export function resolveMarketDataSource(
  override?: string | null,
): MarketDataSource {
  const kind = (
    override ??
    process.env.HUGGYARENA_AGENT_SOURCE ??
    "mock"
  ).toLowerCase();
  switch (kind) {
    case "mock":
      return new MockMarketDataSource();
    case "subgraph":
      return new SubgraphMarketDataSource();
    case "appsync":
      return new AppSyncMarketDataSource();
    default:
      throw new Error(
        `Unknown HUGGYARENA_AGENT_SOURCE: ${kind} (expected mock|subgraph|appsync)`,
      );
  }
}
