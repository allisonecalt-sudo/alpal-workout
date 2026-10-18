// Shared types. The program shape comes from the store (never hard-coded here).

export interface Move {
  name: string;
  how: string[];
  /** Either reps (e.g. "8 times") or seconds (a timed move), never both. */
  reps?: string;
  seconds?: number;
}

export interface Program {
  week: number;
  label: string;
  minutes: number;
  sessionsPerWeek: number;
  moves: Move[];
  restSeconds: number;
  /** Optional wording for the 0-10 check-in on the After screen (comes from the store). */
  checkLabel?: string;
}

export interface SessionSummary {
  done_at: string;
  week: number | null;
  feel: Feel | null;
  check_0_10: number | null;
}

export interface GuestData {
  name: string;
  tellWhatsapp: string | null;
  program: Program | null;
  sessions: SessionSummary[];
}

export type Feel = 'easy' | 'right' | 'hard';
export type MoveStatus = 'done' | 'skipped' | 'hurt';

export interface SessionMove {
  name: string;
  status: MoveStatus;
}

/** What is sent to the store for one finished workout. */
export interface SessionPayload {
  client_id: string;
  done_at: string;
  week: number;
  moves: SessionMove[];
  feel: Feel | null;
  check_0_10: number | null;
  note: string | null;
}

export interface SaveResult {
  ok: boolean;
  reason?: string;
}
