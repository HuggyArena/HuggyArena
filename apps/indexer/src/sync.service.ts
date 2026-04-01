import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@arena/shared-prisma';

@Injectable()
export class SyncService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SyncService.name);
  private lastProcessedBlock = 0;
  private readonly SYNC_INTERVAL_MS = 15000;
  private intervalId: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadCursor();
    this.logger.log(`Sync service initialized at cursor ${this.lastProcessedBlock}`);

    this.intervalId = setInterval(() => {
      if (this.isShuttingDown) return;
      this.syncFromSubgraph().catch((syncError) => {
        this.logger.error('Subgraph sync failed', syncError as any);
      });
    }, this.SYNC_INTERVAL_MS);
  }

  onApplicationShutdown() {
    this.isShuttingDown = true;
    if (this.intervalId) clearInterval(this.intervalId);
    this.logger.log('Sync service shutting down');
  }

  private async loadCursor() {
    try {
      const state = await this.prisma.syncState.findUnique({ where: { id: 'default' } });
      if (state) {
        this.lastProcessedBlock = Number(state.lastBlock);
      } else {
        await this.prisma.syncState.create({
          data: { id: 'default', lastBlock: BigInt(0) },
        });
        this.lastProcessedBlock = 0;
      }
    } catch (error) {
      this.logger.error('Failed to load sync cursor', error as any);
      this.lastProcessedBlock = 0;
    }
  }

  private async saveCursor(blockNumber: number) {
    await this.prisma.syncState.upsert({
      where: { id: 'default' },
      update: { lastBlock: BigInt(blockNumber) },
      create: { id: 'default', lastBlock: BigInt(blockNumber) },
    });
  }

  private async syncFromSubgraph() {
    const subgraphUrl = process.env.SUBGRAPH_URL;
    if (!subgraphUrl) return;

    const query = `query SyncMarkets($afterBlock: BigInt!) {
      markets(where: { blockNumber_gt: $afterBlock }, orderBy: blockNumber, orderDirection: asc, first: 100) {
        id
        marketId
        status
        totalPool
        blockNumber
        createdAt
        creator { id }
        outcomes { id outcomeKey label poolAmount odds }
      }
      _meta {
        block { number }
      }
    }`;

    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { afterBlock: this.lastProcessedBlock } }),
    });

    if (!response.ok) throw new Error(`Subgraph HTTP error: ${response.status}`);
    const subgraphResponse: any = await response.json();
    if (subgraphResponse.errors) throw new Error(`GraphQL errors: ${JSON.stringify(subgraphResponse.errors)}`);

    const markets = subgraphResponse?.data?.markets || [];
    if (markets.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const market of markets) {
        await tx.market.upsert({
          where: { contractAddress: market.id },
          update: {
            status: market.status,
            totalPool: market.totalPool.toString(),
          },
          create: {
            contractAddress: market.id,
            // Use marketId as the human-readable title/question until richer metadata
            // is available from a dedicated market-creation endpoint.
            title: market.marketId,
            question: market.marketId,
            status: market.status,
            totalPool: market.totalPool.toString(),
            sourcePrimary: 'subgraph',
            // createdAt comes from the chain; closeTime/resolveTime are not available
            // in the subgraph event and should be updated by the market-creation flow.
            closeTime: new Date(Number(market.createdAt) * 1000),
            resolveTime: new Date(Number(market.createdAt) * 1000),
            createdAt: new Date(Number(market.createdAt) * 1000),
          },
        });
      }
    });

    const newBlock = Math.max(...markets.map((market: any) => Number(market.blockNumber)));
    if (newBlock > this.lastProcessedBlock) {
      this.lastProcessedBlock = newBlock;
      await this.saveCursor(newBlock);
      this.logger.log(`Synced ${markets.length} markets; cursor block=${newBlock}`);
    }
  }
}
