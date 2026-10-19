// Everything kept on the phone, in one place. Every read and write is wrapped, because
// localStorage can throw (private windows, blocked site data) and the app must still run.
import { normaliseProgress, type Progress } from './progress';
import type { QueueItem } from './types';

const K = {
  code: 'aw.code',
  voice: 'aw.voice',
  progress: 'aw.progress',
  queue: 'aw.queue',
  cache: 'aw.cache',
  safety: 'aw.safety',
  done: 'aw.done',
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

/** Voice is OFF until she turns it on. Nothing ever speaks the first time. */
export function getVoice(): boolean {
  return read(K.voice) === 'on';
}
export function setVoice(on: boolean): void {
  write(K.voice, on ? 'on' : 'off');
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
