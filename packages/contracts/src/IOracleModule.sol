// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IOracleModule
/// @notice Interface for pluggable oracle resolution modules.
///
/// Two canonical implementations are anticipated:
///
///  • **Chainlink** – authoritative push-based feed; suitable for markets whose
///    outcomes map directly to on-chain data (price, metric thresholds, etc.).
///    Low latency (~seconds), deterministic cost, composable via `AggregatorV3`.
///
///  • **UMA Optimistic Oracle** – dispute-game based pull oracle; suitable for
///    subjective or off-chain markets (HF model benchmarks, social data, etc.).
///    Economically secured via bond/slash; finality after the liveness period
///    (~2 h) unless challenged.  Total cost is typically < $50 per resolution
///    when unchallenged; challenged resolutions incur DVM fees (~$1 500).
///
/// An `ArenaMarket` checks `IRegistry.oracleModule()` at resolution time.
/// If set to a non-zero address, it calls `requestResolution` and later polls
/// `resolvedOutcome` instead of relying solely on the caller's ORACLE_ROLE.
///
/// Oracle module selection matrix (empirical, 2024-Q4 data):
///
/// | Criteria              | Chainlink         | UMA Optimistic   |
/// |-----------------------|-------------------|------------------|
/// | Market type           | Objective/on-chain| Subjective/off-chain |
/// | Avg cost per resolve  | ~$0.10 (gas only) | ~$10–50 (bond)   |
/// | Median latency        | <30 s (heartbeat) | 2–4 h (liveness) |
/// | Dispute mechanism     | N/A               | Bond/slash       |
/// | Composability         | High (AggregatorV3)| Medium (events) |
///
/// Recommended mapping for HF-Arenas:
/// - Benchmark/metric markets → Chainlink (or Pyth on Base/Arbitrum)
/// - HF community vote / subjective outcomes → UMA Optimistic Oracle
interface IOracleModule {
    /// @notice Emitted when a resolution is requested for a market.
    event ResolutionRequested(address indexed market, bytes32 proposedOutcome, bytes32 evidenceHash);

    /// @notice Emitted when a resolution is finalised by the oracle module.
    event ResolutionFinalised(address indexed market, bytes32 outcome);

    /// @notice Request resolution for `market` with a proposed outcome and evidence.
    /// @dev Called by `ArenaMarket.proposeResolution` when this module is active.
    ///      The module may start a liveness window (UMA) or verify a feed (Chainlink).
    /// @param market    Address of the `ArenaMarket` contract.
    /// @param proposed  The oracle's proposed winning outcome bytes32.
    /// @param evidence  IPFS hash or other provenance identifier for the evidence.
    function requestResolution(address market, bytes32 proposed, bytes32 evidence) external;

    /// @notice Poll the final resolution for `market`.
    /// @param market Address of the `ArenaMarket` contract.
    /// @return outcome  The resolved winning outcome (bytes32(0) if not yet resolved).
    /// @return resolved True when the outcome is final and can be used to finalise the market.
    function resolvedOutcome(address market) external view returns (bytes32 outcome, bool resolved);
}
