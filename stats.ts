// The numbers behind the weekly review and the Progress page. Pure, so each rule is unit tested.
// One number, one home: both screens read these functions, so a number is the same everywhere.
import { isWalk } from './program';
import type { Program, SessionMove, SessionSummary, WeekInfo } from './types';

/** Workout sessions only: a walk never counts toward the week. */
export function workoutsOnly(all: SessionSummary[]): SessionSummary[] {
  return all.filter((s) => !isWalk(s));
}

export function sessionsOfWeek(all: SessionSummary[], week: number): SessionSummary[] {
  return workoutsOnly(all).filter((s) => s.week === week);
}

/** How many workouts in each program week. */
export function countsByWeek(all: SessionSummary[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const s of workoutsOnly(all)) {
    if (s.week === null) continue;
    counts.set(s.week, (counts.get(s.week) ?? 0) + 1);
  }
  return counts;
}

export function fullWeeks(all: SessionSummary[], perWeek: number): number {
  let n = 0;
  for (const c of countsByWeek(all).values()) if (c >= perWeek) n += 1;
  return n;
}

export type WeekState = 'full' | 'partial' | 'none';

export function weekState(count: number, perWeek: number): WeekState {
  if (count >= perWeek) return 'full';
  return count > 0 ? 'partial' : 'none';
}

export function firstDoneAt(all: SessionSummary[]): number | null {
  const times = workoutsOnly(all).map((s) => Date.parse(s.done_at));
  return times.length === 0 ? null : Math.min(...times);
}

/** Seconds of workout in a list of sessions (sessions with no length count as nothing). */
export function totalSeconds(list: SessionSummary[]): number {
  return list.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
}

/** The longest single hold, and which move it was. */
export function longestHold(list: SessionSummary[]): { name: string; seconds: number } | null {
  let best: { name: string; seconds: number } | null = null;
  for (const s of list) {
    for (const [name, secs] of Object.entries(s.readings.holds ?? {})) {
      for (const sec of secs) if (!best || sec > best.seconds) best = { name, seconds: sec };
    }
  }
  return best;
}

/** "Check label 0 on 2 of 3 · highest 2": zeros, out of the sessions that answered, and the top. */
export function checkWords(list: SessionSummary[], label: string): string | null {
  const values = list.map((s) => s.check_0_10).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const zeros = values.filter((v) => v === 0).length;
  return `${label} 0 on ${zeros} of ${values.length} · highest ${Math.max(...values)}`;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * "Your usual: 3 a week": from 4 full weeks on, the middle week of the finished weeks (the open
 * week is never part of it). null before that.
 */
export function usualPerWeek(
  all: SessionSummary[],
  perWeek: number,
  openWeek: number | null
): { usual: number; full: number } | null {
  const counts = [...countsByWeek(all).entries()].filter(([w]) => w !== openWeek).map(([, c]) => c);
  const full = counts.filter((c) => c >= perWeek).length;
  if (full < 4) return null;
  return { usual: median(counts), full };
}

/** Oldest first. */
export function byDate(list: SessionSummary[]): SessionSummary[] {
  return [...list].sort((a, b) => Date.parse(a.done_at) - Date.parse(b.done_at));
}

export interface HoldGrowth {
  name: string;
  first: number;
  latest: number;
  sinceMs: number;
  sessions: number;
}

/**
 * For each hold move: the best hold of its first session and of its latest, compared like with
 * like (best per session), with the date of its own first session.
 */
export function holdGrowth(all: SessionSummary[]): HoldGrowth[] {
  const byName = new Map<string, { at: number; best: number }[]>();
  for (const s of byDate(workoutsOnly(all))) {
    for (const [name, secs] of Object.entries(s.readings.holds ?? {})) {
      if (secs.length === 0) continue;
      const list = byName.get(name) ?? [];
      list.push({ at: Date.parse(s.done_at), best: Math.max(...secs) });
      byName.set(name, list);
    }
  }
  return [...byName.entries()].map(([name, list]) => ({
    name,
    first: list[0].best,
    latest: list[list.length - 1].best,
    sinceMs: list[0].at,
    sessions: list.length,
  }));
}

/** How many main rounds a session got into (the most rounds any move in it was logged for). */
export function roundsInSession(s: SessionSummary): number {
  const rounds = s.moves.filter((m) => m.part === 'main').map((m) => m.round);
  return rounds.length === 0 ? 0 : Math.max(...rounds);
}

/** The most rounds done in a single session, per program week. */
export function roundsByWeek(all: SessionSummary[]): { week: number; rounds: number }[] {
  const best = new Map<number, number>();
  for (const s of workoutsOnly(all)) {
    if (s.week === null) continue;
    best.set(s.week, Math.max(best.get(s.week) ?? 0, roundsInSession(s)));
  }
  return [...best.entries()]
    .map(([week, rounds]) => ({ week, rounds }))
    .filter((r) => r.rounds > 0)
    .sort((a, b) => a.week - b.week);
}

/** The 0-10 check across sessions, oldest first. */
export function checkSeries(all: SessionSummary[]): number[] {
  return byDate(workoutsOnly(all))
    .map((s) => s.check_0_10)
    .filter((v): v is number => v !== null);
}

/** Average body (or mood) before and after, over the sessions that have both. */
export function beforeAfter(
  all: SessionSummary[],
  key: 'body' | 'mood'
): { before: number; after: number; n: number } | null {
  const pairs = workoutsOnly(all)
    .map((s) => [s.readings.before?.[key] ?? null, s.readings.after?.[key] ?? null] as const)
    .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null);
  if (pairs.length < 3) return null;
  const avg = (i: 0 | 1): number => pairs.reduce((sum, p) => sum + p[i], 0) / pairs.length;
  return { before: avg(0), after: avg(1), n: pairs.length };
}

/** The weeks to page through: the store's list, or a fallback made from what we know. */
export function weeksToShow(
  weeks: WeekInfo[],
  program: Program,
  all: SessionSummary[]
): WeekInfo[] {
  if (weeks.length > 0) return weeks;
  const known = new Set<number>([program.week, ...countsByWeek(all).keys()]);
  return [...known]
    .sort((a, b) => a - b)
    .map((week) => ({
      week,
      label: week === program.week ? program.label : `Week ${week}`,
      active: week === program.week,
      workouts: [],
    }));
}

/** What changes next week compared with this one: moves added and removed, by name. */
export function nextChange(
  thisWeek: WeekInfo | undefined,
  next: Program
): { added: string[]; removed: string[] } {
  const now = new Set(thisWeek?.workouts.flatMap((w) => w.moves) ?? []);
  const upcoming = new Set<string>();
  for (const w of next.workouts) {
    for (const m of [...w.warmup, ...w.main, ...w.cooldown]) upcoming.add(m.name);
  }
  // (a cardio choice is listed by its own name, the same way the store lists it)
  return {
    added: [...upcoming].filter((n) => !now.has(n)),
    removed: [...now].filter((n) => !upcoming.has(n)),
  };
}

/**
 * The moves done for the first time ever: done in this session and never done in any earlier one
 * (as far back as the history reaches), each name once, in the order they were done.
 */
export function firstsOf(moves: SessionMove[], earlier: SessionSummary[]): string[] {
  const seen = new Set<string>();
  for (const s of earlier) for (const m of s.moves) if (m.status === 'done') seen.add(m.name);
  const out: string[] = [];
  for (const m of moves) {
    if (m.status === 'done' && !seen.has(m.name) && !out.includes(m.name)) out.push(m.name);
  }
  return out;
}
