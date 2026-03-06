import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { UploadAssetDto } from './dto/upload-asset.dto';
import {
  AssetType,
  Region,
  VALID_ASSET_TYPES,
  getEstimatedCost,
  deriveRegion,
} from './valuation';

@Injectable()
export class PhysicalAssetsService {
  private readonly logger = new Logger(PhysicalAssetsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  // ── POST /api/v1/physical/upload ──────────────────────────────────────────
  async uploadAsset(
    file: Express.Multer.File,
    body: UploadAssetDto,
  ): Promise<any> {
    // 1. Validate required fields
    if (!body.candidate_name?.trim()) {
      throw new HttpException(
        { error: 'candidate_name is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const assetType = body.asset_type?.toLowerCase().trim() as AssetType;
    if (!VALID_ASSET_TYPES.includes(assetType)) {
      throw new HttpException(
        { error: `asset_type must be one of: ${VALID_ASSET_TYPES.join(', ')}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Look up candidate by name — case-insensitive partial match
    const { data: candidates, error: candError } = await this.supabaseService.client
      .from('candidates')
      .select('id, name')
      .ilike('name', `%${body.candidate_name.trim()}%`)
      .limit(1);

    if (candError) {
      throw new HttpException(
        { error: 'Database error', detail: candError.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (!candidates || candidates.length === 0) {
      throw new HttpException(
        { error: `Candidate "${body.candidate_name}" not found` },
        HttpStatus.NOT_FOUND,
      );
    }

    const candidate = candidates[0];

    // 3. Upload image to Supabase Storage bucket "campaign-assets"
    const filename = `${Date.now()}-${file.originalname}`;
    const { error: uploadError } = await this.supabaseService.client.storage
      .from('campaign-assets')
      .upload(filename, file.buffer, {
        contentType: file.mimetype ?? 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      throw new HttpException(
        { error: 'Image upload to storage failed', detail: uploadError.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const { data: urlData } = this.supabaseService.client.storage
      .from('campaign-assets')
      .getPublicUrl(filename);

    const imageUrl = urlData.publicUrl;

    // 4. Best-effort EXIF GPS extraction
    // Only used if location_lat/lng not explicitly provided in the request
    let locationLat: number | null = body.location_lat ? Number(body.location_lat) : null;
    let locationLng: number | null = body.location_lng ? Number(body.location_lng) : null;

    if (!locationLat || !locationLng) {
      try {
        const exifr = (await import('exifr')) as any;
        const gps = await exifr.default.gps(file.buffer);
        if (gps?.latitude && gps?.longitude) {
          locationLat = gps.latitude;
          locationLng = gps.longitude;
          this.logger.log(`EXIF GPS extracted for candidate ${candidate.id}: ${locationLat}, ${locationLng}`);
        }
      } catch {
        // EXIF extraction is best-effort — ignore all errors
      }
    }

    // 5. Determine region from location string → look up estimated_cost
    const region: Region = deriveRegion(body.location?.trim());
    const estimatedCost = getEstimatedCost(assetType, region);

    this.logger.log(
      `Asset: ${assetType}, region: ${region}, cost: KES ${estimatedCost.toLocaleString()}, candidate: ${candidate.name}`,
    );

    // 6. Insert into physical_assets — columns match the actual Supabase table schema:
    // id, created_at (auto), candidate_id, asset_type, image_url,
    // location_lat, location_lng, region, estimated_cost
    const row = {
      candidate_id: candidate.id,
      asset_type: assetType,
      image_url: imageUrl,
      estimated_cost: estimatedCost,
      region,
      location_lat: locationLat ?? null,
      location_lng: locationLng ?? null,
    };

    const { data, error: insertError } = await this.supabaseService.client
      .from('physical_assets')
      .insert(row)
      .select()
      .single();

    if (insertError) {
      throw new HttpException(
        { error: 'Database insert failed', detail: insertError.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 7. Count prior reports for same candidate + asset_type + region (for duplicate awareness)
    const { count: priorCountRaw } = await this.supabaseService.client
      .from('physical_assets')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidate.id)
      .eq('asset_type', assetType)
      .eq('region', region);

    const prior_count = Math.max(0, (priorCountRaw ?? 1) - 1);

    // 8. Trigger reconciliation (fire-and-forget — never blocks the response)
    await this.reconciliationService.trigger(candidate.id);

    return { ...data, prior_count };
  }

  // ── GET /api/v1/physical/candidates ────────────────────────────────────────
  // Lists candidates directly from the candidates table.
  // Used by the Telegram bot for candidate disambiguation.
  // Optional ?constituency= filter to narrow results.
  async getCandidates(constituency?: string): Promise<any[]> {
    let query = this.supabaseService.client
      .from('candidates')
      .select('id, name, party, position, constituency')
      .order('name', { ascending: true });

    if (constituency) {
      query = query.eq('constituency', constituency);
    }

    const { data, error } = await query;
    if (error) {
      throw new HttpException(
        { error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return data ?? [];
  }

  // ── GET /api/v1/physical/:candidateId ──────────────────────────────────────
  async getAssets(candidateId: number): Promise<any> {
    const { data, error } = await this.supabaseService.client
      .from('physical_assets')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new HttpException(
        { error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const assets = data ?? [];
    const totalEstimatedSpend = assets.reduce(
      (sum, a) => sum + Number(a.estimated_cost),
      0,
    );

    return {
      candidate_id: candidateId,
      total_estimated_spend: totalEstimatedSpend,
      asset_count: assets.length,
      assets,
    };
  }
}
