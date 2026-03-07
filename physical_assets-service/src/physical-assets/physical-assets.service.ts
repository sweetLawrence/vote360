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

    // 5. Determine region; use AI-provided cost if available, otherwise COST_TABLE
    const region: Region = deriveRegion(body.location?.trim());
    const estimatedCost = body.estimated_cost
      ? Math.round(Number(body.estimated_cost))
      : getEstimatedCost(assetType, region);

    // 6. Parse AI analysis and confidence from the bot (if provided)
    let aiAnalysis: object | null = null;
    if (body.ai_analysis) {
      try { aiAnalysis = JSON.parse(body.ai_analysis); } catch { /* malformed — ignore */ }
    }
    const confidenceScore = body.confidence_score ? Number(body.confidence_score) : null;

    this.logger.log(
      `Asset: ${assetType}, region: ${region}, cost: KES ${estimatedCost.toLocaleString()}, ` +
      `confidence: ${confidenceScore ?? 'n/a'}, candidate: ${candidate.name}`,
    );

    // 7. Insert record
    const row: Record<string, any> = {
      candidate_id: candidate.id,
      asset_type: assetType,
      image_url: imageUrl,
      estimated_cost: estimatedCost,
      region,
      location_lat: locationLat ?? null,
      location_lng: locationLng ?? null,
      ...(aiAnalysis     ? { ai_analysis: aiAnalysis }       : {}),
      ...(confidenceScore !== null ? { confidence_score: confidenceScore } : {}),
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

    // 8. Count prior reports for same candidate + asset_type + region
    const { count: priorCountRaw } = await this.supabaseService.client
      .from('physical_assets')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidate.id)
      .eq('asset_type', assetType)
      .eq('region', region);

    const prior_count = Math.max(0, (priorCountRaw ?? 1) - 1);

    // 9. Trigger reconciliation (fire-and-forget)
    await this.reconciliationService.trigger(candidate.id);

    return { ...data, prior_count };
  }

  // ── GET /api/v1/physical/prior-analyses ──────────────────────────────────
  // Returns the last N AI analyses for the same candidate + asset_type + region.
  // Called by the bot BEFORE running AI estimation so the AI can refine its estimate.
  async getPriorAnalyses(
    candidateName: string,
    assetType: string,
    region: string,
    limit = 5,
  ): Promise<any[]> {
    // Resolve candidate id first
    const { data: candidates } = await this.supabaseService.client
      .from('candidates')
      .select('id')
      .ilike('name', `%${candidateName.trim()}%`)
      .limit(1);

    if (!candidates || candidates.length === 0) return [];
    const candidateId = candidates[0].id;

    const { data, error } = await this.supabaseService.client
      .from('physical_assets')
      .select('estimated_cost, confidence_score, ai_analysis, created_at')
      .eq('candidate_id', candidateId)
      .eq('asset_type', assetType)
      .eq('region', region)
      .not('ai_analysis', 'is', null)        // only records with AI analysis
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.warn(`getPriorAnalyses error: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  // ── GET /api/v1/physical/candidates ──────────────────────────────────────
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

  // ── GET /api/v1/physical/:candidateId ────────────────────────────────────
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
