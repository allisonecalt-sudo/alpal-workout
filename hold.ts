// A timed hold (a move with `seconds`): Ready, then a get-ready count (3-2-1), then the hold
// itself, then "held". All times are wall-clock based (timer.ts), so a locked screen is fine.
// Pure logic, unit tested; the screen only draws it and plays the beeps.
import {
  finishTimer,
  isFinished,
  newTimer,
  remainingMs,
  startTimer,
  type TimerState,
} from './timer';

export type HoldPhase = 'ready' | 'pre' | 'hold' | 'held';

export interface HoldState {
  phase: HoldPhase;
  /** The get-ready count. */
  pre: TimerState;
  /** The hold itself. */
  run: TimerState;
  /** Seconds really held (set when the hold is over, by time or by Stop). */
  heldSec: number;
  /** Seconds held so far, saved on every tick so a reload can freeze at what was shown. */
  shown: number;
  /** The last whole second a count beep was given for (so each second beeps once). */
  beeped: number;
}

export const GET_READY_SECONDS = 3;

export function newHold(seconds: number, getReady = GET_READY_SECONDS): HoldState {
  return {
    phase: 'ready',
    pre: newTimer(getReady),
    run: newTimer(seconds),
    heldSec: 0,
    shown: 0,
    beeped: -1,
  };
}

/** Whole seconds held so far, from the clock. */
export function heldSoFar(h: HoldState, now: number): number {
  const total = h.run.durationMs / 1000;
  return Math.max(0, Math.min(total, Math.round(total - remainingMs(h.run, now) / 1000)));
}

/** Start: the get-ready count (or straight to the hold when the count is 0). */
export function startHold(h: HoldState, now: number): HoldState {
  if (h.pre.durationMs <= 0)
    return { ...h, phase: 'hold', run: startTimer(h.run, now), beeped: -1 };
  return { ...h, phase: 'pre', pre: startTimer(h.pre, now), beeped: -1 };
}

export type HoldEvent = 'count' | 'go' | 'finish' | null;

/**
 * Move the hold along. Returns the new state and what should be heard:
 * 'count' on each of the last 3 seconds (of the get-ready and of the hold), 'go' when the hold
 * begins, 'finish' when it ends on its own.
 */
export function tickHold(h: HoldState, now: number): { hold: HoldState; event: HoldEvent } {
  if (h.phase === 'pre') {
    if (isFinished(h.pre, now)) {
      return {
        hold: { ...h, phase: 'hold', run: startTimer(h.run, now), beeped: -1, shown: 0 },
        event: 'go',
      };
    }
    const left = Math.ceil(remainingMs(h.pre, now) / 1000);
    if (left !== h.beeped) return { hold: { ...h, beeped: left }, event: 'count' };
    return { hold: h, event: null };
  }
  if (h.phase === 'hold') {
    const total = h.run.durationMs / 1000;
    if (isFinished(h.run, now)) {
      return {
        hold: { ...h, phase: 'held', run: finishTimer(h.run), heldSec: total, shown: total },
        event: 'finish',
      };
    }
    const shown = heldSoFar(h, now);
    const left = Math.ceil(remainingMs(h.run, now) / 1000);
    const next: HoldState = { ...h, shown };
    if (left <= 3 && left > 0 && left !== h.beeped)
      return { hold: { ...next, beeped: left }, event: 'count' };
    return { hold: next, event: null };
  }
  return { hold: h, event: null };
}

/** Stop keeps the real seconds held, and they still count. */
export function stopHold(h: HoldState, now: number): HoldState {
  if (h.phase !== 'hold') return h;
  return { ...h, phase: 'held', heldSec: heldSoFar(h, now), shown: heldSoFar(h, now) };
}

/** Redo: back to Ready, so the hold can be done again. */
export function redoHold(h: HoldState): HoldState {
  return newHold(h.run.durationMs / 1000, h.pre.durationMs / 1000);
}

/**
 * After a reload: a get-ready count starts over. A hold that was running counts what the timer
 * WOULD have shown, from its start up to the first moment the page is back (capped at the hold
 * length). From then on it is frozen: idle time never counts, and a second reload adds nothing.
 */
export function afterReload(h: HoldState, now: number): HoldState {
  if (h.phase === 'pre') return redoHold(h);
  if (h.phase === 'hold') {
    const held = heldSoFar(h, now);
    return { ...h, phase: 'held', heldSec: held, shown: held, run: finishTimer(h.run) };
  }
  return h;
}
