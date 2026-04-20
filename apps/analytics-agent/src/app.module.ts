import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@arena/shared-prisma';
import { ApiKeyGuard } from './guards/api-key.guard';
import { HealthController } from './health.controller';
import { SignalsModule } from './signals/signals.module';
import { CollectorModule } from './collector/collector.module';
import { RevenueModule } from './revenue/revenue.module';
import { CustomersModule } from './customers/customers.module';
import { AlertsModule } from './alerts/alerts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SignalsModule,
    CollectorModule,
    RevenueModule,
    CustomersModule,
    AlertsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
