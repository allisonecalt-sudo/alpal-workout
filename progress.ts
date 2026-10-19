// The workout she is in the middle of, kept on the phone so a reload picks up exactly where she
// was. Pure helpers (no screen code): creating it, pausing it, and measuring its length.
import { asFeelList, type MoveFeels } from './feel';
import type { HoldState } from './hold';
import { pauseTimer, startTimer, type TimerState } from './timer';
import type { Feel, MoveStatus, StoppedAt } from './types';

const FEELS: Feel[] = ['easy', 'right', 'hard'];

/** Read the saved feelings; the older shape (one word per move) becomes a one-round list. */
function normaliseFeels(v: unknown): MoveFeels {
  const out: MoveFeels = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const [name, raw] of Object.entries(v)) {
    const list = asFeelList(raw, (x) => (FEELS.includes(x as Feel) ? (x as Feel) : null));
    if (list) out[name] = list;
  }
  return out;
}

export type Stage = 'before' | 'run' | 'cooldown' | 'after';

export interface BeforeAnswers {
  body: number | null;
  mood: number | null;
  check: number | null;
  lite: boolean;
  /** The start time she is confirming (ms). */
  startAt: number;
  /** She touched the time line (Right / Fix / a chip): it no longer follows the clock. */
  startTouched: boolean;
}

export interface AfterDraft {
  body: number | null;
  mood: number | null;
  check: number | null;
  feel: Feel | null;
  note: string;
  /** The finish time she is confirming (ms). */
  endAt: number;
  endTouched: boolean;
}

export interface Progress {
  week: number;
  workoutId: string;
  stage: Stage;
  createdAt: number;
  /** Last time anything changed (a workout left open for hours is offered back, not resumed). */
  lastActiveAt: number;
  before: BeforeAnswers;
  /** The confirmed start (ms), set when she taps Start on the Before screen. */
  startedAt: number;
  /** The next step to do (an index into the workout's step list). */
  idx: number;
  /** A status per step answered (null: not answered, or taken back). */
  statuses: (MoveStatus | null)[];
  /** The cardio choices made: choice key to the option picked. */
  choices: Record<string, number>;
  /** After the last step: skipped steps offered again. */
  redoAsk: boolean;
  redoAsked: boolean;
  /** Doing the skipped steps now: the ones still to do. */
  redoing: boolean;
  redo: number[];
  /** How each move felt, per round (see feel.ts). */
  moveFeel: MoveFeels;
  /** The between-rounds screen is showing (idx is the first step of the next round). */
  between: boolean;
  /** A rest between main moves is running (idx is the move that comes next). */
  rest: TimerState | null;
  /** The hold on the current step. */
  hold: HoldState | null;
  /** Seconds held, by step index. */
  holds: Record<string, number>;
  /** The cool-down list was finished (done) or skipped. */
  cooldownStatus: MoveStatus | null;
  /** Paused: when it began, the time paused before, and which timers were running. */
  pausedAt: number | null;
  pausedMs: number;
  pausedRunning: string[];
  /** She stopped early (Exit, or Finish now): where. */
  stoppedAt: StoppedAt | null;
  /** When the workout ended (ms), set on entering the After screen. */
  endedAt: number | null;
  after: AfterDraft;
}

export function newProgress(week: number, workoutId: string, now: number): Progress {
  const minute = new Date(now);
  minute.setSeconds(0, 0);
  return {
    week,
    workoutId,
    stage: 'before',
    createdAt: now,
    lastActiveAt: now,
    before: {
      body: null,
      mood: null,
      check: null,
      lite: false,
      startAt: minute.getTime(),
      startTouched: false,
    },
    startedAt: now,
    idx: 0,
    statuses: [],
    choices: {},
    redoAsk: false,
    redoAsked: false,
    redoing: false,
    redo: [],
    moveFeel: {},
    between: false,
    rest: null,
    hold: null,
    holds: {},
    cooldownStatus: null,
    pausedAt: null,
    pausedMs: 0,
    pausedRunning: [],
    stoppedAt: null,
    endedAt: null,
    after: {
      body: null,
      mood: null,
      check: null,
      feel: null,
      note: '',
      endAt: minute.getTime(),
      endTouched: false,
    },
  };
}

/** Fill anything missing (an older saved copy), so the rest of the app can rely on the shape. */
export function normaliseProgress(raw: unknown): Progress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Progress>;
  if (typeof r.workoutId !== 'string' || typeof r.week !== 'number') return null;
  if (r.stage !== 'before' && r.stage !== 'run' && r.stage !== 'cooldown' && r.stage !== 'after') {
    return null; // a workout saved by an older version: start fresh
  }
  const base = newProgress(
    r.week,
    r.workoutId,
    typeof r.createdAt === 'number' ? r.createdAt : Date.now()
  );
  return {
    ...base,
    ...r,
    before: { ...base.before, ...(r.before ?? {}) },
    after: { ...base.after, ...(r.after ?? {}) },
    statuses: Array.isArray(r.statuses) ? r.statuses : [],
    holds: typeof r.holds === 'object' && r.holds !== null ? r.holds : {},
    choices: typeof r.choices === 'object' && r.choices !== null ? r.choices : {},
    moveFeel: normaliseFeels(r.moveFeel),
    redo: Array.isArray(r.redo) ? r.redo : [],
    pausedRunning: Array.isArray(r.pausedRunning) ? r.pausedRunning : [],
  };
}

/** Freeze every running timer and note when the pause began. */
export function pauseProgress(p: Progress, now: number): void {
  if (p.pausedAt !== null) return;
  p.pausedAt = now;
  p.pausedRunning = [];
  if (p.rest && p.rest.startedAt !== null) {
    p.rest = pauseTimer(p.rest, now);
    p.pausedRunning.push('rest');
  }
  const h = p.hold;
  if (h && h.phase === 'pre' && h.pre.startedAt !== null) {
    h.pre = pauseTimer(h.pre, now);
    p.pausedRunning.push('pre');
  }
  if (h && h.phase === 'hold' && h.run.startedAt !== null) {
    h.run = pauseTimer(h.run, now);
    p.pausedRunning.push('hold');
  }
}

/** Resume: the paused span is added to pausedMs and the frozen timers go on. */
export function resumeProgress(p: Progress, now: number): void {
  if (p.pausedAt === null) return;
  p.pausedMs += Math.max(0, now - p.pausedAt);
  p.pausedAt = null;
  if (p.pausedRunning.includes('rest') && p.rest) p.rest = startTimer(p.rest, now);
  const h = p.hold;
  if (h && p.pausedRunning.includes('pre')) h.pre = startTimer(h.pre, now);
  if (h && p.pausedRunning.includes('hold')) h.run = startTimer(h.run, now);
  p.pausedRunning = [];
}

/** Whole seconds of workout between start and end, minus the time spent paused. */
export function durationSec(startMs: number, endMs: number, pausedMs: number): number {
  const sec = Math.round((endMs - startMs - pausedMs) / 1000);
  return Math.max(0, Math.min(36000, sec)); // the store accepts 0..36000
}

/** The workout is over (finished, or stopped early): on to the After screen. */
export function endProgress(p: Progress, now: number): void {
  resumeProgress(p, now); // a pause that was still on is added to the paused total
  p.rest = null;
  p.hold = null;
  p.between = false;
  p.stage = 'after';
  p.endedAt = now;
  const minute = new Date(now);
  minute.setSeconds(0, 0);
  p.after.endAt = minute.getTime();
  p.after.endTouched = false;
}
