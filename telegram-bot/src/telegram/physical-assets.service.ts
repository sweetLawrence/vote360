import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as FormData from 'form-data';
import { CandidateInfo } from './session.store';

export type AssetType = 'billboard' | 'rally' | 'chopper' | 'convoy';

export interface UploadAssetParams {
  imageBuffer: Buffer;
  /** Original Telegram file name hint (e.g. "photo_123.jpg") */
  filename: string;
  candidate_name: string;
  asset_type: AssetType;
  location?: string;
  /** Telegram user ID as string */
  uploaded_by: string;
}

export interface UploadResult {
  estimated_cost: number;
  region: string;
  /** Number of previous reports for the same candidate + asset_type + region (excluding this one). */
  prior_count: number;
}

@Injectable()
export class PhysicalAssetsService {
  private readonly logger = new Logger(PhysicalAssetsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Fetch the full candidate list from GET /api/v1/physical/candidates.
   * Returns an empty array on error so the caller can degrade gracefully.
   */
  async listCandidates(): Promise<CandidateInfo[]> {
    const apiBaseUrl = this.configService.getOrThrow<string>('API_BASE_URL');
    const endpoint = `${apiBaseUrl}/api/v1/physical/candidates`;
    try {
      const response = await axios.get<CandidateInfo[]>(endpoint, { timeout: 5000 });
      return response.data;
    } catch (err: any) {
      this.logger.error(`Failed to fetch candidate list: ${err.message}`);
      return [];
    }
  }

  /** Download a file from a URL with retry logic and exponential backoff. */
  async downloadFile(url: string, maxRetries = 3): Promise<Buffer> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });
        return Buffer.from(response.data);
      } catch (err) {
        lastError = err as Error;
        const axiosErr = err as AxiosError;

        if (axiosErr.response?.status && axiosErr.response.status >= 400 && axiosErr.response.status < 500) {
          throw new Error(`Failed to download file (HTTP ${axiosErr.response.status}). The file may not exist.`);
        }

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          this.logger.warn(
            `Download attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to download file after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * POST the photo + metadata to POST /api/v1/physical/upload.
   * Returns estimated_cost, region, and prior_count from the backend response.
   */
  async uploadAsset(params: UploadAssetParams): Promise<UploadResult> {
    const form = new FormData();

    form.append('image', params.imageBuffer, {
      filename: params.filename,
      contentType: 'image/jpeg',
    });
    form.append('candidate_name', params.candidate_name);
    form.append('asset_type', params.asset_type);
    if (params.location) {
      form.append('location', params.location);
    }
    form.append('source', 'telegram');
    form.append('uploaded_by', params.uploaded_by);

    const apiBaseUrl = this.configService.getOrThrow<string>('API_BASE_URL');
    const botSecret = this.configService.getOrThrow<string>('BOT_SECRET');
    const endpoint = `${apiBaseUrl}/api/v1/physical/upload`;

    this.logger.log(
      `Uploading asset — candidate: "${params.candidate_name}", type: ${params.asset_type}, user: ${params.uploaded_by}`,
    );

    try {
      const response = await axios.post<UploadResult>(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          'x-bot-secret': botSecret,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      this.logger.log(`Upload successful for user ${params.uploaded_by}`);
      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;
      const body = axiosErr.response?.data;

      this.logger.error(
        `Upload failed — status: ${status ?? 'no response'}, body: ${JSON.stringify(body)}`,
        axiosErr.stack,
      );

      if (status && status >= 400 && status < 500) {
        throw new Error(`The Physical Assets Service rejected the upload (${status}). Check your service logs.`);
      }
      throw new Error('The Physical Assets Service is unavailable. Please try again shortly.');
    }
  }
}
