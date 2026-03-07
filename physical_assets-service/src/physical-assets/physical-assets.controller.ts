import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PhysicalAssetsService } from './physical-assets.service';
import { UploadAssetDto } from './dto/upload-asset.dto';
import { BotSecretGuard } from '../common/guards/bot-secret.guard';

@Controller('physical')
export class PhysicalAssetsController {
  constructor(private readonly physicalAssetsService: PhysicalAssetsService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/physical/upload
  // Accepts multipart/form-data from the Telegram bot (or any authorised client).
  // Requires: x-bot-secret header
  // Fields: image (file), candidate_name, asset_type, location?, source?,
  //         uploaded_by?, location_lat?, location_lng?
  // ──────────────────────────────────────────────────────────────────────────
  @UseGuards(BotSecretGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB — matches NGINX client_max_body_size
    }),
  )
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadAssetDto,
  ) {
    if (!file) {
      throw new HttpException(
        { error: 'No image uploaded — attach as form-data field "image"' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.physicalAssetsService.uploadAsset(file, body);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/physical/prior-analyses
  // Returns up to 5 prior AI analyses for the same candidate + asset_type + region.
  // Used by the Telegram bot to give the AI refinement context before a new submission.
  // Public — no auth required.
  // IMPORTANT: declared before /:candidateId to avoid route collision.
  // ──────────────────────────────────────────────────────────────────────────
  @Get('prior-analyses')
  async getPriorAnalyses(
    @Query('candidate_name') candidateName: string,
    @Query('asset_type') assetType: string,
    @Query('region') region: string,
  ) {
    if (!candidateName || !assetType || !region) {
      throw new BadRequestException({ error: 'candidate_name, asset_type and region are required' });
    }
    return this.physicalAssetsService.getPriorAnalyses(candidateName, assetType, region);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/physical/candidates
  // Lists all candidates from the candidates table.
  // Used by the Telegram bot for candidate disambiguation when a name is not found.
  // Optional ?constituency= filter.
  // Public — no auth required.
  // IMPORTANT: must be declared before /:candidateId to avoid route collision.
  // ──────────────────────────────────────────────────────────────────────────
  @Get('candidates')
  async getCandidates(@Query('constituency') constituency?: string) {
    return this.physicalAssetsService.getCandidates(constituency);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/physical/:candidateId
  // Returns all physical assets for a candidate with total estimated spend.
  // Public — no auth required.
  // ──────────────────────────────────────────────────────────────────────────
  @Get(':candidateId')
  async getByCandidate(@Param('candidateId') candidateId: string) {
    const id = Number(candidateId);
    if (isNaN(id)) {
      throw new HttpException(
        { error: 'candidateId must be a number' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.physicalAssetsService.getAssets(id);
  }
}
