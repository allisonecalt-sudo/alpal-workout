import { expect, test } from '@playwright/test';
import { startHold, newHold } from '../hold';
import {
  durationSec,
  endProgress,
  newProgress,
  normaliseProgress,
  pauseProgress,
  resumeProgress,
} from '../progress';
import { startTimer, newTimer, remainingMs } from '../timer';

const T0 = new Date(2026, 9, 19, 9, 4, 37).getTime();

test('a new workout starts on the Before screen with blank answers', () => {
  const p = newProgress(1, 'A', T0);
  expect(p.stage).toBe('before');
  expect(p.before.body).toBeNull();
  expect(p.before.lite).toBe(false);
  expect(p.before.startTouched).toBe(false);
  // the suggested start is the current minute
  expect(new Date(p.before.startAt).getSeconds()).toBe(0);
});

test('pause freezes the running timers; resume adds the paused span and goes on', () => {
  const p = newProgress(1, 'A', T0);
  p.stage = 'run';
  p.rest = startTimer(newTimer(30), T0);
  p.hold = startHold(newHold(20, 0), T0);
  pauseProgress(p, T0 + 10_000);
  expect(p.pausedAt).toBe(T0 + 10_000);
  // frozen: no time passes while paused
  expect(remainingMs(p.rest, T0 + 500_000)).toBe(20_000);
  expect(remainingMs(p.hold.run, T0 + 500_000)).toBe(10_000);
  resumeProgress(p, T0 + 70_000);
  expect(p.pausedAt).toBeNull();
  expect(p.pausedMs).toBe(60_000);
  // running again from where it froze
  expect(remainingMs(p.rest as NonNullable<typeof p.rest>, T0 + 75_000)).toBe(15_000);
  expect(remainingMs(p.hold.run, T0 + 75_000)).toBe(5000);
});

test('a timer that was not running stays stopped through a pause', () => {
  const p = newProgress(1, 'A', T0);
  p.hold = newHold(20); // Ready: not started
  pauseProgress(p, T0);
  resumeProgress(p, T0 + 5000);
  expect(p.hold.run.startedAt).toBeNull();
});

test('pausing twice or resuming twice changes nothing more', () => {
  const p = newProgress(1, 'A', T0);
  pauseProgress(p, T0 + 1000);
  pauseProgress(p, T0 + 9000);
  expect(p.pausedAt).toBe(T0 + 1000);
  resumeProgress(p, T0 + 11_000);
  resumeProgress(p, T0 + 99_000);
  expect(p.pausedMs).toBe(10_000);
});

test('duration is start to end minus the time paused, kept inside what the store accepts', () => {
  expect(durationSec(T0, T0 + 31 * 60_000, 0)).toBe(31 * 60);
  expect(durationSec(T0, T0 + 31 * 60_000, 60_000)).toBe(30 * 60);
  expect(durationSec(T0, T0 - 60_000, 0)).toBe(0); // an end before the start is never negative
  expect(durationSec(T0, T0 + 20 * 3600_000, 0)).toBe(36000);
});

test('ending while still paused adds that pause to the total and moves to After', () => {
  const p = newProgress(1, 'A', T0);
  p.stage = 'run';
  p.hold = newHold(20);
  pauseProgress(p, T0 + 1000);
  endProgress(p, T0 + 11_000);
  expect(p.stage).toBe('after');
  expect(p.pausedAt).toBeNull();
  expect(p.pausedMs).toBe(10_000);
  expect(p.endedAt).toBe(T0 + 11_000);
  expect(p.hold).toBeNull();
  expect(new Date(p.after.endAt).getSeconds()).toBe(0);
});

test('a saved copy with missing parts is filled in; one from an older version is dropped', () => {
  const ok = normaliseProgress({
    week: 1,
    workoutId: 'A',
    stage: 'run',
    idx: 2,
    statuses: ['done'],
  });
  expect(ok?.idx).toBe(2);
  expect(ok?.before.lite).toBe(false);
  expect(ok?.holds).toEqual({});
  expect(normaliseProgress({ week: 1, workoutId: 'A', finished: true, idx: 1 })).toBeNull();
  expect(normaliseProgress(null)).toBeNull();
});
