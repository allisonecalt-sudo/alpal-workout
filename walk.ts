// A walk outside a workout: a wall-clock timer (Start, Pause, Finish) or "I already walked N min".
// Pure helpers; the screen only draws them. No steps counting (no phone sensor access).
import type { SessionPayload } from './types';

export interface WalkState {
  /** When it started (ms). */
  startedAt: number;
  /** When it was paused (ms), or null while it runs. */
  pausedAt: number | null;
  /** Time spent paused before (ms). */
  pausedMs: number;
}

export const WALK_CHOICES = [10, 20, 30, 45];

export function startWalk(now: number): WalkState {
  return { startedAt: now, pausedAt: null, pausedMs: 0 };
}

export function pauseWalk(w: WalkState, now: number): WalkState {
  return w.pausedAt === null ? { ...w, pausedAt: now } : w;
}

export function resumeWalk(w: WalkState, now: number): WalkState {
  if (w.pausedAt === null) return w;
  return { ...w, pausedAt: null, pausedMs: w.pausedMs + Math.max(0, now - w.pausedAt) };
}

/** Walked time so far in ms: paused time is not counted. */
export function walkedMs(w: WalkState, now: number): number {
  const end = w.pausedAt ?? now;
  return Math.max(0, end - w.startedAt - w.pausedMs);
}

/** "12:05", or "1:02:09" from an hour up. */
export function formatWalked(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** The session that is saved for a walk. It is its own kind: workout "walk". */
export function walkPayload(
  clientId: string,
  week: number,
  startedMs: number,
  endMs: number,
  durationSec: number
): SessionPayload {
  return {
    client_id: clientId,
    done_at: new Date(endMs).toISOString(),
    started_at: new Date(startedMs).toISOString(),
    duration_sec: Math.max(0, Math.min(36000, Math.round(durationSec))),
    lite: false,
    readings: {},
    week,
    workout: 'walk',
    moves: [],
    feel: null,
    check_0_10: null,
    note: null,
  };
}
