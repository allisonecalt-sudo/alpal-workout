// Everything kept on the phone, in one place. Every read and write is wrapped, because
// localStorage can throw (private windows, blocked site data) and the app must still run.
import type { MoveStatus, QueueItem } from './types';
import type { TimerState } from './timer';

const K = {
  code: 'aw.code',
  voice: 'aw.voice',
  progress: 'aw.progress',
  queue: 'aw.queue',
  cache: 'aw.cache',
  safety: 'aw.safety',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: carry on without it */
  }
}

function readJson<T>(key: string): T | null {
  const raw = read(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getCode(): string | null {
  return read(K.code);
}
export function setCode(code: string | null): void {
  write(K.code, code);
}

/** Voice is on unless she turned it off. */
export function getVoice(): boolean {
  return read(K.voice) !== 'off';
}
export function setVoice(on: boolean): void {
  write(K.voice, on ? 'on' : 'off');
}

export interface Progress {
  week: number;
  workoutId: string;
  startedAt: number;
  /** The next step to do (an index into the workout's flat step list). */
  idx: number;
  /** One status per step finished so far. */
  statuses: MoveStatus[];
  /** The between-rounds screen is showing (idx is the first step of the next round). */
  between: boolean;
  timer: TimerState | null;
  /** All moves are through: the After screen is next. */
  finished: boolean;
}

export function getProgress(): Progress | null {
  const p = readJson<Progress>(K.progress);
  // a workout saved by an older version has no workout id: start fresh
  return p && typeof p.workoutId === 'string' ? p : null;
}
export function setProgress(p: Progress | null): void {
  write(K.progress, p === null ? null : JSON.stringify(p));
}

export function getQueue(): QueueItem[] {
  const q = readJson<QueueItem[]>(K.queue);
  return Array.isArray(q) ? q : [];
}
export function setQueue(q: QueueItem[]): void {
  write(K.queue, q.length === 0 ? null : JSON.stringify(q));
}

/** Last good copy of what the store returned, so the app opens offline. */
export function getCache(code: string): unknown {
  const c = readJson<{ code: string; data: unknown }>(K.cache);
  return c && c.code === code ? c.data : null;
}
export function setCache(code: string, data: unknown): void {
  write(K.cache, JSON.stringify({ code, data }));
}

/** Has the "Before you start" card already been shown open for this program week? */
export function getSafetySeen(week: number): boolean {
  return read(`${K.safety}.${week}`) === 'seen';
}
export function setSafetySeen(week: number): void {
  write(`${K.safety}.${week}`, 'seen');
}
