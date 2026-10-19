import { expect, test } from '@playwright/test';
import { newProgress } from '../progress';
import { buildPayload } from '../session';
import type { Move, Workout } from '../types';

const mv = (name: string, extra: Partial<Move> = {}): Move => ({
  name,
  how: ['x'],
  reps: '1 time',
  ...extra,
});
const w: Workout = {
  id: 'A',
  name: 'Workout A',
  minutes: 30,
  warmup: [mv('w1')],
  main: [mv('m1'), mv('m2', { reps: undefined, seconds: 20 })],
  rounds: 2,
  cooldown: [mv('c1')],
};
const T0 = new Date(2026, 9, 19, 9, 4, 0).getTime();

function finished() {
  const p = newProgress(1, 'A', T0);
  p.startedAt = T0;
  p.statuses = ['done', 'done', 'skipped', 'done', 'done'];
  p.cooldownStatus = 'done';
  p.after.endAt = T0 + 31 * 60_000;
  return p;
}

test('a plain finished workout: times, duration, moves, and nothing extra', () => {
  const p = finished();
  const s = buildPayload(p, w, 1, 'id-1');
  expect(s).toEqual({
    client_id: 'id-1',
    done_at: new Date(T0 + 31 * 60_000).toISOString(),
    started_at: new Date(T0).toISOString(),
    duration_sec: 31 * 60,
    lite: false,
    readings: {},
    week: 1,
    workout: 'A',
    moves: [
      { name: 'w1', part: 'warmup', round: 1, status: 'done' },
      { name: 'm1', part: 'main', round: 1, status: 'done' },
      { name: 'm2', part: 'main', round: 1, status: 'skipped' },
      { name: 'm1', part: 'main', round: 2, status: 'done' },
      { name: 'm2', part: 'main', round: 2, status: 'done' },
      { name: 'c1', part: 'cooldown', round: 1, status: 'done' },
    ],
    feel: null,
    check_0_10: null,
    note: null,
  });
});

test('paused time is taken out of duration_sec', () => {
  const p = finished();
  p.pausedMs = 4 * 60_000;
  expect(buildPayload(p, w, 1, 'x').duration_sec).toBe(27 * 60);
});

test('readings: before, after, holds per move per round, and where she stopped', () => {
  const p = finished();
  p.before.body = 3;
  p.before.mood = 7;
  p.before.check = null;
  p.after.body = 5;
  p.after.mood = null;
  // steps: 0 w1, 1 m1, 2 m2, 3 m1, 4 m2 (m2 is the hold)
  p.holds = { '2': 18, '4': 20 };
  p.stoppedAt = { part: 'main', round: 2, move: 'm2' };
  const s = buildPayload(p, w, 1, 'x');
  expect(s.readings).toEqual({
    before: { body: 3, mood: 7, check: null },
    after: { body: 5, mood: null },
    holds: { m2: [18, 20] },
    stopped_at: { part: 'main', round: 2, move: 'm2' },
  });
  // stopping early marks the session lite
  expect(s.lite).toBe(true);
});

test('lite from the Before chip is sent, and it shortens the steps that are logged', () => {
  const p = finished();
  p.before.lite = true;
  p.statuses = ['done', 'done', 'done']; // warm-up + one round
  p.cooldownStatus = null;
  const s = buildPayload(p, w, 1, 'x');
  expect(s.lite).toBe(true);
  expect(s.moves).toHaveLength(3);
});

test('feel, the check number and a trimmed note go in; a blank note is null', () => {
  const p = finished();
  p.after.feel = 'right';
  p.after.check = 4;
  p.after.note = '  hello  ';
  const s = buildPayload(p, w, 1, 'x');
  expect(s).toMatchObject({ feel: 'right', check_0_10: 4, note: 'hello' });
  p.after.note = '   ';
  expect(buildPayload(p, w, 1, 'x').note).toBeNull();
});
