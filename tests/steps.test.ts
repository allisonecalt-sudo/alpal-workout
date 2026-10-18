import { expect, test } from '@playwright/test';
import { buildSteps, endsRound, movesLog, partLines, progressLabel } from '../steps';
import type { Move, Workout } from '../types';

const mv = (name: string): Move => ({ name, how: ['x'], reps: '1 time' });

function workout(over: Partial<Workout> = {}): Workout {
  return {
    id: 'A',
    name: 'Workout A',
    minutes: 30,
    warmup: [mv('w1'), mv('w2')],
    main: [mv('m1'), mv('m2')],
    rounds: 2,
    cooldown: [mv('c1')],
    ...over,
  };
}

test('steps: warm-up, main once per round, cool-down', () => {
  const steps = buildSteps(workout());
  expect(steps.map((s) => `${s.part}${s.round}:${s.move.name}`)).toEqual([
    'warmup1:w1',
    'warmup1:w2',
    'main1:m1',
    'main1:m2',
    'main2:m1',
    'main2:m2',
    'cooldown1:c1',
  ]);
});

test('progress lines', () => {
  const w = workout();
  const labels = buildSteps(w).map((s) => progressLabel(s, w));
  expect(labels).toEqual([
    'Warm-up · 1 of 2',
    'Warm-up · 2 of 2',
    'Round 1 of 2 · move 1 of 2',
    'Round 1 of 2 · move 2 of 2',
    'Round 2 of 2 · move 1 of 2',
    'Round 2 of 2 · move 2 of 2',
    'Cool-down · 1 of 1',
  ]);
});

test('one round: plain move count, or Main when there is a warm-up', () => {
  const plain = workout({ warmup: [], cooldown: [], rounds: 1 });
  expect(buildSteps(plain).map((s) => progressLabel(s, plain))).toEqual([
    'Move 1 of 2',
    'Move 2 of 2',
  ]);
  const withWarm = workout({ cooldown: [], rounds: 1 });
  expect(progressLabel(buildSteps(withWarm)[2], withWarm)).toBe('Main · 1 of 2');
});

test('a round ends only on the last main move of a round that is not the last', () => {
  const w = workout({ rounds: 3 });
  const steps = buildSteps(w);
  const ends = steps.map((_, k) => endsRound(steps, k, w));
  expect(ends).toEqual([false, false, false, true, false, true, false, false, false]);
});

test('the log has only the steps reached, with part and round', () => {
  const w = workout();
  const log = movesLog(buildSteps(w), ['done', 'skipped', 'hurt']);
  expect(log).toEqual([
    { name: 'w1', part: 'warmup', round: 1, status: 'done' },
    { name: 'w2', part: 'warmup', round: 1, status: 'skipped' },
    { name: 'm1', part: 'main', round: 1, status: 'hurt' },
  ]);
});

test('home lines per part', () => {
  expect(partLines(workout({ rounds: 3 }))).toEqual([
    'Warm-up · 2 moves',
    'Main · 2 moves × 3 rounds',
    'Cool-down · 1 move',
  ]);
  expect(partLines(workout({ warmup: [], cooldown: [], rounds: 1 }))).toEqual(['Main · 2 moves']);
});
