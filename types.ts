// Shared types. The program shape comes from the store (never hard-coded here).

export interface Move {
  name: string;
  how: string[];
  /** Either reps (e.g. "8 times") or seconds (a timed move), never both. */
  reps?: string;
  seconds?: number;
  /** A video link (parsed when shown; a link that cannot be parsed shows no button). */
  video?: string;
  why?: string;
  tips?: string[];
  watchOut?: string[];
  /** Up to two pictures: where it starts and where it ends (paths or https links). */
  images?: string[];
  /** A choice (e.g. outside or indoors): picking one runs its moves in place of this one. */
  options?: MoveOption[];
  /** Small badges on the move card, and a quick "how was it" after the last round. */
  new?: boolean;
  stepped?: boolean;
  /** A spoken explanation is waiting in the store: show the Hear how button. */
  audio?: boolean;
}

export interface MoveOption {
  label: string;
  moves: Move[];
}

export interface Workout {
  id: string;
  name: string;
  minutes: number;
  warmup: Move[];
  main: Move[];
  rounds: number;
  cooldown: Move[];
  /** Rest between main moves, in seconds (0 or missing = none). */
  restSeconds?: number;
}

export interface Program {
  week: number;
  label: string;
  sessionsPerWeek: number;
  workouts: Workout[];
  restSeconds: number;
  /** Optional wording for the 0-10 check-in on the After screen (comes from the store). */
  checkLabel?: string;
  /** General tips shown in a card above Up next (data only; no text in code). */
  safety?: string[];
  /** One sentence shown on every move card (data only; no text in code). */
  painRule?: string;
  /** Changes when the spoken explanations are replaced, so the phone fetches them again. */
  audioVersion?: string;
}

/** One saved (or waiting) session, as the history shows it. */
export interface SessionSummary {
  client_id: string | null;
  done_at: string;
  started_at: string | null;
  duration_sec: number | null;
  lite: boolean;
  readings: Readings;
  moves: SessionMove[];
  note: string | null;
  week: number | null;
  workout: string | null;
  feel: Feel | null;
  check_0_10: number | null;
}

/** A program week as the store lists it (past, active or future). */
export interface WeekInfo {
  week: number;
  label: string;
  active: boolean;
  workouts: { id: string; name: string; moves: string[] }[];
}

export interface Question {
  id: string;
  section: string;
  text: string;
}

/** One note she sent to Allison, as the store lists it. */
export interface NoteRow {
  client_id: string;
  kind: 'voice' | 'text';
  created_at: string;
  duration_sec: number | null;
  /** The first 200 characters of a written note. */
  text: string | null;
  /** Allison has got it. */
  read: boolean;
}

export interface GuestData {
  name: string;
  tellWhatsapp: string | null;
  program: Program | null;
  sessions: SessionSummary[];
  /** Every program week, past, active and future. */
  weeks: WeekInfo[];
  /** The week after the active one, when the store has it. */
  next: Program | null;
  /** Unanswered questions, in order. */
  questions: Question[];
  answered: number;
  /** Her last 20 notes to Allison. */
  messages: NoteRow[];
}

export type Feel = 'easy' | 'right' | 'hard';
export type MoveStatus = 'done' | 'skipped' | 'hurt';
export type Part = 'warmup' | 'main' | 'cooldown';

export interface SessionMove {
  name: string;
  part: Part;
  round: number;
  status: MoveStatus;
  /** Which option was chosen, for a move that had a choice. */
  option?: string;
}

export interface StoppedAt {
  part: Part;
  round: number;
  move: string | null;
}

/** Extra readings saved with a session (kept small: the store caps them at 8 KB). */
export interface Readings {
  before?: { body: number | null; mood: number | null; check: number | null };
  after?: { body: number | null; mood: number | null };
  /** Seconds held, per move name, one entry per time it was held. */
  holds?: Record<string, number[]>;
  stopped_at?: StoppedAt;
  /** How a new or stepped-up move felt, by move name. */
  move_feel?: Record<string, Feel>;
}

/** What is sent to the store for one finished workout. */
export interface SessionPayload {
  client_id: string;
  done_at: string;
  started_at: string;
  duration_sec: number;
  lite: boolean;
  readings: Readings;
  week: number;
  workout: string;
  moves: SessionMove[];
  feel: Feel | null;
  check_0_10: number | null;
  note: string | null;
}

/** What is sent to the store for one answered question. */
export interface AnswerPayload {
  client_id: string;
  question_id: string;
  answer: string;
}

/** An edit of a saved session's note, waiting to be sent. */
export interface NoteEdit {
  /** Its own id (so the queue can tell it from other items). */
  client_id: string;
  /** The client_id of the session whose note it changes. */
  target: string;
  note: string;
}

/** Anything that can wait in the phone-side queue. */
export type QueueItem = SessionPayload | AnswerPayload | NoteEdit;

export function isAnswer(item: QueueItem): item is AnswerPayload {
  return 'question_id' in item;
}

export function isNoteEdit(item: QueueItem): item is NoteEdit {
  return 'target' in item;
}

export function isSession(item: QueueItem): item is SessionPayload {
  return 'done_at' in item;
}

/** What is sent to the store for one note to Allison. */
export interface MessagePayload {
  client_id: string;
  kind: 'voice' | 'text';
  text?: string;
  audio_b64?: string;
  mime?: string;
  duration_sec?: number;
}

export interface SaveResult {
  ok: boolean;
  reason?: string;
}
