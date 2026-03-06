import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    // Makes process.env vars available everywhere via ConfigService.
    // validating required vars at startup so the bot fails fast on misconfiguration.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config: Record<string, string>) => {
        const required = ['TELEGRAM_BOT_TOKEN', 'API_BASE_URL', 'BOT_SECRET'];
        for (const key of required) {
          if (!config[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
          }
        }
        return config;
      },
    }),
    TelegramModule,
  ],
})
export class AppModule {}
