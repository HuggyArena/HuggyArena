import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service';

@Module({
  providers: [CollectorService],
  exports: [CollectorService],
})
export class CollectorModule {}
