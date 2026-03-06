import { setDefaultResultOrder } from 'dns';
// Prefer IPv4 addresses — fixes ETIMEDOUT in WSL2 where IPv6 routing to
// external hosts is broken but IPv4 works fine. Must be called before any
// network activity, so it lives at the very top of the entry point.
setDefaultResultOrder('ipv4first');

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Keep an HTTP server running for health checks / container liveness probes.
  // The Telegram bot itself runs via long-polling inside TelegrafModule.
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(`Vote-360 Telegram Bot listening on port ${port}`, 'Bootstrap');
  Logger.log('Bot is active and polling Telegram', 'Bootstrap');
}

bootstrap();
