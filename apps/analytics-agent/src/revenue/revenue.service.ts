import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@arena/shared-prisma';
import { CollectorService } from '../collector/collector.service';
import type { RevenueSnapshot } from '../dto/signals.dto';

/**
 * Fee structure from ArenaRegistry (configurable on-chain):
 *   Protocol: 2.75%  |  Creator: 1.00%  |  Referral: 0.50%  |  Dispute Reserve: 0.75%
 *   Total: 5.00%
 */
const FEE_BPS = {
  protocol: 275,
  creator: 100,
  referral: 50,
  disputeReserve: 75,
  total: 500,
} as const;

function bpsToFraction(bps: number): number {
  return bps / 10_000;
}

export interface RevenueBreakdown {
  totalVolume: string;
  protocolFees: string;
  creatorFees: string;
  referralFees: string;
  disputeReserve: string;
  totalFees: string;
  netDistributablePool: string;
}

export interface CreatorRevenue {
  creatorId: string;
  userId: string;
  tier: string;
  marketCount: number;
  totalVolume: string;
  estimatedCreatorFees: string;
  bondLocked: string;
}

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collector: CollectorService,
  ) {}

  /** Compute revenue snapshot for a given time window. */
  async getRevenueSnapshot(window: string): Promise<RevenueSnapshot> {
    const since = this.collector.getWindowDate(window);

    const [betAgg, marketCount, betCount] = await Promise.all([
      this.prisma.bet.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: since } },
      }),
      this.prisma.market.count({ where: { createdAt: { gte: since } } }),
      this.prisma.bet.count({ where: { createdAt: { gte: since } } }),
    ]);

    const totalPoolVolume = Number(betAgg._sum.amount ?? 0);

    return {
      totalProtocolFees: (totalPoolVolume * bpsToFraction(FEE_BPS.protocol)).toFixed(6),
      totalCreatorFees: (totalPoolVolume * bpsToFraction(FEE_BPS.creator)).toFixed(6),
      totalDisputeReserve: (totalPoolVolume * bpsToFraction(FEE_BPS.disputeReserve)).toFixed(6),
      totalPoolVolume: totalPoolVolume.toFixed(6),
      marketCount,
      betCount,
      periodStart: since.toISOString(),
      periodEnd: new Date().toISOString(),
    };
  }

  /** Full fee breakdown for a time window. */
  async getRevenueBreakdown(window: string): Promise<RevenueBreakdown> {
    const since = this.collector.getWindowDate(window);

    const betAgg = await this.prisma.bet.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: since } },
    });

    const totalVolume = Number(betAgg._sum.amount ?? 0);
    const totalFees = totalVolume * bpsToFraction(FEE_BPS.total);

    return {
      totalVolume: totalVolume.toFixed(6),
      protocolFees: (totalVolume * bpsToFraction(FEE_BPS.protocol)).toFixed(6),
      creatorFees: (totalVolume * bpsToFraction(FEE_BPS.creator)).toFixed(6),
      referralFees: (totalVolume * bpsToFraction(FEE_BPS.referral)).toFixed(6),
      disputeReserve: (totalVolume * bpsToFraction(FEE_BPS.disputeReserve)).toFixed(6),
      totalFees: totalFees.toFixed(6),
      netDistributablePool: (totalVolume - totalFees).toFixed(6),
    };
  }

  /** Per-creator revenue leaderboard. */
  async getCreatorRevenue(limit: number): Promise<CreatorRevenue[]> {
    const creators = await this.prisma.creator.findMany({
      include: {
        markets: {
          select: {
            id: true,
            totalPool: true,
          },
        },
      },
      orderBy: { reputationScore: 'desc' },
      take: limit,
    });

    return creators.map((c) => {
      const totalVolume = c.markets.reduce((sum, m) => sum + Number(m.totalPool), 0);
      return {
        creatorId: c.id,
        userId: c.userId,
        tier: c.tier,
        marketCount: c.markets.length,
        totalVolume: totalVolume.toFixed(6),
        estimatedCreatorFees: (totalVolume * bpsToFraction(c.feeShareBps)).toFixed(6),
        bondLocked: c.bondLocked.toString(),
      };
    });
  }

  /** Relay transaction analytics — gasless relay cost tracking. */
  async getRelayStats(window: string) {
    const since = this.collector.getWindowDate(window);

    const [total, byStatus] = await Promise.all([
      this.prisma.relayedTransaction.count({ where: { createdAt: { gte: since } } }),
      this.prisma.relayedTransaction.groupBy({
        by: ['status'],
        _count: true,
        where: { createdAt: { gte: since } },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of byStatus) {
      statusMap[row.status] = row._count;
    }

    return {
      totalRelayedTransactions: total,
      byStatus: statusMap,
      periodStart: since.toISOString(),
      periodEnd: new Date().toISOString(),
    };
  }
}
