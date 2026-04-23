import type { Market, Portfolio, PriceSnapshot } from "../types";
import type {
  ListMarketsFilter,
  MarketDataSource,
} from "./market-data-source";

/**
 * Reads HuggyArena markets from the Huggypredict AppSync GraphQL API.
 *
 * This source is wired up but gated behind two env vars — both must be set
 * for it to be selectable:
 *
 *     HUGGYARENA_APPSYNC_URL   (from amplify_outputs.json "data.url")
 *     HUGGYARENA_APPSYNC_KEY   (from amplify_outputs.json "data.api_key")
 *
 * Phase 1A uses the Todo model as a placeholder; once the Phase 1B schema
 * expansion lands (Market / Bet / PriceSnapshot in Huggypredict's
 * `amplify/data/resource.ts`), the GraphQL documents below become live
 * without further agent changes.
 */
export class AppSyncMarketDataSource implements MarketDataSource {
  readonly name = "appsync";
  private readonly url: string;
  private readonly apiKey: string;

  constructor(url?: string, apiKey?: string) {
    this.url = url ?? process.env.HUGGYARENA_APPSYNC_URL ?? "";
    this.apiKey = apiKey ?? process.env.HUGGYARENA_APPSYNC_KEY ?? "";
    if (!this.url || !this.apiKey) {
      throw new Error(
        "AppSyncMarketDataSource requires HUGGYARENA_APPSYNC_URL and HUGGYARENA_APPSYNC_KEY",
      );
    }
  }

  private async query<T>(
    gql: string,
    variables: Record<string, unknown> = {},
  ): Promise<T | null> {
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({ query: gql, variables }),
      });
      if (!res.ok) {
        console.warn(`[appsync] ${res.status} ${res.statusText}`);
        return null;
      }
      const json = (await res.json()) as { data?: T; errors?: unknown };
      if (json.errors) {
        console.warn("[appsync] graphql errors", json.errors);
        return null;
      }
      return json.data ?? null;
    } catch (err) {
      console.warn("[appsync] network error:", (err as Error).message);
      return null;
    }
  }

  async listMarkets(filter: ListMarketsFilter = {}): Promise<Market[]> {
    // Pre-Phase-1B: the schema only has a Todo model. We surface any Todo
    // rows as "draft" markets so the agent has something to chew on end-to-
    // end today, and the tool contract is stable for when Market lands.
    const data = await this.query<{
      listTodos: { items: Array<{ id: string; content: string | null; createdAt: string }> };
    }>(
      /* GraphQL */ `
        query ListTodos {
          listTodos(limit: 100) {
            items {
              id
              content
              createdAt
            }
          }
        }
      `,
    );
    const items = data?.listTodos.items ?? [];
    const markets: Market[] = items
      .filter((t) => (t.content ?? "").trim().length > 0)
      .map((t) => ({
        id: t.id,
        title: t.content ?? "(untitled)",
        description:
          "Draft market sourced from Huggypredict Todo placeholder. Schema expansion coming in Phase 1B.",
        category: "other" as const,
        closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        status: "OPEN" as const,
        volumeCents: 0,
        priceYesBps: 5000,
        priceNoBps: 5000,
      }))
      .filter((m) => {
        if (filter.category && m.category !== filter.category) return false;
        if (filter.status && m.status !== filter.status) return false;
        if (filter.query) {
          const hay = `${m.title} ${m.description}`.toLowerCase();
          if (!hay.includes(filter.query.toLowerCase())) return false;
        }
        return true;
      });
    return markets.slice(0, filter.limit ?? 50);
  }

  async getMarket(id: string): Promise<Market | null> {
    const all = await this.listMarkets({ limit: 500 });
    return all.find((m) => m.id === id) ?? null;
  }

  async priceHistory(): Promise<PriceSnapshot[]> {
    // Phase 1B: back this with a PriceSnapshot model populated by a Lambda
    // post-placeBet. Returning empty keeps the agent honest about current
    // capabilities rather than synthesizing fake data.
    return [];
  }

  async portfolio(userId: string): Promise<Portfolio> {
    return {
      userId,
      totalStakedCents: 0,
      totalCurrentValueCents: 0,
      totalPnlCents: 0,
      positions: [],
    };
  }
}
