import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PriorAnalysis } from './physical-assets.service';

export interface AssetAnalysis {
  commentary: string;
  estimated_cost: number;
  confidence_score: number;  // 0.0–1.0
  reasoning: string;
  crowd_estimate?: number;   // rallies only
}

// ── Prior context block (injected into every prompt when data exists) ─────────

function buildPriorContext(priors: PriorAnalysis[]): string {
  if (priors.length === 0) return '';

  const lines = priors.map((p, i) => {
    const conf = p.confidence_score != null ? ` (confidence: ${p.confidence_score.toFixed(2)})` : '';
    const reason = p.ai_analysis?.reasoning ?? 'No reasoning stored';
    const crowd = p.ai_analysis?.crowd_estimate ? `, crowd ~${p.ai_analysis.crowd_estimate}` : '';
    return `  Report ${i + 1}: KES ${p.estimated_cost.toLocaleString()}${conf}${crowd} — ${reason}`;
  });

  return [
    '',
    `PRIOR ANALYSES (${priors.length} previous report${priors.length > 1 ? 's' : ''} for the same candidate + asset type + area):`,
    ...lines,
    '',
    'Use these as your starting anchor. If this photo shows the SAME asset, refine rather than reinvent.',
    'If this appears to be a DIFFERENT asset, note that and analyse independently.',
    'Your confidence_score should be HIGHER (0.75–0.95) if your estimate aligns with prior reports,',
    'and LOWER (0.35–0.60) if you see something significantly different.',
  ].join('\n');
}

// ── Per-asset prompts ─────────────────────────────────────────────────────────

function buildPrompt(
  assetType: string,
  candidateName: string,
  location: string,
  region: string,
  eventDate?: string,
  priors: PriorAnalysis[] = [],
): string {
  const dateCtx = eventDate ? `, held on ${eventDate}` : '';
  const priorCtx = buildPriorContext(priors);

  const instructions: Record<string, string> = {

    rally: `
You are a Kenyan political campaign cost analyst with vision capabilities.

Event: ${candidateName}'s rally in ${location} (${region} region)${dateCtx}.
${priorCtx}

Analyze the photo and estimate the total event cost in KES:

1. CROWD SIZE: Count visible sections and extrapolate. Factor in depth of crowd and off-camera attendance.

2. COST FORMULA — per-person costs (transport, T-shirts, food/refreshments): KES 800–2,000/person.
   Fixed costs by crowd size:
   - Under 500:       stage KES 150K, sound KES 80K,  venue KES 50K,  security KES 50K
   - 500–2,000:       stage KES 350K, sound KES 200K, venue KES 150K, security KES 80K
   - 2,000–10,000:    stage KES 800K, sound KES 400K, venue KES 300K, security KES 150K
   - Over 10,000:     stage KES 2M,   sound KES 1M,   venue KES 600K, security KES 300K
   Add MC/entertainment: KES 50K–500K depending on scale.

3. CONFIDENCE: 0.5 if image is unclear/crowd hard to see, 0.7 if crowd is clearly visible, 0.85+ if this corroborates prior reports.

Return ONLY valid JSON (no markdown, no backticks):
{"commentary":"<exactly 2 fun Swahili-English sentences about the crowd and energy>","estimated_cost":<KES integer>,"crowd_estimate":<integer>,"confidence_score":<0.0-1.0>,"reasoning":"<1 sentence: crowd estimate × cost formula = total>"}`,

    billboard: `
You are a Kenyan outdoor advertising cost analyst with vision capabilities.

Billboard: ${candidateName}'s campaign in ${location} (${region} region).
${priorCtx}

Estimate monthly rental + production cost in KES from the photo:

SIZE & RENTAL (per month):
- Small (<3m wide, roadside):            KES 20K–60K
- Medium (3–6m, main road):              KES 80K–200K
- Large (6–12m, major junction):         KES 200K–600K
- Mega/building wrap (>12m/elevated):    KES 600K–2M
- Digital/LED: multiply rental × 2

PRODUCTION: Standard vinyl KES 20K–80K | High-quality/digital KES 100K–300K
MULTIPLIERS: Multiple panels visible → multiply by count. CBD/highway premium → × 1.5–2.

CONFIDENCE: 0.5 if photo angle obscures size, 0.75 if size is clear, 0.85+ if corroborates priors.

Return ONLY valid JSON (no markdown, no backticks):
{"commentary":"<exactly 2 fun Swahili-English sentences about the billboard>","estimated_cost":<KES integer>,"confidence_score":<0.0-1.0>,"reasoning":"<1 sentence: size + location + any multipliers applied>"}`,

    chopper: `
You are a Kenyan aviation cost analyst with vision capabilities.

Helicopter: ${candidateName}'s campaign chopper in ${location}.
${priorCtx}

Estimate cost per charter day in KES based on the aircraft visible:
- Small piston (Robinson R44/R66, 4-seat):   KES 80K–150K/day
- Medium turbine (Bell 206, 5-seat):          KES 200K–400K/day
- Large turbine (Bell 412, 13-seat):          KES 500K–900K/day
- VIP (AW139, EC145, or similar):             KES 900K–1.5M/day
Add landing/handling fees KES 10K–50K. Multiple choppers → multiply.

CONFIDENCE: 0.5 if helicopter type unclear, 0.75 if identifiable, 0.9 if corroborates priors.

Return ONLY valid JSON (no markdown, no backticks):
{"commentary":"<exactly 2 fun Swahili-English sentences about the chopper>","estimated_cost":<KES integer>,"confidence_score":<0.0-1.0>,"reasoning":"<1 sentence: aircraft type and day-rate applied>"}`,

    convoy: `
You are a Kenyan logistics cost analyst with vision capabilities.

Convoy: ${candidateName}'s campaign vehicles in ${location}.
${priorCtx}

Count visible vehicles and estimate one-day hire + fuel + driver cost in KES:
- Standard saloon:            KES 6K–10K/day
- Pickup truck:               KES 10K–18K/day
- Minibus/matatu:             KES 12K–22K/day
- SUV/4WD (Prado, Fortuner): KES 18K–30K/day
- Luxury V8 SUV (LC200):     KES 35K–55K/day
Add 15% for fuel coordination. If only part of convoy is visible, extrapolate from what you see.

CONFIDENCE: 0.5 if vehicle types unclear, 0.7 if clearly countable, 0.85+ if corroborates priors.

Return ONLY valid JSON (no markdown, no backticks):
{"commentary":"<exactly 2 fun Swahili-English sentences about the convoy>","estimated_cost":<KES integer>,"confidence_score":<0.0-1.0>,"reasoning":"<1 sentence: vehicle count + types + daily rate>"}`,
  };

  return (instructions[assetType] ?? instructions['billboard']).trim();
}

