import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

// @Global so SupabaseService is available in all modules without re-importing
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
