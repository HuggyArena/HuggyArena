# research-new-market

Use this skill when the user asks you to research whether HuggyArena should list a new market, or when they want a second opinion on an existing market's pricing.

## Objective

Produce a one-paragraph recommendation plus a structured brief:

- **Verdict** — LIST / DON'T LIST / LIST WITH CAVEATS
- **Pricing prior** — your estimate of the fair YES probability, in basis points and %
- **Resolution risk** — what could make the market ambiguous at settlement
- **Data freshness** — when the signal you based pricing on was observed
- **Oracle sources** — canonical URLs the resolver will actually read

## Method

1. Call `list_markets` with a `query` pulled from the user's topic. If an
   existing market already covers this question, stop and flag the duplicate —
   operators hate near-duplicate markets because they fragment liquidity.
2. If `playwright` MCP is attached, call `browser_navigate` to the canonical
   source (e.g. Federal Reserve statement, UEFA fixture page, BoP inmate
   locator). Extract the specific fact needed; paste the excerpt into your
   reasoning.
3. Think: can this resolve unambiguously? Prediction markets fail when the
   resolution criterion is fuzzy. If the user's topic is "will AI be AGI",
   push back and offer a sharper variant.
4. Check `get_market` on two or three nearby markets for comparable pricing.
   A 50-50 default is rarely right — lean on base rates.
5. Write the brief.

## Anti-patterns

- Do not list the `list_markets` JSON in your reply. Summarise.
- Do not propose a market that depends on subjective judging.
- Do not cite price numbers without a tool call backing them.
