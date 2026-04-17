import type { Market, Portfolio, PriceSnapshot } from "../types";
import type {
  ListMarketsFilter,
  MarketDataSource,
} from "./market-data-source";

/**
 * Reads HuggyArena markets from a Graph Protocol subgraph.
 *
 * The subgraph schema (see `subgraph/schema.graphql`) exposes
 *   Market, BetPlaced, Resolution, Dispute
 * entities. This source translates those into the product `Market` shape the
 * MCP tools serve.
 *
 * Phase 1A note: the HuggyArena subgraph isn't deployed to a live network yet
 * in this account, so real queries will fail. The source still ships so the
 * agent can be flipped to it with one env var once deployment lands:
 *
 *     HUGGYARENA_AGENT_SOURCE=subgraph
 *     HUGGYARENA_SUBGRAPH_URL=https://api.thegraph.com/subgraphs/name/huggyarena/arena
 *
 * Any network error is translated into an empty result with a console warning
 * — the agent's planner then gracefully tells the user the subgraph is offline
 * instead of crashing the Converse loop.
 */
export class SubgraphMarketDataSource implements MarketDataSource {
  readonly name = "subgraph";
  private readonly endpoint: string;

  constructor(endpoint?: string) {
    this.endpoint =
      endpoint ??
      process.env.HUGGYARENA_SUBGRAPH_URL ??
      "http://localhost:8000/subgraphs/name/huggyarena/arena";
  }

  private async query<T>(gql: string, variables: Record<string, unknown> = {}): Promise<T | null> {
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: gql, variables }),
      });
      if (!res.ok) {
        console.warn(
          `[subgraph] ${res.status} ${res.statusText} @ ${this.endpoint}`,
        );
        return null;
      }
      const json = (await res.json()) as { data?: T; errors?: unknown };
      if (json.errors) {
        console.warn("[subgraph] graphql errors", json.errors);
        return null;
      }
      return json.data ?? null;
    } catch (err) {
      console.warn(`[subgraph] network error @ ${this.endpoint}:`, (err as Error).message);
      return null;
    }
  }

  async listMarkets(filter: ListMarketsFilter = {}): Promise<Market[]> {
    const data = await this.query<{ markets: Array<Record<string, unknown>> }>(
      /* GraphQL */ `
        query ListMarkets($first: Int!) {
          markets(first: $first, orderBy: volumeBase, orderDirection: desc) {
            id
            title
            description
            category
            closesAt
            resolvedAt
            winningOutcome
            status
            volumeBase
            priceYesBps
            priceNoBps
            marketAddress
            chainId
            yesStakeBase
            noStakeBase
          }
        }
      `,
      { first: filter.limit ?? 50 },
    );
    return (data?.markets ?? []).map(mapSubgraphMarket).filter((m) => {
      if (filter.category && m.category !== filter.category) return false;
      if (filter.status && m.status !== filter.status) return false;
      if (filter.query) {
        const hay = `${m.title} ${m.description}`.toLowerCase();
        if (!hay.includes(filter.query.toLowerCase())) return false;
      }
      return true;
    });
  }

  async getMarket(id: string): Promise<Market | null> {
    const data = await this.query<{ market: Record<string, unknown> | null }>(
      /* GraphQL */ `
        query GetMarket($id: ID!) {
          market(id: $id) {
            id
            title
            description
            category
            closesAt
            resolvedAt
            winningOutcome
            status
            volumeBase
            priceYesBps
            priceNoBps
            marketAddress
            chainId
            yesStakeBase
            noStakeBase
          }
        }
      `,
      { id },
    );
    if (!data?.market) return null;
    return mapSubgraphMarket(data.market);
  }

  async priceHistory(marketId: string, windowHours = 168): Promise<PriceSnapshot[]> {
    const sinceUnix = Math.floor(Date.now() / 1000) - windowHours * 3600;
    const data = await this.query<{
      priceSnapshots: Array<{ timestamp: string; priceYesBps: number | string }>;
    }>(
      /* GraphQL */ `
        query PriceHistory($marketId: String!, $since: BigInt!) {
          priceSnapshots(
            where: { market: $marketId, timestamp_gte: $since }
            orderBy: timestamp
            orderDirection: asc
            first: 1000
          ) {
            timestamp
            priceYesBps
          }
        }
      `,
      { marketId, since: sinceUnix.toString() },
    );
    return (data?.priceSnapshots ?? []).map((s) => ({
      timestamp: new Date(Number(s.timestamp) * 1000).toISOString(),
      priceYesBps: Number(s.priceYesBps),
    }));
  }

  async portfolio(userId: string): Promise<Portfolio> {
    // The raw subgraph indexes bets keyed by on-chain address, not product-level
    // userId. Rather than invent a mapping here, we return an empty portfolio
    // so the agent can tell the user "portfolio via subgraph requires a wallet
    // address, not a Cognito user id".
    return {
      userId,
      totalStakedCents: 0,
      totalCurrentValueCents: 0,
      totalPnlCents: 0,
      positions: [],
    };
  }
}

function mapSubgraphMarket(raw: Record<string, unknown>): Market {
  const numberOr = (v: unknown, d: number): number =>
    v === undefined || v === null ? d : Number(v);
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    category: (raw.category as Market["category"]) ?? "other",
    closesAt: raw.closesAt
      ? new Date(Number(raw.closesAt) * 1000).toISOString()
      : new Date().toISOString(),
    resolvedAt: raw.resolvedAt
      ? new Date(Number(raw.resolvedAt) * 1000).toISOString()
      : undefined,
    winningOutcome:
      (raw.winningOutcome as Market["winningOutcome"]) ?? undefined,
    status: (raw.status as Market["status"]) ?? "OPEN",
    volumeCents: Math.round(numberOr(raw.volumeBase, 0) / 10_000), // 6dp -> cents
    priceYesBps: numberOr(raw.priceYesBps, 5000),
    priceNoBps: numberOr(raw.priceNoBps, 5000),
    onChain: {
      marketAddress: raw.marketAddress as string | undefined,
      chainId: raw.chainId ? Number(raw.chainId) : undefined,
      yesStakeBase: raw.yesStakeBase as string | undefined,
      noStakeBase: raw.noStakeBase as string | undefined,
    },
  };
}
