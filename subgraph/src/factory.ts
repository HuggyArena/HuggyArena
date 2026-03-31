import { BigInt } from '@graphprotocol/graph-ts';
import { MarketCreated } from '../generated/ArenaFactory/ArenaFactory';
import { Market } from '../generated/schema';
import { ArenaMarket as ArenaMarketTemplate } from '../generated/templates';

export function handleMarketCreated(event: MarketCreated): void {
  let market = new Market(event.params.proxy.toHexString());
  market.marketId = event.params.marketId;
  market.creator = event.params.creator.toHexString();
  market.status = 'PENDING_APPROVAL';
  market.totalPool = BigInt.fromI32(0);
  market.createdAt = event.block.timestamp;
  market.save();

  ArenaMarketTemplate.create(event.params.proxy);
}
