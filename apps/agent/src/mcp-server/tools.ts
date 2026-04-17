import type { MarketDataSource } from "../data";
import type { Market } from "../types";

/**
 * Tool contracts exposed by the `huggyarena-mcp` stdio server.
 *
 * Read-only in Phase 1A — mutating tools (propose_market, resolve_market,
 * place_bet) live behind a human-confirmation gate and ship in Phase 1B.
 *
 * Each entry is (name, description, JSON Schema for inputs, handler).
 * The description is what the LLM sees when deciding whether to call the
 * tool — keep it short, concrete, and behaviour-first.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  source: MarketDataSource;
}

export function buildTools(): ToolDef[] {
  return [
    {
      name: "list_markets",
      description:
        "List HuggyArena prediction markets. Supports filtering by category, status, a case-insensitive search over title+description, and a result limit. Use this as the entry point when the user asks about what markets exist or what's trending.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["politics", "crypto", "sports", "science", "other"],
            description: "Restrict to one category.",
          },
          status: {
            type: "string",
            enum: ["OPEN", "CLOSED", "RESOLVED", "DISPUTED"],
            description: "Restrict to one lifecycle status.",
          },
          query: {
            type: "string",
            description: "Case-insensitive substring match against title + description.",
          },
          limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        },
        additionalProperties: false,
      },
      handler: async (raw, { source }) => {
        const input = (raw ?? {}) as {
          category?: Market["category"];
          status?: Market["status"];
          query?: string;
          limit?: number;
        };
        const markets = await source.listMarkets(input);
        return { count: markets.length, source: source.name, markets };
      },
    },
    {
      name: "get_market",
      description:
        "Fetch full details for a single HuggyArena market by its id (from list_markets). Returns null if the market does not exist.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Market id (e.g. 'btc-150k-2026-q2')." },
        },
        additionalProperties: false,
      },
      handler: async (raw, { source }) => {
        const { id } = (raw ?? {}) as { id?: string };
        if (!id) throw new Error("get_market requires a non-empty 'id'.");
        const market = await source.getMarket(id);
        return { source: source.name, market };
      },
    },
    {
      name: "price_history",
      description:
        "Return YES-price snapshots for a market over a recent window. Bucket granularity depends on the data source; the array is ordered oldest → newest. Use this when the user asks how a market has moved or wants to reason about momentum.",
      inputSchema: {
        type: "object",
        required: ["marketId"],
        properties: {
          marketId: { type: "string" },
          windowHours: {
            type: "integer",
            minimum: 1,
            maximum: 24 * 30,
            default: 168,
            description: "Lookback window in hours. Default = 1 week.",
          },
        },
        additionalProperties: false,
      },
      handler: async (raw, { source }) => {
        const { marketId, windowHours } = (raw ?? {}) as {
          marketId?: string;
          windowHours?: number;
        };
        if (!marketId) throw new Error("price_history requires 'marketId'.");
        const snapshots = await source.priceHistory(marketId, windowHours);
        return {
          source: source.name,
          marketId,
          windowHours: windowHours ?? 168,
          count: snapshots.length,
          snapshots,
        };
      },
    },
    {
      name: "portfolio",
      description:
        "Aggregate a user's positions (open + settled) with realised / unrealised PnL in USD cents. Subgraph source returns empty — portfolios there need a wallet address, not a product user id.",
      inputSchema: {
        type: "object",
        required: ["userId"],
        properties: {
          userId: { type: "string", description: "Cognito user id or wallet address." },
        },
        additionalProperties: false,
      },
      handler: async (raw, { source }) => {
        const { userId } = (raw ?? {}) as { userId?: string };
        if (!userId) throw new Error("portfolio requires 'userId'.");
        return source.portfolio(userId);
      },
    },
    {
      name: "describe_source",
      description:
        "Returns metadata about the currently active data source (mock, subgraph, or appsync). Use this when the user wants to know what backing store the agent is reading.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      handler: async (_raw, { source }) => ({
        source: source.name,
        description:
          source.name === "mock"
            ? "In-process seed JSON. No network. Deterministic demo data."
            : source.name === "subgraph"
              ? "The Graph HTTP endpoint (HUGGYARENA_SUBGRAPH_URL). On-chain truth."
              : "Huggypredict AppSync GraphQL. Product state; currently Todo-backed pre-Phase-1B.",
      }),
    },
  ];
}
