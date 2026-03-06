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
Send us a photo of any campaign asset you spot. We'll ask you a few quick questions — no forms, no stress.

📸 Ready? Send a photo to get started!

Your report stays anonymous. Together, tunaweza demand transparency. ✊`;

// ─── Cost display helpers ──────────────────────────────────────────────────────

function formatKES(amount: number): string {
  if (amount >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)     return `KES ${(amount / 1_000).toFixed(0)}K`;
  return `KES ${amount.toLocaleString()}`;
}

const COST_FACTS: Record<string, string[]> = {
  billboard: [
    'Billboard moja inaweza kukuwa bei ya gari nzuri! 🚗',
    'Watu wengi hawajui billboard inakuwa na bei kubwa sana!',
    'Campaign billboards — si rahisi, si cheap!',
  ],
  rally:     [
    'Rally moja inaweza kulisha familia elfu nyingi! 🍽️',
    'Maandamano ya siasa si bure — kuna pesa nyingi hapo!',
    'Think about it — rally moja, bei ya hospitali nzima! 🏥',
  ],
  chopper:   [
    'Chopper moja inaweza kujenga shule mbili! 🏫',
    'Kukimbia kwa ndege — hii si mchezo wa watoto! ✈️',
    'Kila safari ya chopper, pesa nyingi zinaenda hewani! 💨',
  ],
  convoy:    [
    'Msafara wa magari — petrol peke yake inakuwa bei kubwa! ⛽',
    'Convoy hii haitembei bure — kila kilomita ina bei! 🚗',
    'Magari mengi, pesa nyingi — transparency inahitajika! 💰',
  ],
};

function randomCostFact(assetType: string): string {
  const facts = COST_FACTS[assetType] ?? ['Campaign assets si bure!'];
  return facts[Math.floor(Math.random() * facts.length)];
}

// ─── Candidate / constituency helpers ─────────────────────────────────────────

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

// ─── Session summary builder ──────────────────────────────────────────────────

function buildSummary(reports: SessionReport[]): string {
  if (reports.length === 0) {
    return 'Haujareport chochote bado. Tuma photo kuanza! 📸';
  }

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
    const reports = session?.sessionReports ?? [];
    await ctx.reply(buildSummary(reports));
  }

  // ── Photo received → start (or continue) the flow ──────────────────────────
  @On('photo')
  async onPhoto(@Ctx() ctx: Context) {
    if (!ctx.message || !('photo' in ctx.message)) return;

    const message = ctx.message as Message.PhotoMessage;
    const chatId = ctx.chat!.id;

    const photoFileId = message.photo[message.photo.length - 1].file_id;

    // Preserve sessionReports from the current session if it exists (multi-photo)
    const existing = this.sessionStore.get(chatId);
    const sessionReports = existing?.sessionReports ?? [];

    this.sessionStore.set(chatId, {
      step: 'awaiting_asset_type',
      photoFileId,
      sessionReports,
    });

    const prompt = sessionReports.length > 0
      ? `Nice 📸! Asset #${sessionReports.length + 1} — What did you spot?`
      : 'Nice 📸! What did you spot?';

    await ctx.reply(prompt, ASSET_KEYBOARD);
  }

  // ── Inline keyboard: asset type ──────────────────────────────────────────────
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

  // ── Inline keyboard: constituency ───────────────────────────────────────────
  @Action(/^const_/)
  async onConstituency(@Ctx() ctx: Context) {
    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);

    if (!session || session.step !== 'awaiting_constituency') {
      await ctx.answerCbQuery('Session expired — send a new photo to start again', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    const cbData = (ctx.callbackQuery as { data?: string })?.data ?? '';
    const constituency = cbData.replace('const_', '');
    const inConstituency = (session.allCandidates ?? []).filter((c) => c.constituency === constituency);

    try { await ctx.editMessageText(`Constituency: ${constituency} ✓`); } catch { /* stale msg */ }

    if (inConstituency.length === 0) {
      await ctx.reply(`Couldn't find candidates in ${constituency}. Please send a new photo to try again. 📸`);
      this.sessionStore.delete(chatId);
      return;
    }

    await ctx.reply(`Who is the candidate in ${constituency}?`, candidateKeyboard(inConstituency));
  }

  // ── Inline keyboard: candidate confirmed ──────────────────────────────────────
  @Action(/^cand_/)
  async onCandidateSelect(@Ctx() ctx: Context) {
    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);

    if (!session || session.step !== 'awaiting_constituency') {
      await ctx.answerCbQuery('Session expired — send a new photo to start again', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    const cbData = (ctx.callbackQuery as { data?: string })?.data ?? '';
    const candidateId = Number(cbData.replace('cand_', ''));
    const candidate = (session.allCandidates ?? []).find((c) => c.id === candidateId);

    if (!candidate) {
      await ctx.reply('Could not find that candidate. Please send a new photo to start again. 📸');
      this.sessionStore.delete(chatId);
      return;
    }

    this.sessionStore.set(chatId, {
      ...session,
      step: 'awaiting_location',
      confirmedCandidateName: candidate.name,
    });

    try { await ctx.editMessageText(`Candidate: ${candidate.name} ✓`); } catch { /* stale msg */ }

    await ctx.reply('📍 Where was this? Share your location or type the area name.');
  }

  // ── Inline keyboard: more photos yes/no ──────────────────────────────────────
  @Action(/^more_/)
  async onMorePhotos(@Ctx() ctx: Context) {
    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);

    await ctx.answerCbQuery();

    const cbData = (ctx.callbackQuery as { data?: string })?.data ?? '';

    if (cbData === 'more_yes') {
      try { await ctx.editMessageText('Sawa, tuma photo nyingine! 📸'); } catch { /* stale msg */ }
      // Session stays alive with sessionReports preserved; @On('photo') handles the next photo
      await ctx.reply('📸 Piga photo na uitume hapa. Tunasubiri!');
    } else {
      // more_no — show full summary and end session
      const reports = session?.sessionReports ?? [];
      try { await ctx.editMessageText('Sawa, tunamaliza! ✅'); } catch { /* stale msg */ }
      await ctx.reply(buildSummary(reports));
      this.sessionStore.delete(chatId);
    }
  }

  // ── Text messages ─────────────────────────────────────────────────────────────
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

    // ── Candidate name step ────────────────────────────────────────────────
    if (session.step === 'awaiting_candidate') {
      const allCandidates = await this.physicalAssetsService.listCandidates();

      if (allCandidates.length === 0) {
        this.logger.warn('Candidate list unavailable — falling back to raw name submission');
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

    // ── Location step ────────────────────────────────────────────────────
    if (session.step === 'awaiting_location') {
      await this.submitReport(ctx, {
        chatId,
        photoFileId: session.photoFileId!,
        assetType: session.assetType!,
        candidateName: session.confirmedCandidateName ?? session.candidateName!,
        location: text,
      });
      return;
    }

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

  // ── Telegram native location share ────────────────────────────────────────────
  @On('location')
  async onLocation(@Ctx() ctx: Context) {
    if (!ctx.message || !('location' in ctx.message)) return;

    const chatId = ctx.chat!.id;
    const session = this.sessionStore.get(chatId);

    if (!session || session.step !== 'awaiting_location') return;

    const { latitude, longitude } = (ctx.message as Message.LocationMessage).location;
    const locationStr = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    await this.submitReport(ctx, {
      chatId,
      photoFileId: session.photoFileId!,
      assetType: session.assetType!,
      candidateName: session.confirmedCandidateName ?? session.candidateName!,
      location: locationStr,
    });
  }

  // ── Private: download photo, POST to API, show AI analysis, ask for more ──────
  private async submitReport(
    ctx: Context,
    data: {
      chatId: number;
      photoFileId: string;
      assetType: string;
      candidateName: string;
      location?: string;
    },
  ): Promise<void> {
    const { chatId, photoFileId, assetType, candidateName, location } = data;
    const userId = ctx.from!.id.toString();

    await ctx.reply('⏳ Inaprocess... tungoja kidogo.');

    // 1. Download photo
    let imageBuffer: Buffer;
    try {
      const fileLink = await ctx.telegram.getFileLink(photoFileId);
      imageBuffer = await this.physicalAssetsService.downloadFile(fileLink.href);
    } catch (err) {
      this.logger.error(`Photo download failed for user ${userId}`, err);
      this.sessionStore.delete(chatId);
      await ctx.reply('⚠️ Something went wrong submitting your report. Jaribu tena by sending the photo again.');
      return;
    }

    // 2. Upload to backend
    let uploadResult: { estimated_cost: number; region: string; prior_count: number };
    try {
      uploadResult = await this.physicalAssetsService.uploadAsset({
        imageBuffer,
        filename: `telegram_${userId}_${Date.now()}.jpg`,
        candidate_name: candidateName,
        asset_type: assetType as AssetType,
        location,
        uploaded_by: userId,
      });
    } catch (err) {
      this.logger.error(`Upload failed for user ${userId}`, err);
      this.sessionStore.delete(chatId);
      await ctx.reply('⚠️ Something went wrong submitting your report. Jaribu tena by sending the photo again.');
      return;
    }

    const { estimated_cost, region, prior_count } = uploadResult;
    const assetDisplay = ASSET_DISPLAY[assetType] ?? assetType;
    const locationDisplay = location ?? 'unknown location';

    // 3. Run AI analysis in parallel with building the reply message (non-blocking)
    const aiComment = await this.aiService.analyzeAsset(imageBuffer, assetType, candidateName, region);

    // 4. Persist report to session
    const currentSession = this.sessionStore.get(chatId);
    const sessionReports: SessionReport[] = [
      ...(currentSession?.sessionReports ?? []),
      { candidateName, assetType, location: locationDisplay, estimatedCost: estimated_cost, region },
    ];

    this.sessionStore.set(chatId, {
      step: 'awaiting_more',
      sessionReports,
    });

    // 5. Build reply lines
    const lines: string[] = [
      `Noted! ✅ ${assetDisplay} ya ${candidateName}, ${locationDisplay}.`,
      ``,
      `💰 Estimated cost: ${formatKES(estimated_cost)} (${region} region)`,
    ];

    // Fun cost fact
    lines.push(`📌 ${randomCostFact(assetType)}`);

    // Duplicate / prior report awareness
    if (prior_count === 1) {
      lines.push(``, `👀 Did you know? Mtu mmoja mwingine amereport ${assetDisplay.toLowerCase()} kama hii hapo awali!`);
    } else if (prior_count >= 2) {
      lines.push(``, `👀 Interesting! Watu ${prior_count} wengine wamereport ${assetDisplay.toLowerCase()} kama hii — this spot is getting noticed! 🔍`);
    }

    // AI comment
    if (aiComment) {
      lines.push(``, `🤖 AI Observation: ${aiComment}`);
    }

    lines.push(``, `Asante! Una photo nyingine ya ku-report? 📸`);

    await ctx.reply(lines.join('\n'), MORE_KEYBOARD);
  }
}
