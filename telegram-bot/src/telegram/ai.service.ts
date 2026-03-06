import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';

const ASSET_DESC: Record<string, string> = {
  billboard: 'a campaign billboard/signboard',
  rally:     'a political campaign rally or crowd gathering',
  chopper:   'a campaign helicopter',
  convoy:    'a campaign vehicle convoy',
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      this.logger.warn('GEMINI_API_KEY not set — AI photo analysis will be skipped');
    }
  }

  /**
   * Analyze a campaign asset photo using Gemini 2.0 Flash vision.
   * Returns a fun Sheng/Swahili+English comment, or null if AI is unavailable.
   */
  async analyzeAsset(
    imageBuffer: Buffer,
    assetType: string,
    candidateName: string,
    region: string,
  ): Promise<string | null> {
    if (!this.genAI) return null;

    const desc = ASSET_DESC[assetType] ?? assetType;

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const imagePart: Part = {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBuffer.toString('base64'),
        },
      };

      const prompt = [
        `You are a witty Kenyan election transparency observer reviewing a citizen-submitted photo.`,
        `The photo shows ${desc} for ${candidateName}'s campaign in the ${region} area.`,
        `Write exactly 2 short sentences commenting on what you see, mixing casual Kenyan Swahili and English (Sheng welcome!).`,
        `Be fun, engaging and observational. Do NOT invent cost figures. Do NOT use hashtags or asterisks.`,
      ].join(' ');

      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text().trim();
      return text || null;
    } catch (err: any) {
      this.logger.error(`Gemini analysis failed: ${err.message}`);
      return null;
    }
  }
}
