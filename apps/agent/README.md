# @arena/agent — Clawdius (Phase 1A)

> Bedrock-Claude operator / research agent for HuggyArena prediction markets.
> Ships as both a CLI and a stdio MCP server. Read-only in this phase; write
> tools arrive in Phase 1B behind an explicit human-confirmation gate.

## Why this exists

The `apps/relayer` handles gasless on-chain writes and `apps/indexer` keeps
state in sync. Neither can answer "what's interesting on the book right now?"
or "should we list a market about X?". Clawdius sits on top of those systems
and speaks English about them — via Amazon Bedrock for reasoning and the
Model Context Protocol for tools.

The system prompt embodies the operator's explicit reasoning discipline:
**enumerate facts → identify missing context → reason deliberately → creative
solution → confidence**. That scaffold is the agent's core loop, not a
flourish.

## Architecture

```
                     ┌──────────────────────────────────────────┐
                     │              apps/agent (this)            │
                     │                                           │
 human ── CLI ───▶   │  AgentRunner  ◀─ system prompt ─┐         │
                     │    │                             │         │
                     │    ▼                             │         │
                     │  Bedrock Converse (SDK)          │         │
                     │    │                             │         │
                     │    │ tool_use / tool_result      │         │
                     │    ▼                             │         │
                     │  in-process MCP clients          │         │
                     │    │          │                  │         │
                     │    ▼          ▼                  │         │
                     │  huggyarena- @playwright/mcp      │         │
                     │    mcp       (optional)           │         │
                     │    │                                       │
                     │    └─▶ MarketDataSource                    │
                     │             │                              │
                     │   ┌─────────┼──────────┐                   │
                     │   ▼         ▼          ▼                   │
                     │  Mock    Subgraph   AppSync                │
                     │ (seed)   (Graph)    (Huggypredict)          │
                     └──────────────────────────────────────────┘
```

The Converse loop is the only point that knows about AWS. The MCP server, the
tool handlers, and the data source abstraction have no Bedrock dependency —
you can reuse the MCP server from Claude Desktop, Cursor, or Claude Code
without touching Bedrock at all.

## Two entrypoints

### 1. CLI — `arena-agent`

```bash
# from the monorepo root
pnpm --filter @arena/agent chat "what markets close this week?"

# different model
pnpm --filter @arena/agent chat -- --model opus-4-7 "research a new market about ICE raids"

# with browser research tools (spawns @playwright/mcp as a child stdio server)
pnpm --filter @arena/agent chat -- --with-playwright \
  --skill research-new-market \
  "should we list a market on FOMC July 2026 rate cut?"

# enumerate models / skills
pnpm --filter @arena/agent list-models
pnpm --filter @arena/agent list-skills
```

Env vars:

| Var | Default | Purpose |
|---|---|---|
| `AWS_REGION` | `us-east-1` | Bedrock region |
| `HUGGYARENA_AGENT_SOURCE` | `mock` | `mock` / `subgraph` / `appsync` |
| `HUGGYARENA_SUBGRAPH_URL` | local | The Graph endpoint |
| `HUGGYARENA_APPSYNC_URL` | — | Huggypredict AppSync endpoint |
| `HUGGYARENA_APPSYNC_KEY` | — | AppSync API key |
| `HUGGYARENA_AGENT_MOCK_SEED` | bundled | Override seed JSON path (tests) |

### 2. MCP stdio server — `arena-agent mcp`

Plug the same tools into any MCP-aware client. Example
`mcp-configs/claude-desktop.json`:

```jsonc
{
  "mcpServers": {
    "huggyarena": {
      "command": "node",
      "args": ["/absolute/path/to/HuggyArena/apps/agent/dist/mcp-server/index.js"],
      "env": {
        "HUGGYARENA_AGENT_SOURCE": "mock"
      }
    }
  }
}
```

## Tools

