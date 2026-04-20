import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@arena/shared-prisma';
import { CollectorService } from '../collector/collector.service';

export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  threshold: number;
  window: string;
  enabled: boolean;
  createdAt: string;
}

export type AlertType =
  | 'whale_bet'
  | 'volume_spike'
  | 'new_market'
  | 'revenue_milestone'
  | 'large_position'
  | 'rapid_betting';

export interface FiredAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  type: AlertType;
  message: string;
  data: Record<string, unknown>;
  firedAt: string;
  acknowledged: boolean;
}

/**
 * Automated alert system that monitors HuggyArena activity for
 * whale bets, volume spikes, revenue milestones, and rapid betting
 * patterns. Alerts are stored in-memory and exposed via the API.
 *
 * In production, extend with webhook/Telegram/Slack integrations.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly rules: Map<string, AlertRule> = new Map();
  private readonly firedAlerts: FiredAlert[] = [];
  private nextRuleId = 1;
  private nextAlertId = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly collector: CollectorService,
  ) {
    // Register default alert rules
    this.addRule({
      name: 'Whale Bet Detected',
      type: 'whale_bet',
      threshold: 1000, // $1000+ single bet
      window: '1h',
      enabled: true,
    });
    this.addRule({
      name: 'Volume Spike (2x daily average)',
      type: 'volume_spike',
      threshold: 2, // 2x multiplier over average
      window: '1h',
      enabled: true,
    });
    this.addRule({
      name: 'Revenue Milestone ($10K)',
      type: 'revenue_milestone',
      threshold: 10000,
      window: 'all',
      enabled: true,
    });
    this.addRule({
      name: 'Rapid Betting (10+ bets in 10 min)',
      type: 'rapid_betting',
      threshold: 10,
      window: '10m',
      enabled: true,
    });
  }

  /** Add a new alert rule. */
  addRule(input: Omit<AlertRule, 'id' | 'createdAt'>): AlertRule {
    const rule: AlertRule = {
      ...input,
      id: `rule-${this.nextRuleId++}`,
      createdAt: new Date().toISOString(),
    };
    this.rules.set(rule.id, rule);
    this.logger.log(`Alert rule added: ${rule.name} (${rule.type})`);
    return rule;
  }

  /** List all rules. */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /** Toggle a rule on/off. */
  toggleRule(ruleId: string, enabled: boolean): AlertRule | null {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;
    const updated = { ...rule, enabled };
    this.rules.set(ruleId, updated);
    return updated;
  }

  /** Get recent alerts. */
  getAlerts(limit: number): FiredAlert[] {
    return this.firedAlerts.slice(-limit).reverse();
  }

  /** Acknowledge an alert. */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.firedAlerts.find((a) => a.id === alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    return true;
  }

  /** Runs every minute to check alert conditions. */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAlerts(): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        switch (rule.type) {
          case 'whale_bet':
            await this.checkWhaleBets(rule);
            break;
          case 'volume_spike':
            await this.checkVolumeSpike(rule);
            break;
          case 'revenue_milestone':
            await this.checkRevenueMilestone(rule);
            break;
          case 'rapid_betting':
            await this.checkRapidBetting(rule);
            break;
          default:
            break;
        }
      } catch (error) {
        this.logger.error(
          `Alert check failed for ${rule.name}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  private async checkWhaleBets(rule: AlertRule): Promise<void> {
    const since = this.getWindowDate(rule.window);

    const bigBets = await this.prisma.bet.findMany({
      where: {
        createdAt: { gte: since },
        amount: { gte: rule.threshold },
      },
      include: {
        user: { select: { walletAddress: true } },
        market: { select: { title: true } },
      },
      orderBy: { amount: 'desc' },
      take: 10,
    });

    for (const bet of bigBets) {
      const alreadyFired = this.firedAlerts.some(
        (a) => a.ruleId === rule.id && (a.data as Record<string, unknown>)['betId'] === bet.id,
      );
      if (alreadyFired) continue;

      this.fireAlert(rule, `Whale bet: $${bet.amount} on "${bet.market.title}"`, {
        betId: bet.id,
        userId: bet.userId,
        walletAddress: bet.user.walletAddress,
        amount: bet.amount.toString(),
        marketTitle: bet.market.title,
      });
    }
  }

  private async checkVolumeSpike(rule: AlertRule): Promise<void> {
    const snapshot = this.collector.getLatestSnapshot();
    if (!snapshot) return;

    const dailyVolume = parseFloat(snapshot.volumeStats.dailyVolume);
    const hourlyAvg = dailyVolume / 24;

    // Check last hour volume
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAgg = await this.prisma.bet.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: oneHourAgo } },
    });
    const recentVolume = Number(recentAgg._sum.amount ?? 0);

    if (hourlyAvg > 0 && recentVolume / hourlyAvg >= rule.threshold) {
      const alreadyFired = this.firedAlerts.some(
        (a) =>
          a.ruleId === rule.id &&
          new Date(a.firedAt).getTime() > Date.now() - 60 * 60 * 1000,
      );
      if (alreadyFired) return;

      this.fireAlert(
        rule,
        `Volume spike: $${recentVolume.toFixed(2)} in the last hour (${(recentVolume / hourlyAvg).toFixed(1)}x average)`,
        {
          recentVolume: recentVolume.toFixed(6),
          hourlyAvg: hourlyAvg.toFixed(6),
          multiplier: (recentVolume / hourlyAvg).toFixed(1),
        },
      );
    }
  }

  private async checkRevenueMilestone(rule: AlertRule): Promise<void> {
    const totalAgg = await this.prisma.bet.aggregate({ _sum: { amount: true } });
    const totalVolume = Number(totalAgg._sum.amount ?? 0);
    const protocolRevenue = totalVolume * 0.0275; // 2.75% protocol fee

    if (protocolRevenue >= rule.threshold) {
      const alreadyFired = this.firedAlerts.some(
        (a) =>
          a.ruleId === rule.id &&
          (a.data as Record<string, unknown>)['milestone'] === rule.threshold,
      );
      if (alreadyFired) return;

      this.fireAlert(
        rule,
        `Revenue milestone reached: $${protocolRevenue.toFixed(2)} protocol fees (from $${totalVolume.toFixed(2)} volume)`,
        {
          milestone: rule.threshold,
          protocolRevenue: protocolRevenue.toFixed(6),
          totalVolume: totalVolume.toFixed(6),
        },
      );
    }
  }

  private async checkRapidBetting(rule: AlertRule): Promise<void> {
    const since = this.getWindowDate(rule.window);

    const rapidUsers = await this.prisma.bet.groupBy({
      by: ['userId'],
      _count: true,
      where: { createdAt: { gte: since } },
      having: { userId: { _count: { gte: rule.threshold } } },
    });

    for (const user of rapidUsers) {
      const alreadyFired = this.firedAlerts.some(
        (a) =>
          a.ruleId === rule.id &&
          (a.data as Record<string, unknown>)['userId'] === user.userId &&
          new Date(a.firedAt).getTime() > Date.now() - 10 * 60 * 1000,
      );
      if (alreadyFired) continue;

      this.fireAlert(
        rule,
        `Rapid betting: User ${user.userId} placed ${user._count} bets in ${rule.window}`,
        { userId: user.userId, betCount: user._count },
      );
    }
  }

  private fireAlert(rule: AlertRule, message: string, data: Record<string, unknown>): void {
    const alert: FiredAlert = {
      id: `alert-${this.nextAlertId++}`,
      ruleId: rule.id,
      ruleName: rule.name,
      type: rule.type,
      message,
      data,
      firedAt: new Date().toISOString(),
      acknowledged: false,
    };
    this.firedAlerts.push(alert);

    // Keep last 1000 alerts in memory
    if (this.firedAlerts.length > 1000) {
      this.firedAlerts.splice(0, this.firedAlerts.length - 1000);
    }

    this.logger.warn(`ALERT: ${message}`);
  }

  private getWindowDate(window: string): Date {
    const now = Date.now();
    switch (window) {
      case '10m':
        return new Date(now - 10 * 60 * 1000);
      case '1h':
        return new Date(now - 60 * 60 * 1000);
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000);
      default:
        return new Date(0);
    }
  }
}
