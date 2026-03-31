import { BigInt } from '@graphprotocol/graph-ts';
import { MarketRegistered } from '../generated/ArenaRegistry/ArenaRegistry';
import { Market } from '../generated/schema';

export function handleMarketRegistered(event: MarketRegistered): void {
  let market = Market.load(event.params.market.toHexString());
  if (market == null) {
    market = new Market(event.params.market.toHexString());
    market.marketId = event.params.marketId;
    market.status = 'REGISTERED';
    market.totalPool = BigInt.fromI32(0);
    market.createdAt = event.block.timestamp;
  } else {
    market.marketId = event.params.marketId;
  }
  market.save();
}