// ── Service ───────────────────────────────────────────────────────────────────

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
   * If priorAnalyses are supplied the AI uses them as a refinement anchor.
   * Returns null if AI is unavailable or parsing fails — caller falls back to COST_TABLE.
   */
  async analyzeAsset(
    imageBuffer: Buffer,
    assetType: string,
    candidateName: string,
    location: string,
    region: string,
    eventDate?: string,
    priorAnalyses: PriorAnalysis[] = [],
  ): Promise<AssetAnalysis | null> {
    if (!this.anthropic) return null;

    const prompt = buildPrompt(assetType, candidateName, location, region, eventDate, priorAnalyses);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 450,
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
              { type: 'text', text: prompt },
            ],
          },
        ],
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonStr) as AssetAnalysis;

      if (!parsed.commentary || typeof parsed.estimated_cost !== 'number' || parsed.estimated_cost <= 0) {
        this.logger.warn(`AI returned invalid structure: ${jsonStr}`);
        return null;
      }

      // Clamp confidence to valid range
      parsed.confidence_score = Math.min(1, Math.max(0, parsed.confidence_score ?? 0.5));

      const priorNote = priorAnalyses.length > 0 ? ` | refined from ${priorAnalyses.length} prior report(s)` : '';
      this.logger.log(
        `AI estimate — ${assetType} in ${region}: KES ${parsed.estimated_cost.toLocaleString()} ` +
        `(confidence: ${parsed.confidence_score.toFixed(2)}${priorNote}) | ${parsed.reasoning}`,
      );

      return parsed;
    } catch (err: any) {
      this.logger.error(`AI analysis failed: ${err.message}`);
      return null;
    }
  }
}
