import { Controller, Get } from '@nestjs/common';

// Excluded from the global /api/v1 prefix — stays at /health
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'physical-assets',
      timestamp: new Date().toISOString(),
    };
  }
}
