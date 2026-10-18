import { expect, test } from '@playwright/test';
import {
  finishTimer,
  formatRemaining,
  isFinished,
  isRunning,
  newTimer,
  pauseTimer,
  remainingMs,
  startTimer,
} from '../timer';

test('a new timer shows its full time and is not running', () => {
  const t = newTimer(30);
  expect(remainingMs(t, 5000)).toBe(30_000);
  expect(isRunning(t)).toBe(false);
});

test('running time comes from the clock, not from ticks', () => {
  const t = startTimer(newTimer(30), 1000);
  expect(remainingMs(t, 1000)).toBe(30_000);
  expect(remainingMs(t, 11_000)).toBe(20_000);
  // a long gap (screen locked) is counted in full
  expect(remainingMs(t, 61_000)).toBe(0);
  expect(isFinished(t, 61_000)).toBe(true);
});

test('pause keeps what was used; start again continues', () => {
  let t = startTimer(newTimer(30), 0);
  t = pauseTimer(t, 10_000);
  expect(remainingMs(t, 99_000)).toBe(20_000); // paused: time does not pass
  t = startTimer(t, 100_000);
  expect(remainingMs(t, 105_000)).toBe(15_000);
});

test('a finished timer cannot be started again; finish freezes at zero', () => {
  const t = finishTimer(startTimer(newTimer(5), 0));
  expect(remainingMs(t, 0)).toBe(0);
  expect(startTimer(t, 1000)).toBe(t);
});

test('a clock that goes backwards never gives more than the full time', () => {
  const t = startTimer(newTimer(30), 10_000);
  expect(remainingMs(t, 5000)).toBe(30_000);
});

test('format: seconds under a minute, m:ss from a minute', () => {
  expect(formatRemaining(30_000)).toBe('30 s');
  expect(formatRemaining(29_001)).toBe('30 s'); // rounds up
  expect(formatRemaining(1)).toBe('1 s');
  expect(formatRemaining(0)).toBe('0 s');
  expect(formatRemaining(60_000)).toBe('1:00');
  expect(formatRemaining(90_000)).toBe('1:30');
});
