import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@arena/shared-prisma';

/**
 * Automated data collector that runs on a schedule to aggregate
 * purchase intelligence, market snapshots, and customer behavior
 * from the HuggyArena database.
 *
 * Snapshots are stored in-memory for fast API access and persisted
 * to the snapshot table for historical trend analysis.
 */
@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  /** Cached aggregate snapshots, refreshed on each collection cycle. */
  private latestSnapshot: CollectedSnapshot | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Runs every 5 minutes to refresh aggregate data. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async collectAll(): Promise<void> {
    this.logger.log('Starting data collection cycle');
    const start = Date.now();

    try {
      const [volumeStats, marketStats, userStats, whaleStats] = await Promise.all([
        this.collectVolumeStats(),
        this.collectMarketStats(),
        this.collectUserStats(),
        this.collectWhaleStats(),
      ]);

      this.latestSnapshot = {
        collectedAt: new Date().toISOString(),
        volumeStats,
        marketStats,
        userStats,
        whaleStats,
      };

      const elapsed = Date.now() - start;
      this.logger.log(`Collection cycle complete in ${elapsed}ms`);
    } catch (error) {
      this.logger.error('Collection cycle failed', error instanceof Error ? error.stack : error);
    }
  }

  getLatestSnapshot(): CollectedSnapshot | null {
    return this.latestSnapshot;
  }

  // === Volume Aggregation ===

  async collectVolumeStats(): Promise<VolumeStats> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [allTime, daily, weekly, monthly] = await Promise.all([
      this.prisma.bet.aggregate({ _sum: { amount: true }, _count: true }),
      this.prisma.bet.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { createdAt: { gte: oneDayAgo } },
      }),
      this.prisma.bet.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { createdAt: { gte: oneWeekAgo } },
      }),
      this.prisma.bet.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { createdAt: { gte: oneMonthAgo } },
      }),
    ]);

    return {
      allTimeVolume: allTime._sum.amount?.toString() ?? '0',
      allTimeBets: allTime._count,
      dailyVolume: daily._sum.amount?.toString() ?? '0',
      dailyBets: daily._count,
      weeklyVolume: weekly._sum.amount?.toString() ?? '0',
      weeklyBets: weekly._count,
      monthlyVolume: monthly._sum.amount?.toString() ?? '0',
      monthlyBets: monthly._count,
    };
  }

  // === Market Stats ===

  async collectMarketStats(): Promise<MarketStats> {
    const [total, byStatus] = await Promise.all([
      this.prisma.market.count(),
      this.prisma.market.groupBy({
        by: ['status'],
        _count: true,
        _sum: { totalPool: true },
      }),
    ]);

    const statusBreakdown: Record<string, { count: number; volume: string }> = {};
    for (const row of byStatus) {
      statusBreakdown[row.status] = {
        count: row._count,
        volume: row._sum.totalPool?.toString() ?? '0',
      };
    }

    return { totalMarkets: total, statusBreakdown };
  }

  // === User Stats ===

  async collectUserStats(): Promise<UserStats> {
    const [totalUsers, usersWithBets, kycBreakdown] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { bets: { some: {} } } }),
      this.prisma.user.groupBy({ by: ['kycStatus'], _count: true }),
    ]);

    const kycMap: Record<string, number> = {};
    for (const row of kycBreakdown) {
      kycMap[row.kycStatus] = row._count;
    }

    return { totalUsers, activeBettors: usersWithBets, kycBreakdown: kycMap };
  }

  // === Whale Detection ===

  async collectWhaleStats(): Promise<WhaleStats> {
    // A whale is defined as a user with any single bet >= $1000 USDC
    const whaleThreshold = 1000;

    const whales = await this.prisma.bet.groupBy({
      by: ['userId'],
      _sum: { amount: true },
      _max: { amount: true },
      _count: true,
      having: { amount: { _max: { gte: whaleThreshold } } },
      orderBy: { _sum: { amount: 'desc' } },
      take: 50,
    });

    return {
      whaleCount: whales.length,
      whaleThreshold,
      topWhales: whales.map(
        (w: {
          userId: string;
          _sum: { amount: Prisma.Decimal | null };
          _max: { amount: Prisma.Decimal | null };
          _count: number;
        }) => ({
          userId: w.userId,
          totalWagered: w._sum.amount?.toString() ?? '0',
          largestBet: w._max.amount?.toString() ?? '0',
          betCount: w._count,
        }),
      ),
    };
  }

  // === Time-windowed queries for API ===

  getWindowDate(window: string): Date {
    const now = new Date();
    switch (window) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(0); // all time
    }
  }
}

// === Internal types ===

export interface CollectedSnapshot {
  collectedAt: string;
  volumeStats: VolumeStats;
  marketStats: MarketStats;
  userStats: UserStats;
  whaleStats: WhaleStats;
}

export interface VolumeStats {
  allTimeVolume: string;
  allTimeBets: number;
  dailyVolume: string;
  dailyBets: number;
  weeklyVolume: string;
  weeklyBets: number;
  monthlyVolume: string;
  monthlyBets: number;
}

export interface MarketStats {
  totalMarkets: number;
  statusBreakdown: Record<string, { count: number; volume: string }>;
}

export interface UserStats {
  totalUsers: number;
  activeBettors: number;
  kycBreakdown: Record<string, number>;
}

export interface WhaleStats {
  whaleCount: number;
  whaleThreshold: number;
  topWhales: Array<{
    userId: string;
    totalWagered: string;
    largestBet: string;
    betCount: number;
  }>;
}
