import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CustomerFilterDto, WhaleFilterDto } from '../dto/signals.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('profiles')
  @ApiOperation({
    summary: 'Customer profiles — lifetime metrics with segmentation',
    description:
      'Returns customer profiles with total wagered, bet count, win rate, ' +
      'average bet size, and segment classification (whale/power/regular/casual).',
  })
  async getProfiles(@Query() query: CustomerFilterDto) {
    return this.customersService.getCustomerProfiles(
      query.limit ?? 20,
      query.offset ?? 0,
      query.minWagered,
      query.kycStatus,
    );
  }

  @Get('segments')
  @ApiOperation({
    summary: 'Customer segmentation summary — count and volume per segment',
    description:
      'Whale (>=$5K), Power (>=$1K), Regular (>=$100), Casual (<$100). ' +
      'Shows count and total volume contribution per segment.',
  })
  async getSegments() {
    return this.customersService.getSegmentSummary();
  }

  @Get('whales')
  @ApiOperation({
    summary: 'Whale tracker — top spenders with recent activity',
    description:
      'Identifies users with large single bets above the threshold. ' +
      'Returns their total wagered, largest bet, favorite market, and recent bets.',
  })
  async getWhales(@Query() query: WhaleFilterDto) {
    return this.customersService.getWhaleActivity(
      query.limit ?? 20,
      query.minBetAmount ?? 1000,
    );
  }
}
