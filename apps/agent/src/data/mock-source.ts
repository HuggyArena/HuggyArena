import fs from "node:fs";
import path from "node:path";
import type {
  Market,
  Portfolio,
  PortfolioPosition,
  PriceSnapshot,
} from "../types";
import type {
  ListMarketsFilter,
  MarketDataSource,
} from "./market-data-source";

/**
 * Reads markets from a bundled JSON file. Used for demos, offline dev, and
 * deterministic tests. Prices are static per session — no AMM math in mock.
 *
 * The seed file is `apps/agent/data/markets.seed.json` by default. An env
 * override `HUGGYARENA_AGENT_MOCK_SEED` lets tests point at a fixture.
 */
export class MockMarketDataSource implements MarketDataSource {
  readonly name = "mock";
  private readonly markets: Market[];

  constructor(seedPath?: string) {
    const resolved =
      seedPath ??
      process.env.HUGGYARENA_AGENT_MOCK_SEED ??
      path.resolve(__dirname, "..", "..", "data", "markets.seed.json");
    const raw = fs.readFileSync(resolved, "utf8");
    const parsed = JSON.parse(raw) as { markets: Market[] };
    this.markets = parsed.markets;
  }

  async listMarkets(filter: ListMarketsFilter = {}): Promise<Market[]> {
    const q = filter.query?.toLowerCase();
    const filtered = this.markets.filter((m) => {
      if (filter.category && m.category !== filter.category) return false;
      if (filter.status && m.status !== filter.status) return false;
      if (q) {
        const hay = `${m.title} ${m.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const limit = filter.limit ?? 50;
    return filtered.slice(0, limit);
  }

  async getMarket(id: string): Promise<Market | null> {
    return this.markets.find((m) => m.id === id) ?? null;
  }

  async priceHistory(
    marketId: string,
    windowHours = 24 * 7,
  ): Promise<PriceSnapshot[]> {
    const market = this.markets.find((m) => m.id === marketId);
    if (!market) return [];
    // Deterministic synthesized walk — seeded off the market id so repeated
    // calls look plausible without introducing flake into tests.
    const buckets = Math.max(12, Math.min(168, windowHours));
    const seed = hashString(marketId);
    const now = Date.now();
    const stepMs = (windowHours * 3600 * 1000) / buckets;
    const snapshots: PriceSnapshot[] = [];
    let price = clamp(market.priceYesBps - 1500 + (seed % 3000), 100, 9900);
    for (let i = 0; i < buckets; i++) {
      const rand = pseudoRandom(seed, i);
      const delta = Math.round((rand - 0.5) * 400);
      price = clamp(price + delta, 100, 9900);
      snapshots.push({
        timestamp: new Date(now - (buckets - i) * stepMs).toISOString(),
        priceYesBps: price,
      });
    }
    // Nail the last snapshot to the current price so the chart matches state.
    snapshots[snapshots.length - 1] = {
      timestamp: new Date(now).toISOString(),
      priceYesBps: market.priceYesBps,
    };
    return snapshots;
  }

  async portfolio(userId: string): Promise<Portfolio> {
    // Deterministic demo portfolio — the same userId always yields the same
    // positions. Keeps agent transcripts reproducible for eval runs.
    const seed = hashString(`portfolio:${userId}`);
    const pick = seed % this.markets.length;
    const pickAlt = (seed >> 4) % this.markets.length;
    const positions: PortfolioPosition[] = [];
    for (const [idx, mIdx] of [pick, pickAlt].entries()) {
      const m = this.markets[mIdx];
      if (!m) continue;
      const outcome = idx % 2 === 0 ? "YES" : "NO";
      const stakeCents = 5_00 + ((seed >> (idx * 3)) % 95_00);
      const avgPriceBps = clamp(
        (outcome === "YES" ? m.priceYesBps : m.priceNoBps) - 300,
        100,
        9900,
      );
      const markBps = outcome === "YES" ? m.priceYesBps : m.priceNoBps;
      const currentValueCents = Math.round((stakeCents * markBps) / avgPriceBps);
      positions.push({
        marketId: m.id,
        marketTitle: m.title,
        outcome,
        stakeCents,
        avgPriceBps,
        currentValueCents,
        pnlCents: currentValueCents - stakeCents,
        status: "OPEN",
      });
    }
    const totalStakedCents = positions.reduce((s, p) => s + p.stakeCents, 0);
    const totalCurrentValueCents = positions.reduce(
      (s, p) => s + p.currentValueCents,
      0,
    );
    return {
      userId,
      totalStakedCents,
      totalCurrentValueCents,
      totalPnlCents: totalCurrentValueCents - totalStakedCents,
      positions,
    };
  }
}

function hashString(s: string): number {
  // FNV-1a 32-bit; deterministic and dependency-free.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pseudoRandom(seed: number, i: number): number {
  // Mulberry32 with (seed + i) — cheap deterministic PRNG. Uses Math.imul to
  // stay inside 32-bit int range; plain `*` here loses bits above 2^53.
  let t = (seed + Math.imul(i, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  t = t ^ (t >>> 16);
  return ((t >>> 0) % 1_000_000) / 1_000_000;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
