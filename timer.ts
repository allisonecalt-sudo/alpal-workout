// Wall-clock timer maths. Remaining time is computed from Date.now() values, so it survives
// the screen locking and page reloads. State is plain data so it can sit in localStorage.

export interface TimerState {
  durationMs: number;
  /** Date.now() when it was last started; null while paused or not started. */
  startedAt: number | null;
  /** Time already used before the last start. */
  usedMs: number;
}

export function newTimer(seconds: number): TimerState {
  return { durationMs: seconds * 1000, startedAt: null, usedMs: 0 };
}

export function usedMs(t: TimerState, now: number): number {
  const running = t.startedAt === null ? 0 : Math.max(0, now - t.startedAt);
  return Math.min(t.durationMs, t.usedMs + running);
}

export function remainingMs(t: TimerState, now: number): number {
  return Math.max(0, t.durationMs - usedMs(t, now));
}

export function isRunning(t: TimerState): boolean {
  return t.startedAt !== null;
}

export function isFinished(t: TimerState, now: number): boolean {
  return remainingMs(t, now) === 0;
}

export function startTimer(t: TimerState, now: number): TimerState {
  if (t.startedAt !== null || isFinished(t, now)) return t;
  return { ...t, startedAt: now };
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.startedAt === null) return t;
  return { ...t, startedAt: null, usedMs: usedMs(t, now) };
}

/** Freeze a timer at its end (used when it runs out). */
export function finishTimer(t: TimerState): TimerState {
  return { ...t, startedAt: null, usedMs: t.durationMs };
}

/** "30 s" under a minute, "1:30" from a minute up. Rounds up so 0 only shows at the end. */
export function formatRemaining(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  if (sec >= 60) return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  return `${sec} s`;
}
