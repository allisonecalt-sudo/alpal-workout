// Everything kept on the phone, in one place. Every read and write is wrapped, because
// localStorage can throw (private windows, blocked site data) and the app must still run.
import { normaliseProgress, type Progress } from './progress';
import type { QueueItem } from './types';
import type { WalkState } from './walk';

const K = {
  code: 'aw.code',
  progress: 'aw.progress',
  queue: 'aw.queue',
  cache: 'aw.cache',
  safety: 'aw.safety',
  done: 'aw.done',
  beeps: 'aw.beeps',
  rest: 'aw.rest',
  ready: 'aw.ready',
  cardio: 'aw.cardio',
  walk: 'aw.walk',
  tips: 'aw.tips',
  tipsSeen: 'aw.tipsSeen',
  installHidden: 'aw.installHidden',
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

/** Beeps are on unless she turned them off. */
export function getBeeps(): boolean {
  return read(K.beeps) !== 'off';
}
export function setBeeps(on: boolean): void {
  write(K.beeps, on ? 'on' : 'off');
}

/** Her own rest between moves in seconds, or null to follow the plan. */
export function getRestOverride(): number | null {
  const v = read(K.rest);
  if (v === null || v === 'plan') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function setRestOverride(seconds: number | null): void {
  write(K.rest, seconds === null ? null : String(seconds));
}

/** The get-ready count before a hold, in seconds (3 unless she changed it). */
export function getGetReady(): number {
  const n = Number(read(K.ready));
  return read(K.ready) !== null && Number.isFinite(n) && n >= 0 ? n : 3;
}
export function setGetReady(seconds: number): void {
  write(K.ready, String(seconds));
}

/** A walk in progress (its timer), so a reload does not lose it. */
export function getWalk(): WalkState | null {
  const w = readJson<WalkState>(K.walk);
  return w && typeof w.startedAt === 'number' ? w : null;
}
export function setWalk(w: WalkState | null): void {
  write(K.walk, w === null ? null : JSON.stringify(w));
}

/** The cardio option she picked last time (its label). */
export function getCardio(): string | null {
  return read(K.cardio);
}
export function setCardio(label: string): void {
  write(K.cardio, label);
}

/** First-time tips are on unless she hid them. */
export function getTipsOn(): boolean {
  return read(K.tips) !== 'off';
}
export function setTipsOn(on: boolean): void {
  write(K.tips, on ? 'on' : 'off');
}

/** The ids of the tips she has already seen. */
export function getTipsSeen(): string[] {
  const v = readJson<unknown>(K.tipsSeen);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
export function addTipSeen(id: string): void {
  const seen = getTipsSeen();
  if (!seen.includes(id)) write(K.tipsSeen, JSON.stringify([...seen, id]));
}
/** "Show tips again": forget what was seen and turn the tips back on. */
export function resetTips(): void {
  write(K.tipsSeen, null);
  write(K.tips, 'on');
}

/** "Not now" on the home-screen card hides it for a while (a time, in ms since 1970). */
export function getInstallHiddenUntil(): number {
  const n = Number(read(K.installHidden));
  return Number.isFinite(n) ? n : 0;
}
export function setInstallHiddenUntil(ms: number): void {
  write(K.installHidden, String(ms));
}

/** "Use a different code": forget this person's code and everything kept for them. */
export function clearPhone(): void {
  write(K.code, null);
  write(K.progress, null);
  write(K.queue, null);
  write(K.cache, null);
  write(K.done, null);
  write(K.walk, null);
}

export function getProgress(): Progress | null {
  return normaliseProgress(readJson<unknown>(K.progress));
}
export function setProgress(p: Progress | null): void {
  if (p !== null) p.lastActiveAt = Date.now();
  write(K.progress, p === null ? null : JSON.stringify(p));
}

/** The workout she just saved, for the "Done" card on Home until midnight. */
export interface DoneToday {
  workoutId: string;
  at: number;
  /** Moves done for the first time ever in that session. */
  firsts?: string[];
}
export function getDoneToday(): DoneToday | null {
  const d = readJson<DoneToday>(K.done);
  return d && typeof d.workoutId === 'string' && typeof d.at === 'number' ? d : null;
}
export function setDoneToday(d: DoneToday | null): void {
  write(K.done, d === null ? null : JSON.stringify(d));
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
