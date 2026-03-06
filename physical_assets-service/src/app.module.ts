import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { SupabaseModule } from './supabase/supabase.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { PhysicalAssetsModule } from './physical-assets/physical-assets.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: (config: Record<string, string>) => {
        const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BOT_SECRET'];
        for (const key of required) {
          if (!config[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
          }
        }
        return config;
      },
    }),
    SupabaseModule,
    ReconciliationModule,
    PhysicalAssetsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
