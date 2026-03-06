import { Module } from '@nestjs/common';
import { PhysicalAssetsController } from './physical-assets.controller';
import { PhysicalAssetsService } from './physical-assets.service';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

@Module({
  imports: [ReconciliationModule],
  controllers: [PhysicalAssetsController],
  providers: [PhysicalAssetsService],
})
export class PhysicalAssetsModule {}
