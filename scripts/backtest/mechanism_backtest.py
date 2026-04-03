#!/usr/bin/env python3
"""
HF-Arenas — Market Mechanism Backtesting Framework

Simulates Parimutuel, LMSR, and CPMM (constant-product) market mechanisms
against synthetic bet streams to compare capital efficiency, price accuracy,
and fee economics.

Usage:
    python mechanism_backtest.py [--num-bets N] [--num-sims S] [--seed SEED]

Outputs:
    - Per-mechanism summary statistics (mean absolute error, total fees,
      final implied probability, Brier score)
    - CSV results to stdout (pipe to file for further analysis)

Requirements:
    Python 3.10+, no external dependencies (stdlib only).
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import io
import math
import random
import sys
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class BetEvent:
    """A single bet placed by a participant."""
    outcome: int        # 0 = YES, 1 = NO
    amount: float       # notional in collateral units (e.g. USDC)
    true_prob: float    # ground-truth probability at the time of the bet


@dataclass
class SimResult:
    """Aggregate result of a single simulation run."""
    mechanism: str
    num_bets: int
    total_volume: float
    total_fees: float
    final_implied_prob: float
    true_prob: float
    mean_absolute_error: float
    brier_score: float


# ---------------------------------------------------------------------------
# Mechanism engines
# ---------------------------------------------------------------------------

class ParimutuelEngine:
    """
    Parimutuel (pool-based) mechanism as implemented in ArenaMarket.sol.

    All bets go into outcome pools.  Implied probability = pool_i / total_pool.
    Fees are deducted at bet time (matching on-chain behaviour).
    """

    def __init__(self, num_outcomes: int = 2, fee_bps: int = 500) -> None:
        self.pools: list[float] = [0.0] * num_outcomes
        self.fee_bps = fee_bps

    @property
    def total_pool(self) -> float:
        return sum(self.pools)

    def implied_probability(self, outcome: int) -> float:
        total = self.total_pool
        if total == 0:
            return 1.0 / len(self.pools)
        return self.pools[outcome] / total

    def place_bet(self, outcome: int, amount: float) -> float:
        fee = amount * self.fee_bps / 10_000
        net = amount - fee
        self.pools[outcome] += net
        return fee


class LMSREngine:
    """
    Logarithmic Market Scoring Rule (Hanson, 2003).

    Cost function: C(q) = b * ln(sum(exp(q_i / b)))
    where b is the liquidity parameter and q_i are share quantities.

    Used by Augur v1 and Omen.
    """

    def __init__(self, num_outcomes: int = 2, liquidity_b: float = 100.0,
                 fee_bps: int = 200) -> None:
        self.quantities: list[float] = [0.0] * num_outcomes
        self.b = liquidity_b
        self.fee_bps = fee_bps

    def _cost(self, quantities: list[float]) -> float:
        max_q = max(quantities)
        # Numerically stable log-sum-exp
        return self.b * (max_q / self.b + math.log(
            sum(math.exp((q - max_q) / self.b) for q in quantities)
        ))

    def implied_probability(self, outcome: int) -> float:
        max_q = max(self.quantities)
        exps = [math.exp((q - max_q) / self.b) for q in self.quantities]
        total = sum(exps)
        return exps[outcome] / total

    def place_bet(self, outcome: int, amount: float) -> float:
        fee = amount * self.fee_bps / 10_000
        net = amount - fee
        old_cost = self._cost(self.quantities)
        # Binary search for quantity delta that costs `net`
        lo, hi = 0.0, net * 10  # upper bound heuristic
        for _ in range(64):
            mid = (lo + hi) / 2
            trial = list(self.quantities)
            trial[outcome] += mid
            if self._cost(trial) - old_cost < net:
                lo = mid
            else:
                hi = mid
        self.quantities[outcome] += lo
        return fee


class CPMMEngine:
    """
    Constant-Product Market Maker (Uniswap-style).

    x * y = k invariant applied to a two-outcome prediction market.
    Used as a component in Polymarket's hybrid AMM + CLOB.
    """

    def __init__(self, initial_liquidity: float = 1000.0,
                 fee_bps: int = 200) -> None:
        # Equal initial reserves for a 50/50 market
        self.reserves: list[float] = [initial_liquidity, initial_liquidity]
        self.fee_bps = fee_bps

    def implied_probability(self, outcome: int) -> float:
        """Probability of outcome 0 = reserve_1 / (reserve_0 + reserve_1)."""
        other = 1 - outcome
        total = self.reserves[0] + self.reserves[1]
        if total == 0:
            return 0.5
        return self.reserves[other] / total

    def place_bet(self, outcome: int, amount: float) -> float:
        fee = amount * self.fee_bps / 10_000
        net = amount - fee
        # Buying outcome tokens: add collateral to the *other* reserve,
        # receive tokens from the outcome reserve (x * y = k).
        other = 1 - outcome
        k = self.reserves[0] * self.reserves[1]
        self.reserves[other] += net
        self.reserves[outcome] = k / self.reserves[other]
        return fee


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

def generate_bet_stream(
    num_bets: int,
    true_prob: float,
    rng: random.Random,
) -> list[BetEvent]:
    """
    Generate a synthetic bet stream where informed bettors lean towards the
    true outcome with noise.

    Bet sizes follow a log-normal distribution (empirically observed in
    real prediction markets — see Rothschild 2009).
    """
    bets: list[BetEvent] = []
    for _ in range(num_bets):
        # Informed bettor: bets on the correct side with probability
        # proportional to the true probability (with noise).
        noise = rng.gauss(0, 0.15)
        bettor_belief = max(0.05, min(0.95, true_prob + noise))
        outcome = 0 if rng.random() < bettor_belief else 1
        amount = round(rng.lognormvariate(3.0, 1.0), 2)  # median ~$20
        amount = max(1.0, min(amount, 10_000.0))  # clamp to [1, 10000]
        bets.append(BetEvent(outcome=outcome, amount=amount, true_prob=true_prob))
    return bets


def run_simulation(
    engine_cls: type,
    engine_kwargs: dict,
    bets: list[BetEvent],
    true_prob: float,
) -> SimResult:
    """Run a single simulation of a mechanism against a bet stream."""
    engine = engine_cls(**engine_kwargs)
    total_volume = 0.0
    total_fees = 0.0
    errors: list[float] = []

    for bet in bets:
        fee = engine.place_bet(bet.outcome, bet.amount)
        total_volume += bet.amount
        total_fees += fee
        implied_p = engine.implied_probability(0)
        errors.append(abs(implied_p - true_prob))

    final_p = engine.implied_probability(0)
    mae = sum(errors) / len(errors) if errors else 0.0
    # Brier score: (forecast - actual)^2 where actual is 1 for YES outcome
    actual = 1.0 if true_prob >= 0.5 else 0.0
    brier = (final_p - actual) ** 2

    return SimResult(
        mechanism=engine_cls.__name__.replace("Engine", ""),
        num_bets=len(bets),
        total_volume=round(total_volume, 2),
        total_fees=round(total_fees, 2),
        final_implied_prob=round(final_p, 4),
        true_prob=true_prob,
        mean_absolute_error=round(mae, 4),
        brier_score=round(brier, 4),
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

MECHANISMS: list[tuple[type, dict]] = [
    (ParimutuelEngine, {"num_outcomes": 2, "fee_bps": 500}),
    (LMSREngine, {"num_outcomes": 2, "liquidity_b": 100.0, "fee_bps": 200}),
    (CPMMEngine, {"initial_liquidity": 1000.0, "fee_bps": 200}),
]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="HF-Arenas market mechanism backtester",
    )
    parser.add_argument("--num-bets", type=int, default=200,
                        help="Number of bets per simulation (default: 200)")
    parser.add_argument("--num-sims", type=int, default=50,
                        help="Number of simulation runs per mechanism (default: 50)")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed for reproducibility (default: 42)")
    args = parser.parse_args()

    rng = random.Random(args.seed)

    # Scenario: true probability varies across simulations to test
    # convergence under different ground-truth conditions.
    true_probs = [rng.uniform(0.2, 0.8) for _ in range(args.num_sims)]

    all_results: list[SimResult] = []

    for true_prob in true_probs:
        bets = generate_bet_stream(args.num_bets, true_prob, rng)
        for engine_cls, engine_kwargs in MECHANISMS:
            result = run_simulation(engine_cls, engine_kwargs, bets, true_prob)
            all_results.append(result)

    # --- Summary statistics ---
    print("=" * 72)
    print("HF-Arenas Mechanism Backtest Summary")
    print(f"  Simulations per mechanism: {args.num_sims}")
    print(f"  Bets per simulation:       {args.num_bets}")
    print(f"  Random seed:               {args.seed}")
    print("=" * 72)

    mechanisms = sorted(set(r.mechanism for r in all_results))
    for mech in mechanisms:
        subset = [r for r in all_results if r.mechanism == mech]
        avg_mae = sum(r.mean_absolute_error for r in subset) / len(subset)
        avg_brier = sum(r.brier_score for r in subset) / len(subset)
        avg_fees = sum(r.total_fees for r in subset) / len(subset)
        avg_volume = sum(r.total_volume for r in subset) / len(subset)
        fee_pct = (avg_fees / avg_volume * 100) if avg_volume > 0 else 0

        print(f"\n  {mech}")
        print(f"    Avg MAE (implied vs true):  {avg_mae:.4f}")
        print(f"    Avg Brier Score:            {avg_brier:.4f}")
        print(f"    Avg Fees Collected:         ${avg_fees:,.2f}")
        print(f"    Avg Volume:                 ${avg_volume:,.2f}")
        print(f"    Effective Fee Rate:          {fee_pct:.2f}%")

    print("\n" + "=" * 72)

    # --- CSV output ---
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=[f.name for f in dataclasses.fields(SimResult)])
    writer.writeheader()
    for r in all_results:
        writer.writerow(dataclasses.asdict(r))

    print("\n--- CSV DATA (pipe to file) ---")
    print(buf.getvalue())


if __name__ == "__main__":
    main()
