import { BigDecimal, BigInt } from '@graphprotocol/graph-ts';
import {
  BetPlaced,
  ClaimExecuted,
  MarketClosed,
  MarketFinalized,
  MarketInitialized,
  MarketVoided,
  ResolutionProposed,
} from '../generated/templates/ArenaMarket/ArenaMarket';
import { Bet, Market, Outcome, User } from '../generated/schema';

function zeroBigInt(): BigInt {
  return BigInt.fromI32(0);
}

function zeroBigDecimal(): BigDecimal {
  return BigDecimal.fromString('0');
}

export function handleMarketInitialized(event: MarketInitialized): void {
  let market = Market.load(event.address.toHexString());
  if (market == null) {
    market = new Market(event.address.toHexString());
    market.marketId = event.params.marketId;
    market.creator = event.params.creator.toHexString();
    market.status = 'PENDING_APPROVAL';
    market.totalPool = zeroBigInt();
    market.createdAt = event.block.timestamp;
    market.save();
  }
}

export function handleBetPlaced(event: BetPlaced): void {
  let market = Market.load(event.address.toHexString());
  if (market == null) return;

  let user = User.load(event.params.user.toHexString());
  if (user == null) {
    user = new User(event.params.user.toHexString());
    user.totalBets = zeroBigInt();
    user.totalVolume = zeroBigInt();
    user.totalWon = zeroBigInt();
    user.pnl = zeroBigDecimal();
    user.save();
  }

  let outcomeId = event.address.toHexString() + '-' + event.params.outcome.toHexString();
  let outcome = Outcome.load(outcomeId);
  if (outcome == null) {
    outcome = new Outcome(outcomeId);
    outcome.market = market.id;
    outcome.outcomeKey = event.params.outcome.toHexString();
    outcome.label = event.params.outcome.toHexString();
    outcome.poolAmount = zeroBigInt();
    outcome.odds = zeroBigDecimal();
  }

  outcome.poolAmount = outcome.poolAmount.plus(event.params.amount);
  if (outcome.poolAmount.gt(zeroBigInt())) {
    outcome.odds = event.params.newTotal.toBigDecimal().div(outcome.poolAmount.toBigDecimal());
  }
  outcome.save();

  let bet = new Bet(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  bet.market = market.id;
  bet.outcome = outcome.id;
  bet.user = user.id;
  bet.amount = event.params.amount;
  bet.oddsAtBet = outcome.odds;
  bet.status = 'ACTIVE';
  bet.createdAt = event.block.timestamp;
  bet.save();

  user.totalBets = user.totalBets.plus(BigInt.fromI32(1));
  user.totalVolume = user.totalVolume.plus(event.params.amount);
  user.save();

  market.totalPool = event.params.newTotal;
  market.save();
}

export function handleMarketClosed(event: MarketClosed): void {
  let market = Market.load(event.address.toHexString());
  if (market == null) return;
  market.status = 'CLOSED';
  market.closedAt = event.block.timestamp;
  market.save();
}

export function handleResolutionProposed(event: ResolutionProposed): void {
  let market = Market.load(event.address.toHexString());
  if (market == null) return;
  market.status = 'PROPOSED';
  market.resolutionHash = event.params.evidenceHash.toHexString();
  market.save();
}

export function handleMarketFinalized(event: MarketFinalized): void {
  let market = Market.load(event.address.toHexString());
  if (market == null) return;
  market.status = 'FINALIZED';
  market.finalizedAt = event.block.timestamp;
  market.winningOutcome = event.address.toHexString() + '-' + event.params.winningOutcome.toHexString();
  market.distributablePool = event.params.payoutPool;
  market.save();
}

export function handleClaimExecuted(event: ClaimExecuted): void {
  let user = User.load(event.params.user.toHexString());
  if (user == null) return;
  user.totalWon = user.totalWon.plus(event.params.amount);
  user.pnl = user.pnl.plus(event.params.amount.toBigDecimal());
  user.save();
}

export function handleMarketVoided(event: MarketVoided): void {
  let market = Market.load(event.address.toHexString());
  if (market == null) return;
  market.status = 'VOIDED';
  market.voidReason = event.params.reason;
  market.save();
}
