import { Controller, Get, Post, Patch, Query, Body, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam } from '@nestjs/swagger';
import { AlertsService, AlertRule, AlertType } from './alerts.service';
import { IsString, IsNumber, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class CreateAlertRuleDto {
  @IsString() name!: string;
  @IsEnum([
    'whale_bet',
    'volume_spike',
    'new_market',
    'revenue_milestone',
    'large_position',
    'rapid_betting',
  ])
  type!: AlertType;
  @IsNumber() @Type(() => Number) threshold!: number;
  @IsString() window!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

class ToggleRuleDto {
  @IsBoolean() enabled!: boolean;
}

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('rules')
  @ApiOperation({ summary: 'List all alert rules' })
  getRules() {
    return this.alertsService.getRules();
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a new alert rule' })
  @ApiBody({ type: CreateAlertRuleDto })
  createRule(@Body() dto: CreateAlertRuleDto): AlertRule {
    return this.alertsService.addRule({
      name: dto.name,
      type: dto.type,
      threshold: dto.threshold,
      window: dto.window,
      enabled: dto.enabled ?? true,
    });
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Enable or disable an alert rule' })
  @ApiParam({ name: 'id', description: 'Rule ID' })
  toggleRule(@Param('id') id: string, @Body() dto: ToggleRuleDto) {
    const rule = this.alertsService.toggleRule(id, dto.enabled);
    if (!rule) throw new NotFoundException('Rule not found');
    return rule;
  }

  @Get('fired')
  @ApiOperation({
    summary: 'Get recently fired alerts',
    description: 'Returns the most recent alerts triggered by active rules.',
  })
  getFiredAlerts(@Query('limit') limit?: number) {
    return this.alertsService.getAlerts(limit ?? 50);
  }

  @Patch('fired/:id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge a fired alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  acknowledgeAlert(@Param('id') id: string) {
    const success = this.alertsService.acknowledgeAlert(id);
    if (!success) throw new NotFoundException('Alert not found');
    return { acknowledged: true };
  }
}
