import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum TimeWindow {
  HOUR = '1h',
  DAY = '24h',
  WEEK = '7d',
  MONTH = '30d',
  ALL = 'all',
}

export enum SortBy {
  VOLUME = 'volume',
  AMOUNT = 'amount',
  RECENCY = 'recency',
  FREQUENCY = 'frequency',
}

export class SignalsQueryDto {
  @ApiPropertyOptional({ enum: TimeWindow, default: TimeWindow.DAY })
  @IsOptional()
  @IsEnum(TimeWindow)
  window?: TimeWindow;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  @ApiPropertyOptional({ enum: SortBy, default: SortBy.RECENCY })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy;
}

export class MarketFilterDto extends SignalsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by market status (OPEN, LOCKED, RESOLVED, etc.)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by creator ID' })
  @IsOptional()
  @IsString()
  creatorId?: string;
}

export class CustomerFilterDto extends SignalsQueryDto {
  @ApiPropertyOptional({ description: 'Minimum total wagered amount (USDC)' })
  @IsOptional()
  @Type(() => Number)
  minWagered?: number;

  @ApiPropertyOptional({ description: 'Filter by KYC status' })
  @IsOptional()
  @IsString()
  kycStatus?: string;
}

export class WhaleFilterDto extends SignalsQueryDto {
  @ApiPropertyOptional({
    description: 'Minimum single bet amount to qualify as whale (USDC)',
    default: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  minBetAmount?: number;
}

/** Response types */

export class PurchaseSignal {
  @ApiProperty() betId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() walletAddress!: string | null;
  @ApiProperty() marketId!: string;
  @ApiProperty() marketTitle!: string;
  @ApiProperty() outcomeLabel!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() oddsAtBet!: string | null;
  @ApiProperty() timestamp!: string;
}

export class MarketSignal {
  @ApiProperty() marketId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: string;
  @ApiProperty() totalPool!: string;
  @ApiProperty() betCount!: number;
  @ApiProperty() uniqueBettors!: number;
  @ApiProperty() topOutcome!: string;
  @ApiProperty() topOutcomePool!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() closeTime!: string;
}

export class RevenueSnapshot {
  @ApiProperty() totalProtocolFees!: string;
  @ApiProperty() totalCreatorFees!: string;
  @ApiProperty() totalDisputeReserve!: string;
  @ApiProperty() totalPoolVolume!: string;
  @ApiProperty() marketCount!: number;
  @ApiProperty() betCount!: number;
  @ApiProperty() periodStart!: string;
  @ApiProperty() periodEnd!: string;
}

export class CustomerProfile {
  @ApiProperty() userId!: string;
  @ApiProperty() walletAddress!: string | null;
  @ApiProperty() displayName!: string | null;
  @ApiProperty() totalWagered!: string;
  @ApiProperty() totalBets!: number;
  @ApiProperty() uniqueMarkets!: number;
  @ApiProperty() avgBetSize!: string;
  @ApiProperty() winRate!: number;
  @ApiProperty() firstBet!: string;
  @ApiProperty() lastBet!: string;
  @ApiProperty() segment!: string;
}

export class WhaleActivity {
  @ApiProperty() userId!: string;
  @ApiProperty() walletAddress!: string | null;
  @ApiProperty() totalWagered!: string;
  @ApiProperty() largestBet!: string;
  @ApiProperty() betCount!: number;
  @ApiProperty() favoriteMarket!: string;
  @ApiProperty() recentBets!: PurchaseSignal[];
}

export class TrendPoint {
  @ApiProperty() period!: string;
  @ApiProperty() volume!: string;
  @ApiProperty() betCount!: number;
  @ApiProperty() uniqueUsers!: number;
  @ApiProperty() avgBetSize!: string;
}

export class DashboardSummary {
  @ApiProperty() totalVolume!: string;
  @ApiProperty() totalBets!: number;
  @ApiProperty() totalUsers!: number;
  @ApiProperty() activeMarkets!: number;
  @ApiProperty() estimatedRevenue!: string;
  @ApiProperty() topMarketByVolume!: MarketSignal | null;
  @ApiProperty() topWhale!: WhaleActivity | null;
  @ApiProperty() volumeTrend!: TrendPoint[];
}
