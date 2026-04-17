# triage-daily

Use this skill for the morning-ops sweep: surface anomalies across the full HuggyArena market book in under 60 seconds of reading time.

## Objective

Output a four-section report:

1. **Closing today** — markets whose `closesAt` is in the next 24 hours,
   sorted by volume desc.
2. **Price movers** — markets whose YES price moved ≥ 500 bps in the last 24
   hours. Show delta and direction.
3. **Thin liquidity** — OPEN markets with `volumeCents < 100_000` ($1,000) that
   also close in < 7 days. Candidates for a marketing push or for delisting.
4. **Resolution queue** — markets with `status === "CLOSED"` awaiting
   oracle resolution. Flag anything > 48 hours post-close.

## Method

1. `list_markets({ status: "OPEN", limit: 200 })`.
2. For each candidate in sections 1 and 2, call `price_history(marketId, 24)`
   in parallel (the runner parallelises tool calls in a single turn).
3. `list_markets({ status: "CLOSED", limit: 100 })` for section 4.
4. Tabulate. Markdown table, one row per market. Do NOT dump full JSON.

## Output skeleton

```
## Closing today (3)
| market | volume | YES% |
| --- | ---: | ---: |
| btc-150k-2026-q2 | $24,821 | 38% |
...

## Price movers (2)
| market | 24h Δ | current YES% |
| --- | --- | ---: |

## Thin liquidity (1)
...

## Resolution queue (0)
No markets awaiting resolution.
```

End with one sentence of operator guidance: "Nothing urgent" or "Action required on X".
