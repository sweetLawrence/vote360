import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

// Validates x-bot-secret header against the BOT_SECRET env var.
// Used to authenticate requests from the Telegram bot.
@Injectable()
export class BotSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-bot-secret'] as string | undefined;
    const expected = process.env.BOT_SECRET;

    if (!expected || provided !== expected) {
      throw new UnauthorizedException({
        error: 'Unauthorized — missing or invalid x-bot-secret',
      });
    }

    return true;
  }
}
