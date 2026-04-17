# resolve-market

> **Phase 1B — not live in Phase 1A.** The `resolve_market` tool is not exposed
> to the read-only agent yet. This playbook is committed now so the protocol is
> clear by the time the tool ships.

Use this skill when the operator asks you to resolve a HuggyArena market to YES or NO. This is a mutating, on-chain action — treat it with the same care you would a production incident response.

## Objective

Produce an **explicit confirmation preamble** followed by a `resolve_market`
tool call, then a post-resolution sanity check.

## Method

1. Call `get_market(id)`. Verify:
   - `status === "CLOSED"` (you cannot resolve an open market).
   - `closesAt` is in the past.
   - The market is not already resolved (`winningOutcome` unset).
2. Call any oracle sources referenced in the market `description` (via the
   Playwright MCP when attached). Capture the specific fact.
3. Write the confirmation preamble:
   ```
   I am about to resolve market <id> ("<title>") to <YES|NO>
   based on <oracle source> observed at <timestamp>.
   Confirmation id: <uuid>.
   ```
4. Emit the `resolve_market` tool call with:
   - `marketId`
   - `outcome` ("YES" | "NO")
   - `evidenceUrls` (array of canonical URLs)
   - `confirmationId` (from the preamble)
5. After the relayer returns a tx hash, call `get_market` again to verify
   `winningOutcome` was set and `resolvedAt` is populated.

## Anti-patterns

- **Never** call `resolve_market` without a human-readable preamble first.
- **Never** resolve based on a single secondary source. Always cite the primary.
- **Never** resolve if the oracle sources disagree. Open a `Dispute` instead.
- **Never** override operator mode — if `Mode: RESEARCH`, say so and stop.
