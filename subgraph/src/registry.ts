import { BigInt } from '@graphprotocol/graph-ts';
import { MarketRegistered } from '../generated/ArenaRegistry/ArenaRegistry';
import { Market } from '../generated/schema';

export function handleMarketRegistered(event: MarketRegistered): void {
  // `marketId` is declared `indexed string` in the ABI, so the raw event value is a
  // keccak256 hash (Bytes) rather than the original string. Store the hex encoding.
  let marketIdHex = event.params.marketId.toHexString();
  let market = Market.load(event.params.market.toHexString());
  if (market == null) {
    market = new Market(event.params.market.toHexString());
    market.marketId = marketIdHex;
    market.status = 'REGISTERED';
    market.totalPool = BigInt.fromI32(0);
    market.createdAt = event.block.timestamp;
  } else {
    market.marketId = marketIdHex;
  }
  market.save();
}
