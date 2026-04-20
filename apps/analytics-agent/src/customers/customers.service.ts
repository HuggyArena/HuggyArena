import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@arena/shared-prisma';
import { CollectorService } from '../collector/collector.service';
import type { CustomerProfile, WhaleActivity, PurchaseSignal } from '../dto/signals.dto';

/**
 * Customer segmentation thresholds (USDC).
 *   Whale:    >= $5,000 total wagered
 *   Power:    >= $1,000 total wagered
 *   Regular:  >= $100   total wagered
 *   Casual:   < $100    total wagered
 */
const SEGMENT_THRESHOLDS = {
  whale: 5000,
  power: 1000,
  regular: 100,
} as const;

function classifySegment(totalWagered: number): string {
  if (totalWagered >= SEGMENT_THRESHOLDS.whale) return 'whale';
  if (totalWagered >= SEGMENT_THRESHOLDS.power) return 'power';
  if (totalWagered >= SEGMENT_THRESHOLDS.regular) return 'regular';
  return 'casual';
}

interface BetSelect {
  amount: Prisma.Decimal;
  marketId: string;
  createdAt: Date;
  status: string;
}

interface PositionSelect {
  stakeAmount: Prisma.Decimal;
  claimableAmount: Prisma.Decimal;
  status: string;
}

