import test from "node:test";
import assert from "node:assert/strict";
import { buildTools } from "../mcp-server/tools";
import { MockMarketDataSource } from "../data/mock-source";

/**
 * Exercises the huggyarena-mcp tool handlers directly (no MCP wire).
 * Proves:
 *   • all advertised tools are dispatchable
 *   • inputs validate (missing required fields throw, enums filter)
 *   • outputs are shaped the way the Bedrock Converse loop expects
 */

const source = new MockMarketDataSource();
const tools = buildTools();
const byName = new Map(tools.map((t) => [t.name, t]));

test("tool catalogue advertises the Phase 1A read tools", () => {
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "describe_source",
    "get_market",
    "list_markets",
    "portfolio",
    "price_history",
  ]);
});

test("list_markets returns the full seed set by default", async () => {
  const t = byName.get("list_markets")!;
  const out = (await t.handler({}, { source })) as {
    count: number;
    markets: Array<{ id: string }>;
  };
  assert.ok(out.count >= 8, "seed JSON should ship ≥ 8 markets");
  assert.ok(out.markets.every((m) => typeof m.id === "string"));
});

test("list_markets filters by category", async () => {
  const t = byName.get("list_markets")!;
  const out = (await t.handler({ category: "crypto" }, { source })) as {
    markets: Array<{ category: string }>;
  };
  assert.ok(out.markets.length >= 1);
  assert.ok(out.markets.every((m) => m.category === "crypto"));
});

test("list_markets case-insensitive query matches title and description", async () => {
  const t = byName.get("list_markets")!;
  const out = (await t.handler(
    { query: "bitCOIN" },
    { source },
  )) as { markets: Array<{ title: string }> };
  assert.ok(out.markets.length >= 1);
  assert.ok(
    out.markets.some((m) => m.title.toLowerCase().includes("bitcoin")),
    "at least one match must mention bitcoin",
  );
});

test("get_market requires an id and returns null for unknown", async () => {
  const t = byName.get("get_market")!;
  await assert.rejects(() => t.handler({}, { source }), /requires/i);
  const unknown = (await t.handler({ id: "does-not-exist" }, { source })) as {
    market: unknown;
  };
  assert.equal(unknown.market, null);
});

test("get_market returns a well-formed market", async () => {
  const t = byName.get("get_market")!;
  const out = (await t.handler(
    { id: "btc-150k-2026-q2" },
    { source },
  )) as { market: { id: string; priceYesBps: number; priceNoBps: number } };
  assert.equal(out.market.id, "btc-150k-2026-q2");
  assert.equal(
    out.market.priceYesBps + out.market.priceNoBps,
    10000,
    "YES + NO prices must sum to 100%",
  );
});

test("price_history returns deterministic snapshots ending at current price", async () => {
  const t = byName.get("price_history")!;
  const out = (await t.handler(
    { marketId: "btc-150k-2026-q2", windowHours: 24 },
    { source },
  )) as {
    snapshots: Array<{ timestamp: string; priceYesBps: number }>;
  };
  assert.ok(out.snapshots.length >= 12);
  // Deterministic: calling again returns the same final price.
  const again = (await t.handler(
    { marketId: "btc-150k-2026-q2", windowHours: 24 },
    { source },
  )) as { snapshots: Array<{ priceYesBps: number }> };
  const lastA = out.snapshots[out.snapshots.length - 1].priceYesBps;
  const lastB = again.snapshots[again.snapshots.length - 1].priceYesBps;
  assert.equal(lastA, lastB);
  assert.equal(lastA, 3800, "last snapshot should match current market price");
});

test("portfolio returns deterministic demo positions for the mock source", async () => {
  const t = byName.get("portfolio")!;
  const a = (await t.handler({ userId: "alice" }, { source })) as {
    userId: string;
    positions: unknown[];
  };
  const b = (await t.handler({ userId: "alice" }, { source })) as {
    positions: unknown[];
  };
  assert.equal(a.userId, "alice");
  assert.ok(a.positions.length >= 1);
  assert.deepEqual(a.positions, b.positions, "portfolio must be deterministic");
});

test("describe_source reports the active backend", async () => {
  const t = byName.get("describe_source")!;
  const out = (await t.handler({}, { source })) as {
    source: string;
    description: string;
  };
  assert.equal(out.source, "mock");
  assert.match(out.description, /seed/i);
});
