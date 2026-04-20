import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SignalsService } from './signals.service';
import {
  SignalsQueryDto,
  MarketFilterDto,
  PurchaseSignal,
  MarketSignal,
  TrendPoint,
  DashboardSummary,
} from '../dto/signals.dto';

@ApiTags('signals')
@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get('purchases')
  @ApiOperation({
    summary: 'Purchase signals — real-time bet activity',
    description:
      'Returns a feed of individual bets with user, market, outcome, amount, and timestamp. ' +
      'Use this to track where money is flowing and who is buying.',
  })
  @ApiResponse({ status: 200, type: [PurchaseSignal] })
  async getPurchaseSignals(@Query() query: SignalsQueryDto) {
    return this.signalsService.getPurchaseSignals(
      query.window ?? '24h',
      query.limit ?? 20,
      query.offset ?? 0,
    );
  }

  @Get('markets')
  @ApiOperation({
    summary: 'Market signals — volume, bettor count, top outcomes',
    description:
      'Returns market-level aggregates sorted by total pool size. ' +
      'Identify which prediction markets are attracting the most capital.',
  })
  @ApiResponse({ status: 200, type: [MarketSignal] })
  async getMarketSignals(@Query() query: MarketFilterDto) {
    return this.signalsService.getMarketSignals(
      query.window ?? '24h',
      query.limit ?? 20,
      query.offset ?? 0,
      query.status,
    );
  }

  @Get('trends')
  @ApiOperation({
    summary: 'Volume trends — daily volume, bets, and unique users over time',
    description:
      'Returns time-bucketed trend data for charting volume growth, ' +
      'user acquisition, and average bet size over the selected window.',
  })
  @ApiResponse({ status: 200, type: [TrendPoint] })
  async getTrends(@Query() query: SignalsQueryDto) {
    return this.signalsService.getVolumeTrend(query.window ?? '30d');
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Executive dashboard — all key metrics in one call',
    description:
      'Returns a consolidated view of total volume, revenue, top market, ' +
      'top whale, active markets, and the 30-day volume trend.',
  })
  @ApiResponse({ status: 200, type: DashboardSummary })
  async getDashboard() {
    return this.signalsService.getDashboard();
  }
}