interface UserWithRelations {
  id: string;
  walletAddress: string | null;
  displayName: string | null;
  bets: BetSelect[];
  positions: PositionSelect[];
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collector: CollectorService,
  ) {}

  /**
   * Full customer profiles with segmentation and lifetime metrics.
   *
   * Because totalWagered is a derived aggregate (SUM of bet amounts), filtering
   * and sorting must happen after aggregation.  We fetch all users matching the
   * base `where` clause, compute metrics client-side, then apply minWagered
   * filter + sort + manual pagination so that `total` accurately reflects the
   * filtered result set.
   */
  async getCustomerProfiles(
    limit: number,
    offset: number,
    minWagered?: number,
    kycStatus?: string,
  ): Promise<{ data: CustomerProfile[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (kycStatus) where['kycStatus'] = kycStatus;
    // Only users who have placed at least one bet
    where['bets'] = { some: {} };

    // 1. Fetch all matching users (no DB-level pagination) so we can
    //    aggregate, filter, and sort before slicing.
    const users = await this.prisma.user.findMany({
      where,
      include: {
        bets: {
          select: {
            amount: true,
            marketId: true,
            createdAt: true,
            status: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        positions: {
          select: {
            stakeAmount: true,
            claimableAmount: true,
            status: true,
          },
        },
      },
    });

    // 2. Compute per-user metrics
    let profiles: CustomerProfile[] = (users as UserWithRelations[]).map(
      (user: UserWithRelations) => {
        const totalWagered = user.bets.reduce(
          (sum: number, b: BetSelect) => sum + Number(b.amount),
          0,
        );
        const uniqueMarkets = new Set(user.bets.map((b: BetSelect) => b.marketId)).size;
        const avgBetSize = user.bets.length > 0 ? totalWagered / user.bets.length : 0;

        // Win rate from positions (claimable > 0 means winning)
        const totalPositions = user.positions.length;
        const winningPositions = user.positions.filter(
          (p: PositionSelect) => Number(p.claimableAmount) > 0,
        ).length;
        const winRate = totalPositions > 0 ? winningPositions / totalPositions : 0;

        const firstBet = user.bets[user.bets.length - 1];
        const lastBet = user.bets[0];

        return {
          userId: user.id,
          walletAddress: user.walletAddress,
          displayName: user.displayName,
          totalWagered: totalWagered.toFixed(6),
          totalBets: user.bets.length,
          uniqueMarkets,
          avgBetSize: avgBetSize.toFixed(6),
          winRate: Math.round(winRate * 100),
          firstBet: firstBet?.createdAt.toISOString() ?? '',
          lastBet: lastBet?.createdAt.toISOString() ?? '',
          segment: classifySegment(totalWagered),
        };
      },
    );

    // 3. Apply minWagered filter before sorting / pagination
    if (minWagered !== undefined) {
      profiles = profiles.filter((p) => parseFloat(p.totalWagered) >= minWagered);
    }

    // 4. Sort globally by total wagered descending
    profiles.sort((a, b) => parseFloat(b.totalWagered) - parseFloat(a.totalWagered));

    // 5. Compute correct total from the filtered set, then paginate
    const total = profiles.length;
    const paginated = profiles.slice(offset, offset + limit);

    return { data: paginated, total };
  }

  /** Customer segmentation summary. */
  async getSegmentSummary(): Promise<Record<string, { count: number; totalVolume: string }>> {
    const { data: profiles } = await this.getCustomerProfiles(10000, 0);

    const segments: Record<string, { count: number; totalVolume: number }> = {
      whale: { count: 0, totalVolume: 0 },
      power: { count: 0, totalVolume: 0 },
      regular: { count: 0, totalVolume: 0 },
      casual: { count: 0, totalVolume: 0 },
    };

    for (const p of profiles) {
      const seg = segments[p.segment];
      if (seg) {
        seg.count += 1;
        seg.totalVolume += parseFloat(p.totalWagered);
      }
    }

    const result: Record<string, { count: number; totalVolume: string }> = {};
    for (const [key, val] of Object.entries(segments)) {
      result[key] = { count: val.count, totalVolume: val.totalVolume.toFixed(6) };
    }
    return result;
  }

  /** Whale activity — top spenders with recent bet details. */
  async getWhaleActivity(
    limit: number,
    minBetAmount: number,
  ): Promise<WhaleActivity[]> {
    // Find users whose largest single bet exceeds threshold
    const whaleAgg = await this.prisma.bet.groupBy({
      by: ['userId'],
      _sum: { amount: true },
      _max: { amount: true },
      _count: true,
      having: { amount: { _max: { gte: minBetAmount } } },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    });

    const whaleUserIds = whaleAgg.map((w: { userId: string }) => w.userId);

    if (whaleUserIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: whaleUserIds } },
      select: { id: true, walletAddress: true },
    });
    const userMap = new Map<string, { id: string; walletAddress: string | null }>(
      users.map((u: { id: string; walletAddress: string | null }) => [u.id, u]),
    );

    // Fetch recent bets for each whale
    const recentBets = await this.prisma.bet.findMany({
      where: { userId: { in: whaleUserIds } },
      include: {
        user: { select: { walletAddress: true } },
        market: { select: { title: true } },
        outcome: { select: { label: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 5, // 5 recent bets per whale max
    });

    // Group recent bets by user
    const betsByUser = new Map<string, PurchaseSignal[]>();
    for (const bet of recentBets) {
      const list = betsByUser.get(bet.userId) ?? [];
      if (list.length < 5) {
        list.push({
          betId: bet.id,
          userId: bet.userId,
          walletAddress: bet.user.walletAddress,
          marketId: bet.marketId,
          marketTitle: bet.market.title,
          outcomeLabel: bet.outcome.label,
          amount: bet.amount.toString(),
          oddsAtBet: bet.oddsAtBet?.toString() ?? null,
          timestamp: bet.createdAt.toISOString(),
        });
      }
      betsByUser.set(bet.userId, list);
    }

    // Find favorite market per whale
    const favoriteMarkets = await this.prisma.bet.groupBy({
      by: ['userId', 'marketId'],
      _count: true,
      where: { userId: { in: whaleUserIds } },
      orderBy: { _count: { marketId: 'desc' } },
    });

    const favMarketByUser = new Map<string, string>();
    for (const row of favoriteMarkets) {
      if (!favMarketByUser.has(row.userId)) {
        favMarketByUser.set(row.userId, row.marketId);
      }
    }

    return whaleAgg.map(
      (w: {
        userId: string;
        _sum: { amount: Prisma.Decimal | null };
        _max: { amount: Prisma.Decimal | null };
        _count: number;
      }) => {
        const user = userMap.get(w.userId);
        return {
          userId: w.userId,
          walletAddress: user?.walletAddress ?? null,
          totalWagered: w._sum.amount?.toString() ?? '0',
          largestBet: w._max.amount?.toString() ?? '0',
          betCount: w._count,
          favoriteMarket: favMarketByUser.get(w.userId) ?? 'N/A',
          recentBets: betsByUser.get(w.userId) ?? [],
        };
      },
    );
  }
}
