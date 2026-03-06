import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// NestJS equivalent of the database/supabase.js pattern used in Express services.
// Injectable singleton — import SupabaseModule wherever you need the client.
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.getOrThrow<string>('SUPABASE_URL');
    const key = this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY');
    this.supabase = createClient(url, key);
    this.logger.log('Supabase client initialized');
  }

  get client(): SupabaseClient {
    return this.supabase;
  }
}
