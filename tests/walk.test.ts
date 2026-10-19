import { expect, test } from '@playwright/test';
import { firstsOf } from '../stats';
import { formatWalked, pauseWalk, resumeWalk, startWalk, walkPayload, walkedMs } from '../walk';
import type { SessionMove, SessionSummary } from '../types';

const T0 = 1_000_000;

test('a walk counts wall-clock time, and paused time is not walked time', () => {
  let w = startWalk(T0);
  expect(walkedMs(w, T0 + 90_000)).toBe(90_000);
  w = pauseWalk(w, T0 + 90_000);
  expect(walkedMs(w, T0 + 900_000)).toBe(90_000); // frozen while paused
  w = resumeWalk(w, T0 + 600_000);
  expect(walkedMs(w, T0 + 660_000)).toBe(90_000 + 60_000);
  // pausing twice or resuming twice changes nothing more
  expect(pauseWalk(pauseWalk(w, T0 + 700_000), T0 + 800_000).pausedAt).toBe(T0 + 700_000);
  expect(resumeWalk(w, T0 + 900_000)).toBe(w);
});

test('the walked time is written as m:ss, and h:mm:ss from an hour', () => {
  expect(formatWalked(0)).toBe('00:00');
  expect(formatWalked(65_000)).toBe('01:05');
  expect(formatWalked(3_725_000)).toBe('1:02:05');
});

test('the saved walk is a session of its own kind: workout "walk", a length, nothing else', () => {
  const p = walkPayload('id-1', 2, T0, T0 + 1_200_000, 1200);
  expect(p).toEqual({
    client_id: 'id-1',
    done_at: new Date(T0 + 1_200_000).toISOString(),
    started_at: new Date(T0).toISOString(),
    duration_sec: 1200,
    lite: false,
    readings: {},
    week: 2,
    workout: 'walk',
    moves: [],
    feel: null,
    check_0_10: null,
    note: null,
  });
  expect(walkPayload('x', 1, T0, T0, 99_999).duration_sec).toBe(36000); // the store's top
  expect(walkPayload('x', 1, T0, T0, -5).duration_sec).toBe(0);
});

const mv = (name: string, status: SessionMove['status'] = 'done'): SessionMove => ({
  name,
  part: 'main',
  round: 1,
  status,
});
const past = (...names: string[]): SessionSummary =>
  ({ moves: names.map((n) => mv(n)) }) as unknown as SessionSummary;

test('firsts: moves done now that were never done before, each once, in order', () => {
  expect(firstsOf([mv('A'), mv('B'), mv('A'), mv('C')], [past('B')])).toEqual(['A', 'C']);
});

test('firsts: a move only skipped or hurt before still counts as new when done', () => {
  const earlier = [{ moves: [mv('A', 'skipped'), mv('B', 'hurt')] }] as unknown as SessionSummary[];
  expect(firstsOf([mv('A'), mv('B')], earlier)).toEqual(['A', 'B']);
});

test('firsts: nothing skipped or hurt now is a first; no history means every move done is', () => {
  expect(firstsOf([mv('A', 'skipped'), mv('B', 'hurt')], [])).toEqual([]);
  expect(firstsOf([mv('A'), mv('B')], [])).toEqual(['A', 'B']);
});
