import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

export type ConversationStep =
  | 'awaiting_asset_type'
  | 'awaiting_candidate'
  | 'awaiting_constituency'      // candidate name not found — user picking constituency
  | 'awaiting_location'
  | 'awaiting_event_date'        // rally only: when did it happen?
  | 'awaiting_crowd_size'        // rally only: AI couldn't see crowd clearly, asks user
  | 'awaiting_billboard_details' // billboard only: AI asks for size clarification
  | 'awaiting_more';             // submission done — asking if user has more photos

export interface CandidateInfo {
  id: number;
  name: string;
  party?: string;
  position?: string;
  constituency: string;
}

/** One completed report within a session — accumulated for the final summary. */
export interface SessionReport {
  candidateName: string;
  assetType: string;
  location: string;
  estimatedCost: number;
  region: string;
}

export interface SessionData {
  step: ConversationStep;
  photoFileId?: string;
  assetType?: string;
  /** Raw text typed by the user — kept for display only. */
  candidateName?: string;
  /** Exact name from the candidates table — used for the actual submission. */
  confirmedCandidateName?: string;
  /** Full candidate list fetched during disambiguation — filtered client-side by constituency. */
  allCandidates?: CandidateInfo[];
  location?: string;
  /** For rallies: date/time the event took place. */
  eventDate?: string;
  /** Clarifying answer from user (crowd size hint or billboard size hint). */
  clarifyingAnswer?: string;
  /** Completed reports this session — persists across multi-photo flow. */
  sessionReports: SessionReport[];
  /** Updated on every write — used as last-activity timestamp for TTL. */
  startedAt: number;
}

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SWEEP_INTERVAL_MS = 60 * 1000;   // sweep every minute

@Injectable()
export class SessionStore implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<number, SessionData>();
  private sweepTimer: ReturnType<typeof setInterval>;

  onModuleInit() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  get(chatId: number): SessionData | undefined {
    const session = this.sessions.get(chatId);
    if (!session) return undefined;
    if (Date.now() - session.startedAt > SESSION_TTL_MS) {
      this.sessions.delete(chatId);
      return undefined;
    }
    return session;
  }

  set(chatId: number, data: Partial<SessionData> & { step: ConversationStep }): void {
    this.sessions.set(chatId, {
      sessionReports: [],
      ...data,
      startedAt: Date.now(),
    } as SessionData);
  }

  delete(chatId: number): void {
    this.sessions.delete(chatId);
  }

  private sweep(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, session] of this.sessions) {
      if (session.startedAt < cutoff) this.sessions.delete(id);
    }
  }
}
