import { Logger } from '@nestjs/common';
import { Action, Command, Ctx, On, Start, Update } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { PhysicalAssetsService, AssetType } from './physical-assets.service';
import { SessionStore, CandidateInfo, SessionReport } from './session.store';
import { AiService } from './ai.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_DISPLAY: Record<string, string> = {
  billboard: 'Billboard',
  rally:     'Rally',
  chopper:   'Chopper',
  convoy:    'Convoy',
};

const ASSET_KEYBOARD = Markup.inlineKeyboard([
  [Markup.button.callback('🪧 Billboard', 'asset_billboard')],
  [Markup.button.callback('📢 Rally',     'asset_rally')],
  [Markup.button.callback('🚁 Chopper',   'asset_chopper')],
  [Markup.button.callback('🚗 Convoy',    'asset_convoy')],
]);

const MORE_KEYBOARD = Markup.inlineKeyboard([
  [Markup.button.callback('📸 Ndiyo, nina nyingine!', 'more_yes')],
  [Markup.button.callback('✅ Nimemaliza', 'more_no')],
]);

const WELCOME_MESSAGE = `🇰🇪 Welcome to Vote-Trace Kenya!

Uko na evidence ya campaign spending? Billboards, rallies, choppers, convoys — snap a photo na utusaidie ku-track where the money is going.

🔍 How it works:
Send us a photo of any campaign asset you spot. We'll ask a few quick questions to help us estimate the real cost accurately.

📸 Ready? Send a photo to get started!

Your report stays anonymous. Together, tunaweza demand transparency. ✊`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKES(amount: number): string {
  if (amount >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)     return `KES ${(amount / 1_000).toFixed(0)}K`;
  return `KES ${amount.toLocaleString()}`;
}

function matchCandidates(candidates: CandidateInfo[], search: string): CandidateInfo[] {
  const s = search.toLowerCase().trim();
  return candidates.filter(
    (c) => c.name.toLowerCase().includes(s) || s.includes(c.name.toLowerCase()),
  );
}

