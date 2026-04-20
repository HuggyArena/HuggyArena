import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@arena/shared-prisma';
import { CollectorService } from '../collector/collector.service';
import type {
  PurchaseSignal,
  MarketSignal,
  TrendPoint,
  DashboardSummary,
} from '../dto/signals.dto';

/**
 * Core signals service — queries the HuggyArena DB for purchase intelligence,
 * market activity, and volume trends. Combines live DB queries with cached
 * snapshots from the CollectorService for optimal performance.
 */
@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collector: CollectorService,
  ) {}

  // === Purchase Signals ===

  async getPurchaseSignals(
    window: string,
    limit: number,
    offset: number,
  ): Promise<{ data: PurchaseSignal[]; total: number }> {
    const since = this.collector.getWindowDate(window);

    const [bets, total] = await Promise.all([
      this.prisma.bet.findMany({
        where: { createdAt: { gte: since } },
        include: {
          user: { select: { walletAddress: true } },
          market: { select: { title: true } },
          outcome: { select: { label: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.bet.count({ where: { createdAt: { gte: since } } }),
    ]);

    const data: PurchaseSignal[] = bets.map((bet) => ({
      betId: bet.id,
      userId: bet.userId,
      walletAddress: bet.user.walletAddress,
      marketId: bet.marketId,
      marketTitle: bet.market.title,
      outcomeLabel: bet.outcome.label,
      amount: bet.amount.toString(),
      oddsAtBet: bet.oddsAtBet?.toString() ?? null,
      timestamp: bet.createdAt.toISOString(),
    }));

    return { data, total };
  }

  // === Market Signals ===

  async getMarketSignals(
    window: string,
    limit: number,
    offset: number,
    status?: string,
  ): Promise<{ data: MarketSignal[]; total: number }> {
    const since = this.collector.getWindowDate(window);

    const where: Record<string, unknown> = { createdAt: { gte: since } };
    if (status) where['status'] = status;

    const [markets, total] = await Promise.all([
      this.prisma.market.findMany({
        where,
        include: {
          outcomes: { orderBy: { poolAmount: 'desc' }, take: 1 },
          _count: { select: { bets: true } },
          bets: { select: { userId: true }, distinct: ['userId'] },
        },
        orderBy: { totalPool: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.market.count({ where }),
    ]);

    const data: MarketSignal[] = markets.map((m) => {
      const topOutcome = m.outcomes[0];
      return {
        marketId: m.id,
        title: m.title,
        status: m.status,
        totalPool: m.totalPool.toString(),
        betCount: m._count.bets,
        uniqueBettors: m.bets.length,
        topOutcome: topOutcome?.label ?? 'N/A',
        topOutcomePool: topOutcome?.poolAmount?.toString() ?? '0',
        createdAt: m.createdAt.toISOString(),
        closeTime: m.closeTime.toISOString(),
      };
    });

    return { data, total };
  }

  // === Volume Trend ===

  async getVolumeTrend(window: string): Promise<TrendPoint[]> {
    const since = this.collector.getWindowDate(window);

    // Group bets by day for trend analysis
    const bets = await this.prisma.bet.findMany({
      where: { createdAt: { gte: since } },
      select: { amount: true, userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Bucket by day
    const buckets = new Map<
      string,
      { volume: number; count: number; users: Set<string> }
    >();

    for (const bet of bets) {
      const day = bet.createdAt.toISOString().split('T')[0]!;
      const existing = buckets.get(day) ?? { volume: 0, count: 0, users: new Set<string>() };
      existing.volume += Number(bet.amount);
      existing.count += 1;
      existing.users.add(bet.userId);
      buckets.set(day, existing);
    }

    const trend: TrendPoint[] = [];
    for (const [period, data] of buckets.entries()) {
      trend.push({
        period,
        volume: data.volume.toFixed(6),
        betCount: data.count,
        uniqueUsers: data.users.size,
        avgBetSize: data.count > 0 ? (data.volume / data.count).toFixed(6) : '0',
      });
    }

    return trend;
  }

  // === Dashboard Summary ===

  async getDashboard(): Promise<DashboardSummary> {
    const snapshot = this.collector.getLatestSnapshot();

    const [totalVolume, totalBets, totalUsers, activeMarkets, topMarkets, trend] =
      await Promise.all([
        snapshot
          ? Promise.resolve(snapshot.volumeStats.allTimeVolume)
          : this.prisma.bet
              .aggregate({ _sum: { amount: true } })
              .then((r) => r._sum.amount?.toString() ?? '0'),
        snapshot
          ? Promise.resolve(snapshot.volumeStats.allTimeBets)
          : this.prisma.bet.count(),
        snapshot
          ? Promise.resolve(snapshot.userStats.totalUsers)
          : this.prisma.user.count(),
        this.prisma.market.count({ where: { status: 'OPEN' } }),
        this.getMarketSignals('all', 1, 0),
        this.getVolumeTrend('30d'),
      ]);

    // Protocol fee is 2.75% of total volume
    const numericVolume = parseFloat(totalVolume);
    const estimatedRevenue = (numericVolume * 0.0275).toFixed(6);

    // Top whale from snapshot
    let topWhale = null;
    if (snapshot && snapshot.whaleStats.topWhales.length > 0) {
      const top = snapshot.whaleStats.topWhales[0]!;
      topWhale = {
        userId: top.userId,
        walletAddress: null,
        totalWagered: top.totalWagered,
        largestBet: top.largestBet,
        betCount: top.betCount,
        favoriteMarket: 'N/A',
        recentBets: [],
      };
    }

    return {
      totalVolume,
      totalBets,
      totalUsers,
      activeMarkets,
      estimatedRevenue,
      topMarketByVolume: topMarkets.data[0] ?? null,
      topWhale,
      volumeTrend: trend,
    };
  }
}
