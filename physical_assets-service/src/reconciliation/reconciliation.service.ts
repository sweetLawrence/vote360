import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

// Fire-and-forget POST to the Reconciliation Engine.
// Matches the triggerReconciliation() pattern in donor and digital services:
// errors are caught and logged — never thrown — so they never block the caller.
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly configService: ConfigService) {}

  async trigger(candidateId: number): Promise<void> {
    const url = this.configService.get<string>('RECONCILIATION_URL');

    if (!url) {
      this.logger.warn('RECONCILIATION_URL not set — skipping reconciliation trigger');
      return;
    }

    try {
      await axios.post(`${url}/${candidateId}`);
      this.logger.log(`Reconciliation triggered for candidate ${candidateId}`);
    } catch (err: any) {
      this.logger.error(
        `Reconciliation trigger failed for candidate ${candidateId}: ${err.message}`,
      );
    }
  }
}
