import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RevenueService } from './revenue.service';
import { SignalsQueryDto, RevenueSnapshot } from '../dto/signals.dto';

@ApiTags('revenue')
@Controller('revenue')
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Get('snapshot')
  @ApiOperation({
    summary: 'Revenue snapshot — protocol fees, creator fees, dispute reserve',
    description:
      'Returns aggregated revenue metrics derived from the 5% total fee structure: ' +
      '2.75% protocol, 1.00% creator, 0.50% referral, 0.75% dispute reserve.',
  })
  @ApiResponse({ status: 200, type: RevenueSnapshot })
  async getSnapshot(@Query() query: SignalsQueryDto) {
    return this.revenueService.getRevenueSnapshot(query.window ?? '24h');
  }

  @Get('breakdown')
  @ApiOperation({
    summary: 'Full fee breakdown — every fee category with net distributable pool',
  })
  async getBreakdown(@Query() query: SignalsQueryDto) {
    return this.revenueService.getRevenueBreakdown(query.window ?? '24h');
  }

  @Get('creators')
  @ApiOperation({
    summary: 'Creator revenue leaderboard — top creators by market volume and fee earnings',
  })
  async getCreatorRevenue(@Query() query: SignalsQueryDto) {
    return this.revenueService.getCreatorRevenue(query.limit ?? 20);
  }

  @Get('relay')
  @ApiOperation({
    summary: 'Relay transaction stats — gasless relay volume and status breakdown',
  })
  async getRelayStats(@Query() query: SignalsQueryDto) {
    return this.revenueService.getRelayStats(query.window ?? '24h');
  }
}