function constituencyKeyboard(candidates: CandidateInfo[]) {
  const unique = [...new Set(candidates.map((c) => c.constituency).filter(Boolean))].sort();
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < unique.length; i += 2) {
    const row = [Markup.button.callback(unique[i], `const_${unique[i]}`)];
    if (unique[i + 1]) row.push(Markup.button.callback(unique[i + 1], `const_${unique[i + 1]}`));
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

function candidateKeyboard(candidates: CandidateInfo[]) {
  return Markup.inlineKeyboard(
    candidates.map((c) => {
      const label = c.party ? `${c.name} (${c.party})` : c.name;
      return [Markup.button.callback(label, `cand_${c.id}`)];
    }),
  );
}

function buildSummary(reports: SessionReport[]): string {
  if (reports.length === 0) return 'Haujareport chochote bado. Tuma photo kuanza! 📸';

  const total = reports.reduce((sum, r) => sum + r.estimatedCost, 0);
  const lines = reports.map((r, i) => {
    const asset = ASSET_DISPLAY[r.assetType] ?? r.assetType;
    return `${i + 1}. ${asset} — ${r.candidateName}, ${r.location} (${formatKES(r.estimatedCost)})`;
  });

  return [
    `📊 Session Summary — Assets Ulizoreport (${reports.length}):`,
    '',
    ...lines,
    '',
    `💰 Total Estimated Campaign Spend: ${formatKES(total)}`,
    '',
    `Asante sana! Umesaidia transparency ya uchaguzi wa Kenya. ✊🇰🇪`,
    `Your reports are anonymous and make a real difference.`,
  ].join('\n');
}

// ─── Update handler ───────────────────────────────────────────────────────────

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    private readonly physicalAssetsService: PhysicalAssetsService,
    private readonly sessionStore: SessionStore,
    private readonly aiService: AiService,
  ) {}

  // ── /start ──────────────────────────────────────────────────────────────────
  @Start()
  async onStart(@Ctx() ctx: Context) {
    this.sessionStore.delete(ctx.chat!.id);
    await ctx.reply(WELCOME_MESSAGE);
  }

  // ── /cancel ─────────────────────────────────────────────────────────────────
  @Command('cancel')
  async onCancel(@Ctx() ctx: Context) {
    this.sessionStore.delete(ctx.chat!.id);
    await ctx.reply("Report cancelled. Send a new photo whenever you're ready. 📸");
  }

  // ── /summary ─────────────────────────────────────────────────────────────────
  @Command('summary')
  async onSummary(@Ctx() ctx: Context) {
    const session = this.sessionStore.get(ctx.chat!.id);
    await ctx.reply(buildSummary(session?.sessionReports ?? []));
  }

  // ── Photo received ───────────────────────────────────────────────────────────
  @On('photo')
  async onPhoto(@Ctx() ctx: Context) {
    if (!ctx.message || !('photo' in ctx.message)) return;

    const message = ctx.message as Message.PhotoMessage;
    const chatId = ctx.chat!.id;
    const photoFileId = message.photo[message.photo.length - 1].file_id;

    // Preserve sessionReports across multi-photo flow
    const existing = this.sessionStore.get(chatId);
    const sessionReports = existing?.sessionReports ?? [];

    this.sessionStore.set(chatId, { step: 'awaiting_asset_type', photoFileId, sessionReports });

    const prompt = sessionReports.length > 0
      ? `Nice 📸! Asset #${sessionReports.length + 1} — What did you spot?`
      : 'Nice 📸! What did you spot?';

    await ctx.reply(prompt, ASSET_KEYBOARD);
  }

  // ── Asset type selected ──────────────────────────────────────────────────────
  @Action(/^asset_/)
  async onAssetType(@Ctx() ctx: Context) {
    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);

    if (!session) {
      await ctx.answerCbQuery('Session expired — send a new photo to start again', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    const cbData = (ctx.callbackQuery as { data?: string })?.data ?? '';
    const assetType = cbData.replace('asset_', '');
    const assetDisplay = ASSET_DISPLAY[assetType] ?? assetType;

    this.sessionStore.set(chatId, { ...session, step: 'awaiting_candidate', assetType });

    try { await ctx.editMessageText(`Nice 📸! You spotted: ${assetDisplay} ✓`); } catch { /* stale msg */ }

    await ctx.reply("Which candidate's campaign is this for?");
  }

  // ── Constituency selected ────────────────────────────────────────────────────
  @Action(/^const_/)
  async onConstituency(@Ctx() ctx: Context) {
    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);

    if (!session || session.step !== 'awaiting_constituency') {
      await ctx.answerCbQuery('Session expired — send a new photo to start again', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    const constituency = ((ctx.callbackQuery as { data?: string })?.data ?? '').replace('const_', '');
    const inConstituency = (session.allCandidates ?? []).filter((c) => c.constituency === constituency);

    try { await ctx.editMessageText(`Constituency: ${constituency} ✓`); } catch { /* stale */ }

    if (inConstituency.length === 0) {
      await ctx.reply(`Couldn't find candidates in ${constituency}. Send a new photo to try again. 📸`);
      this.sessionStore.delete(chatId);
      return;
    }

    await ctx.reply(`Who is the candidate in ${constituency}?`, candidateKeyboard(inConstituency));
  }

  // ── Candidate confirmed ──────────────────────────────────────────────────────
  @Action(/^cand_/)
  async onCandidateSelect(@Ctx() ctx: Context) {
    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);

    if (!session || session.step !== 'awaiting_constituency') {
      await ctx.answerCbQuery('Session expired — send a new photo to start again', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    const candidateId = Number(((ctx.callbackQuery as { data?: string })?.data ?? '').replace('cand_', ''));
    const candidate = (session.allCandidates ?? []).find((c) => c.id === candidateId);

    if (!candidate) {
      await ctx.reply('Could not find that candidate. Send a new photo to start again. 📸');
      this.sessionStore.delete(chatId);
      return;
    }

    this.sessionStore.set(chatId, { ...session, step: 'awaiting_location', confirmedCandidateName: candidate.name });

    try { await ctx.editMessageText(`Candidate: ${candidate.name} ✓`); } catch { /* stale */ }

    await ctx.reply('📍 Where was this? Share your location or type the area name.');
  }

  // ── More photos yes/no ───────────────────────────────────────────────────────
  @Action(/^more_/)
  async onMorePhotos(@Ctx() ctx: Context) {
    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);
    const cbData = (ctx.callbackQuery as { data?: string })?.data ?? '';

    await ctx.answerCbQuery();

    if (cbData === 'more_yes') {
      try { await ctx.editMessageText('Sawa, tuma photo nyingine! 📸'); } catch { /* stale */ }
      await ctx.reply('📸 Piga photo na uitume hapa. Tunasubiri!');
    } else {
      const reports = session?.sessionReports ?? [];
      try { await ctx.editMessageText('Sawa, tunamaliza! ✅'); } catch { /* stale */ }
      await ctx.reply(buildSummary(reports));
      this.sessionStore.delete(chatId);
    }
  }

  // ── Text messages ────────────────────────────────────────────────────────────
  @On('text')
  async onText(@Ctx() ctx: Context) {
    if (!ctx.message || !('text' in ctx.message)) return;

    const text = (ctx.message as Message.TextMessage).text.trim();
    const chatId = ctx.chat!.id;

    if (text.startsWith('/')) return;

    const session = this.sessionStore.get(chatId);

    if (!session) {
      await ctx.reply('📸 Send a photo to start a new report!');
      return;
    }

    // ── Candidate name ─────────────────────────────────────────────────────
    if (session.step === 'awaiting_candidate') {
      const allCandidates = await this.physicalAssetsService.listCandidates();

      if (allCandidates.length === 0) {
        this.sessionStore.set(chatId, { ...session, step: 'awaiting_location', confirmedCandidateName: text });
        await ctx.reply('📍 Where was this? Share your location or type the area name.');
        return;
      }

      const matches = matchCandidates(allCandidates, text);

      if (matches.length === 1) {
        this.sessionStore.set(chatId, {
          ...session,
          step: 'awaiting_location',
          candidateName: text,
          confirmedCandidateName: matches[0].name,
        });
        await ctx.reply(`Got it — ${matches[0].name} ✓\n\n📍 Where was this? Share your location or type the area name.`);
        return;
      }

      this.sessionStore.set(chatId, { ...session, step: 'awaiting_constituency', candidateName: text, allCandidates });

      const intro = matches.length === 0
        ? `Hmm, I couldn't find a candidate named "${text}".`
        : `I found ${matches.length} candidates matching "${text}".`;

      await ctx.reply(`${intro} Which constituency is this campaign in?`, constituencyKeyboard(allCandidates));
      return;
    }

    // ── Location ───────────────────────────────────────────────────────────
    if (session.step === 'awaiting_location') {
      const assetType = session.assetType ?? '';

      // After location, ask asset-specific clarifying question before submitting
      if (assetType === 'rally') {
        this.sessionStore.set(chatId, { ...session, step: 'awaiting_event_date', location: text });
        await ctx.reply(
          `📅 Lini ilifanyika hiyo rally?\n(e.g., "jana", "last Saturday", "March 5") — au andika "skip" tuendelee.`,
        );
      } else if (assetType === 'billboard') {
        this.sessionStore.set(chatId, { ...session, step: 'awaiting_billboard_details', location: text });
        await ctx.reply(
          `📐 Ni billboard ya aina gani? Help us estimate accurately:\n\n` +
          `• "small" — roadside, less than 3m wide\n` +
          `• "medium" — main road, 3–6m wide\n` +
          `• "large" — major junction, 6–12m wide\n` +
          `• "mega" — building wrap or elevated highway\n` +
          `• "digital" — LED/digital screen\n` +
          `• "skip" — let AI decide from the photo`,
        );
      } else {
        // Convoy and chopper — AI can estimate directly from the image, submit now
        await this.submitReport(ctx, {
          chatId,
          photoFileId: session.photoFileId!,
          assetType,
          candidateName: session.confirmedCandidateName ?? session.candidateName!,
          location: text,
        });
      }
      return;
    }

    // ── Rally: event date ──────────────────────────────────────────────────
    if (session.step === 'awaiting_event_date') {
      const eventDate = text.toLowerCase() === 'skip' ? undefined : text;

      // Now ask for crowd estimate if not 'skip'
      this.sessionStore.set(chatId, {
        ...session,
        step: 'awaiting_crowd_size',
        eventDate,
      });

      await ctx.reply(
        `👥 Watu wangapi takriban walikuwa kwenye rally?\n\n` +
        `• "small" — chini ya 500\n` +
        `• "medium" — 500 hadi 2,000\n` +
        `• "large" — 2,000 hadi 10,000\n` +
        `• "mega" — zaidi ya 10,000\n` +
        `• "skip" — let AI estimate from the photo`,
      );
      return;
    }

    // ── Rally: crowd size ──────────────────────────────────────────────────
    if (session.step === 'awaiting_crowd_size') {
      const crowdHint = text.toLowerCase() === 'skip' ? undefined : text;
      await this.submitReport(ctx, {
        chatId,
        photoFileId: session.photoFileId!,
        assetType: session.assetType!,
        candidateName: session.confirmedCandidateName ?? session.candidateName!,
        location: session.location!,
        eventDate: session.eventDate,
        clarifyingAnswer: crowdHint,
      });
      return;
    }

    // ── Billboard: size clarification ──────────────────────────────────────
    if (session.step === 'awaiting_billboard_details') {
      const sizeHint = text.toLowerCase() === 'skip' ? undefined : text;
      await this.submitReport(ctx, {
        chatId,
        photoFileId: session.photoFileId!,
        assetType: session.assetType!,
        candidateName: session.confirmedCandidateName ?? session.candidateName!,
        location: session.location!,
        clarifyingAnswer: sizeHint,
      });
      return;
    }

    // ── Guard: steps that use inline keyboards ─────────────────────────────
    if (session.step === 'awaiting_constituency') {
      await ctx.reply('Please use the buttons above to select the constituency and candidate. 👆');
      return;
    }
    if (session.step === 'awaiting_asset_type') {
      await ctx.reply('Please use the buttons above to select the asset type. 👆');
      return;
    }
    if (session.step === 'awaiting_more') {
      await ctx.reply('Use the buttons above to report another photo or finish. 👆');
    }
  }

  // ── Native Telegram location share ──────────────────────────────────────────
  @On('location')
  async onLocation(@Ctx() ctx: Context) {
    if (!ctx.message || !('location' in ctx.message)) return;

    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);

    if (!session || session.step !== 'awaiting_location') return;

    const { latitude, longitude } = (ctx.message as Message.LocationMessage).location;
    const locationStr = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    const assetType = session.assetType ?? '';

    if (assetType === 'rally') {
      this.sessionStore.set(chatId, { ...session, step: 'awaiting_event_date', location: locationStr });
      await ctx.reply(
        `📅 Lini ilifanyika hiyo rally? (e.g., "jana", "last Saturday") — au andika "skip" tuendelee.`,
      );
    } else if (assetType === 'billboard') {
      this.sessionStore.set(chatId, { ...session, step: 'awaiting_billboard_details', location: locationStr });
      await ctx.reply(
        `📐 Billboard size? ("small", "medium", "large", "mega", "digital", or "skip")`,
      );
    } else {
      await this.submitReport(ctx, {
        chatId,
        photoFileId: session.photoFileId!,
        assetType,
        candidateName: session.confirmedCandidateName ?? session.candidateName!,
        location: locationStr,
      });
    }
  }

  // ── Private: AI analysis → upload → reply ────────────────────────────────────
  private async submitReport(
    ctx: Context,
    data: {
      chatId: number;
      photoFileId: string;
      assetType: string;
      candidateName: string;
      location?: string;
      eventDate?: string;
      clarifyingAnswer?: string;
    },
  ): Promise<void> {
    const { chatId, photoFileId, assetType, candidateName, location, eventDate, clarifyingAnswer } = data;
    const userId = ctx.from!.id.toString();
    const locationDisplay = location ?? 'unknown location';

    await ctx.reply('⏳ Inaanalyze photo na ku-estimate cost... tungoja kidogo.');

    // 1. Download photo
    let imageBuffer: Buffer;
    try {
      const fileLink = await ctx.telegram.getFileLink(photoFileId);
      imageBuffer = await this.physicalAssetsService.downloadFile(fileLink.href);
    } catch (err) {
      this.logger.error(`Photo download failed for user ${userId}`, err);
      this.sessionStore.delete(chatId);
      await ctx.reply('⚠️ Something went wrong. Jaribu tena by sending the photo again.');
      return;
    }

    // 2. AI cost estimation — runs BEFORE upload so we can send the cost to the backend
    //    Build a richer location string that includes clarifying answers
    let enrichedLocation = locationDisplay;
    if (clarifyingAnswer) {
      enrichedLocation = assetType === 'rally'
        ? `${locationDisplay} (crowd: ~${clarifyingAnswer})`
        : `${locationDisplay} (size: ${clarifyingAnswer})`;
    }

    // Derive region client-side for the AI prompt (backend will re-derive for storage)
    const region = deriveRegionHint(locationDisplay);

    const aiResult = await this.aiService.analyzeAsset(
      imageBuffer,
      assetType,
      candidateName,
      enrichedLocation,
      region,
      eventDate,
    );

    // 3. Upload to backend, passing AI cost as override
    let uploadResult: { estimated_cost: number; region: string; prior_count: number };
    try {
      uploadResult = await this.physicalAssetsService.uploadAsset({
        imageBuffer,
        filename: `telegram_${userId}_${Date.now()}.jpg`,
        candidate_name: candidateName,
        asset_type: assetType as AssetType,
        location: locationDisplay,
        uploaded_by: userId,
        estimated_cost: aiResult?.estimated_cost,
        event_date: eventDate,
      });
    } catch (err) {
      this.logger.error(`Upload failed for user ${userId}`, err);
      this.sessionStore.delete(chatId);
      await ctx.reply('⚠️ Something went wrong. Jaribu tena by sending the photo again.');
      return;
    }

    const { estimated_cost, region: storedRegion, prior_count } = uploadResult;
    const assetDisplay = ASSET_DISPLAY[assetType] ?? assetType;
    const wasAiEstimated = !!aiResult?.estimated_cost;

    // 4. Persist report to session
    const currentSession = this.sessionStore.get(chatId);
    const sessionReports: SessionReport[] = [
      ...(currentSession?.sessionReports ?? []),
      { candidateName, assetType, location: locationDisplay, estimatedCost: estimated_cost, region: storedRegion },
    ];
    this.sessionStore.set(chatId, { step: 'awaiting_more', sessionReports });

    // 5. Build reply
    const lines: string[] = [
      `Noted! ✅ ${assetDisplay} ya ${candidateName}, ${locationDisplay}.`,
      '',
    ];

    if (wasAiEstimated) {
      lines.push(`💰 AI-estimated cost: ${formatKES(estimated_cost)} (${storedRegion} region)`);
      if (aiResult!.reasoning) {
        lines.push(`📊 ${aiResult!.reasoning}`);
      }
      if (aiResult!.crowd_estimate) {
        lines.push(`👥 Crowd estimate: ~${aiResult!.crowd_estimate.toLocaleString()} people`);
      }
      if (eventDate) {
        lines.push(`📅 Rally date: ${eventDate}`);
      }
    } else {
      lines.push(`💰 Estimated cost: ${formatKES(estimated_cost)} (${storedRegion} region)`);
      lines.push(`📌 Note: AI analysis unavailable — used standard cost table.`);
    }

    if (prior_count === 1) {
      lines.push('', `👀 Interesting! Mtu mmoja mwingine amereport ${assetDisplay.toLowerCase()} kama hii hapo awali!`);
    } else if (prior_count >= 2) {
      lines.push('', `👀 Hot spot! Watu ${prior_count} wengine wamereport ${assetDisplay.toLowerCase()} kama hii — this location is getting noticed! 🔍`);
    }

    if (aiResult?.commentary) {
      lines.push('', `🤖 ${aiResult.commentary}`);
    }

    lines.push('', `Asante! Una photo nyingine ya ku-report? 📸`);

    await ctx.reply(lines.join('\n'), MORE_KEYBOARD);
  }
}

// ── Lightweight region hint for AI prompt (full classification stays in backend) ──
function deriveRegionHint(location: string): string {
  const l = location.toLowerCase();
  if (/cbd|upper.?hill|westlands|kilimani|parklands|city cent/i.test(l)) return 'CBD';
  if (/nairobi|mombasa|kisumu|nakuru|eldoret|thika|kisii|kakamega|meru|nyeri|embu|kitui|machakos|bungoma|kitale|vihiga|homabay|migori|siaya|nyamira|kericho|bomet|nanyuki|malindi|garissa|isiolo|wajir|mandera|lodwar|kajiado/i.test(l)) return 'Town';
  return 'Rural';
}