Phase 1A ships five read-only tools. Every tool name is prefixed with
`huggyarena__` when surfaced to Bedrock (Bedrock requires
`^[a-zA-Z][a-zA-Z0-9_]*$`, and the prefix avoids collisions when Playwright
MCP is attached).

| Tool | Purpose |
|---|---|
| `list_markets` | Grid / search endpoint; supports category, status, query, limit. |
| `get_market` | Full detail for one market by id. |
| `price_history` | YES-price snapshots over a lookback window. |
| `portfolio` | Aggregate positions + PnL for a user. |
| `describe_source` | Returns which backing store the agent is reading. |

## Data sources

One interface, three implementations, one env var:

- **mock** — bundled seed JSON in `data/markets.seed.json`. Deterministic demo.
- **subgraph** — The Graph HTTP endpoint. On-chain truth.
- **appsync** — Huggypredict AppSync GraphQL. Product state. Falls back to the
  Todo model pre-Phase-1B until the schema expansion lands.

## Model catalogue

Defaults to `us.anthropic.claude-sonnet-4-6`. Verified ACTIVE in
`us-east-1` at PR time via `bedrock:ListInferenceProfiles`. See
`src/bedrock/models.ts` for the full list:

- `sonnet-4-6` (default, balanced) — Claude Sonnet 4.6
- `sonnet-4-5` — widely available fallback
- `opus-4-7` (frontier) — deepest multi-step reasoning
- `opus-4-5` — frontier fallback
- `haiku-4-5` (cheap) — reserved for Phase 1B's write-action verification pass
- `nova-pro` — AWS-native fallback if Anthropic profiles throttle

Switch per-invocation with `--model <alias>`. Arbitrary IDs are accepted too
if you want to point at something not catalogued.

## Skills (playbooks)

Markdown files under `skills/`, loaded by `--skill <name>`:

- `research-new-market` — decide whether to list a new market, produce a brief
- `triage-daily` — morning anomaly sweep across the full book
- `resolve-market` — Phase 1B stub; the protocol for mutating resolution

Skills are plain `.md` — the first `#` heading is the name, the body is
injected into the system prompt. Add a new one, name it, commit it.

## Testing

Offline (no AWS / no network):

```bash
pnpm --filter @arena/agent test
# tests 12
# pass 12
```

The `FakeBedrock` + `fakeMcp` pair in `src/__tests__/agent-runner.test.ts`
proves the Converse ↔ tool-use cycle dispatches correctly, recovers from tool
errors, and respects `maxTurns`. The MCP tool handlers are exercised
directly against the Mock data source in
`src/__tests__/mcp-tools.test.ts`.

Live smoke (requires AWS creds with `bedrock:InvokeModel*` on
`us.anthropic.claude-sonnet-4-6`):

```bash
pnpm --filter @arena/agent chat "list the top 3 crypto markets by volume"
```

## Non-goals for Phase 1A

- Web UI — deferred to Phase 1B (`/agent` page in Huggypredict).
- Lambda runtime — deferred to Phase 1B.
- Write tools (`propose_market`, `resolve_market`, `place_bet`) — deferred to
  Phase 1B, behind an explicit human-confirmation gate as documented in
  `skills/resolve-market.md`.
- Bedrock Knowledge Base / RAG — deferred.
- Multi-agent team (planner → executor → reviewer) — deferred.

## Security posture

- The CLI never sees raw AWS keys — it relies on the default AWS credential
  chain (`AWS_ACCESS_KEY_ID` env, EC2/Lambda role, SSO profile, etc.).
- MCP tool inputs are JSON-schema-validated before the handler runs.
- Phase 1A is read-only by construction — no tool can mutate on-chain or
  off-chain state.
- When Phase 1B ships, write tools will require: (1) operator mode, (2) a
  verbatim confirmation preamble from the model, (3) a cheap second-pass
  verification from `haiku-4-5` before the write is submitted to the relayer.
