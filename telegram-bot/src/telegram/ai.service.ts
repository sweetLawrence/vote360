import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface AssetAnalysis {
  commentary: string;
  estimated_cost: number;
  reasoning: string;
  crowd_estimate?: number; // rallies only
}

// ── Per-asset-type estimation prompts ─────────────────────────────────────────

function buildPrompt(
  assetType: string,
  candidateName: string,
  location: string,
  region: string,
  eventDate?: string,
): string {
  const dateCtx = eventDate ? `, held on ${eventDate}` : '';

  const instructions: Record<string, string> = {
    rally: `
You are a Kenyan political campaign cost analyst. Analyze this rally photo.

Event: ${candidateName}'s rally in ${location} (${region} region)${dateCtx}.

Tasks:
1. Estimate crowd size by counting visible sections and extrapolating.
2. Calculate total event cost in KES using this formula:

Per-person costs (transport, T-shirts, food/refreshments): KES 800–2,000 per person.

Fixed costs by crowd size:
- Under 500 people:   stage KES 150K, sound KES 80K,  venue/permits KES 50K,  security KES 50K
- 500–2,000:          stage KES 350K, sound KES 200K, venue KES 150K,         security KES 80K
- 2,000–10,000:       stage KES 800K, sound KES 400K, venue KES 300K,         security KES 150K
- 10,000+:            stage KES 2M,   sound KES 1M,   venue KES 600K,         security KES 300K

Add MC/entertainment: KES 50K–500K depending on crowd scale.

Return ONLY valid JSON, no markdown, no backticks:
{"commentary":"<exactly 2 fun Swahili-English sentences about the crowd and energy>","estimated_cost":<total KES as integer>,"crowd_estimate":<number>,"reasoning":"<1 sentence explaining your crowd estimate and cost breakdown>"}`,

    billboard: `
You are a Kenyan outdoor advertising cost analyst. Analyze this campaign billboard photo.

Billboard: ${candidateName}'s campaign in ${location} (${region} region).

Estimate monthly rental + production cost in KES based on what you see:

Size pricing (monthly rental):
- Small (<3m wide, single roadside):      KES 20K–60K
- Medium (3–6m, main road):               KES 80K–200K
- Large (6–12m, major junction):          KES 200K–600K
- Mega/building wrap (>12m or elevated):  KES 600K–2M
- Digital/LED: multiply rental × 2

Production/printing:
- Standard vinyl print:    KES 20K–80K
- High-quality digital:    KES 100K–300K

Multipliers:
- If multiple billboard panels visible: multiply by count
- CBD/highway premium location: × 1.5–2.0

Return ONLY valid JSON, no markdown, no backticks:
{"commentary":"<exactly 2 fun Swahili-English sentences about the billboard>","estimated_cost":<total KES as integer>,"reasoning":"<1 sentence on size, location, and how you arrived at the cost>"}`,

    chopper: `
You are a Kenyan aviation cost analyst. Analyze this campaign helicopter photo.

Helicopter: ${candidateName}'s campaign chopper spotted in ${location}.

Estimate cost per charter day in KES based on the aircraft type you can identify:
- Small piston (Robinson R44/R66, 4-seat):    KES 80K–150K/day
- Medium turbine (Bell 206, 5-seat):           KES 200K–400K/day
- Large turbine (Bell 412, 13-seat):           KES 500K–900K/day
- VIP/Super helicopter (AW139, EC145):        KES 900K–1.5M/day
Add landing/handling fees: KES 10K–50K.
If you can see multiple helicopters, multiply accordingly.

Return ONLY valid JSON, no markdown, no backticks:
{"commentary":"<exactly 2 fun Swahili-English sentences about the chopper>","estimated_cost":<total KES as integer>,"reasoning":"<1 sentence on helicopter type and how you estimated cost>"}`,

    convoy: `
You are a Kenyan logistics cost analyst. Analyze this campaign vehicle convoy photo.

Convoy: ${candidateName}'s campaign vehicles spotted in ${location}.

Count visible vehicles and estimate daily hire + fuel + driver cost in KES:
- Standard saloon/hatchback:   KES 6K–10K/day
- Pickup truck:                KES 10K–18K/day
- Minibus/matatu:              KES 12K–22K/day
- SUV/4WD (Prado, Fortuner):  KES 18K–30K/day
- Luxury V8 SUV (Land Cruiser 200 series): KES 35K–55K/day

Add 15% for fuel coordination and convoy marshalling.
If you can only see part of the convoy, estimate total from what's visible.

Return ONLY valid JSON, no markdown, no backticks:
{"commentary":"<exactly 2 fun Swahili-English sentences about the convoy>","estimated_cost":<total KES as integer>,"reasoning":"<1 sentence on vehicle count and type>"}`,
  };

  return (instructions[assetType] ?? instructions['billboard']).trim();
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private anthropic: Anthropic | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    } else {
      this.logger.warn('ANTHROPIC_API_KEY not set — AI cost estimation will be skipped');
    }
  }

  /**
   * Analyze a campaign asset photo and return a structured cost estimate.
   * Returns null if AI is unavailable or if parsing fails (caller falls back to COST_TABLE).
   */
  async analyzeAsset(
    imageBuffer: Buffer,
    assetType: string,
    candidateName: string,
    location: string,
    region: string,
    eventDate?: string,
  ): Promise<AssetAnalysis | null> {
    if (!this.anthropic) return null;

    const prompt = buildPrompt(assetType, candidateName, location, region, eventDate);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBuffer.toString('base64'),
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

      // Strip markdown fences if the model wraps the JSON anyway
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonStr) as AssetAnalysis;

      // Sanity-check: cost must be a positive number
      if (!parsed.commentary || typeof parsed.estimated_cost !== 'number' || parsed.estimated_cost <= 0) {
        this.logger.warn(`AI returned invalid structure: ${jsonStr}`);
        return null;
      }

      this.logger.log(
        `AI estimate — ${assetType} in ${region}: KES ${parsed.estimated_cost.toLocaleString()} | ${parsed.reasoning}`,
      );

      return parsed;
    } catch (err: any) {
      this.logger.error(`AI analysis failed: ${err.message}`);
      return null;
    }
  }
}
