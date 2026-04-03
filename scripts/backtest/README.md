# Market Mechanism Backtesting

Hypothesis-driven backtesting framework for comparing prediction market
mechanisms relevant to HF-Arenas.

## Overview

`mechanism_backtest.py` simulates three market mechanisms against synthetic
bet streams and measures price accuracy, fee economics, and convergence:

| Mechanism | Description | Used By |
|-----------|-------------|---------|
| **Parimutuel** | Pool-based; implied price = pool share | HF-Arenas (current), Azuro |
| **LMSR** | Log Market Scoring Rule; subsidised liquidity | Augur v1, Omen |
| **CPMM** | Constant-product AMM (Uniswap-style) | Polymarket (hybrid) |

## Requirements

- Python 3.10 or later
- No external dependencies (standard library only)

## Usage

```bash
# Default run (200 bets × 50 simulations, seed 42)
python scripts/backtest/mechanism_backtest.py

# Custom parameters
python scripts/backtest/mechanism_backtest.py \
  --num-bets 500 \
  --num-sims 100 \
  --seed 123

# Save CSV results
python scripts/backtest/mechanism_backtest.py > results.csv
```

## Output

### Summary (stderr-style, printed to stdout before CSV)

```
========================================================================
HF-Arenas Mechanism Backtest Summary
  Simulations per mechanism: 50
  Bets per simulation:       200
  Random seed:               42
========================================================================

  Parimutuel
    Avg MAE (implied vs true):  0.0523
    Avg Brier Score:            0.0312
    Avg Fees Collected:         $523.40
    Avg Volume:                 $10,468.00
    Effective Fee Rate:          5.00%

  LMSR
    Avg MAE (implied vs true):  0.0401
    ...
```

### CSV Data

Pipe output to a file and use the CSV section for analysis in R, Python
(pandas), or any spreadsheet tool.

## Metrics

| Metric | Description |
|--------|-------------|
| **MAE** | Mean Absolute Error between implied probability and true probability across all bets |
| **Brier Score** | Squared difference between final implied probability and actual outcome (lower is better) |
| **Total Fees** | Cumulative fees collected by the mechanism |
| **Effective Fee Rate** | Fees as a percentage of total volume |

## Extending

To add a new mechanism:

1. Create a class with `implied_probability(outcome) -> float` and
   `place_bet(outcome, amount) -> fee` methods.
2. Add it to the `MECHANISMS` list in `mechanism_backtest.py`.
3. Re-run the simulation.

## Interpreting Results

- **Parimutuel** converges to true probability with enough volume but has
  higher variance with few bets. Fee economics are straightforward (fixed
  percentage of each bet). This matches the `ArenaMarket.sol` implementation.

- **LMSR** converges faster due to the subsidised liquidity parameter `b`,
  but requires initial capital from the market maker (protocol subsidy).
  Lower effective fees but higher protocol risk.

- **CPMM** provides continuous pricing but suffers from impermanent loss and
  is vulnerable to MEV (sandwich attacks). Best suited for high-volume
  markets with active liquidity provision.

**Recommendation for HF-Arenas:** Parimutuel remains the optimal choice for
Phase 1 (low-to-medium volume AI markets). LMSR should be evaluated for
Phase 4+ when protocol treasury can subsidise liquidity.

## Related Documentation

- [Architecture & Mechanism Design](../../docs/ARCHITECTURE.md)
- [Oracle & Protocol Research](../../docs/ORACLE_AND_PROTOCOL_RESEARCH.md)
- [Compliance & Analytics](../../docs/COMPLIANCE_ANALYTICS.md)
