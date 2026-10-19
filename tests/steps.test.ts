import { expect, test } from '@playwright/test';
import {
  buildSteps,
  cooldownMinutes,
  effectiveRounds,
  endsRound,
  groupStretchPairs,
  movesLog,
  partLines,
  progressLabel,
  restFollows,
  restSecondsOf,
  roundsCompleted,
  stoppedAtOf,
} from '../steps';
import type { Move, Program, Workout } from '../types';

const mv = (name: string, extra: Partial<Move> = {}): Move => ({
  name,
  how: ['x'],
  reps: '1 time',
  ...extra,
});

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

test('steps: warm-up, then the main moves once per round (the cool-down is a list, not steps)', () => {
  const steps = buildSteps(workout());
  expect(steps.map((s) => `${s.part}${s.round}:${s.move.name}`)).toEqual([
    'warmup1:w1',
    'warmup1:w2',
    'main1:m1',
    'main1:m2',
    'main2:m1',
    'main2:m2',
  ]);
});

test('lite means one round less, never under one', () => {
  expect(effectiveRounds(workout({ rounds: 3 }), true)).toBe(2);
  expect(effectiveRounds(workout({ rounds: 3 }), false)).toBe(3);
  expect(effectiveRounds(workout({ rounds: 1 }), true)).toBe(1);
  expect(buildSteps(workout({ rounds: 3 }), true).filter((s) => s.part === 'main')).toHaveLength(4);
});

test('progress lines', () => {
  const w = workout();
  const labels = buildSteps(w).map((s) => progressLabel(s, w, 2));
  expect(labels).toEqual([
    'Warm-up · 1 of 2',
    'Warm-up · 2 of 2',
    'Round 1 of 2 · move 1 of 2',
    'Round 1 of 2 · move 2 of 2',
    'Round 2 of 2 · move 1 of 2',
    'Round 2 of 2 · move 2 of 2',
  ]);
});

test('one round: plain move count, or Main when there is a warm-up or a cool-down', () => {
  const plain = workout({ warmup: [], cooldown: [], rounds: 1 });
  expect(buildSteps(plain).map((s) => progressLabel(s, plain, 1))).toEqual([
    'Move 1 of 2',
    'Move 2 of 2',
  ]);
  const withWarm = workout({ cooldown: [], rounds: 1 });
  expect(progressLabel(buildSteps(withWarm)[2], withWarm, 1)).toBe('Main · 1 of 2');
});

test('a round ends only on the last main move of a round that is not the last', () => {
  const w = workout({ rounds: 3 });
  const steps = buildSteps(w);
  const ends = steps.map((_, k) => endsRound(steps, k, 3));
  expect(ends).toEqual([false, false, false, true, false, true, false, false]);
});

test('a rest follows a main move only when the next one is main in the same round', () => {
  const steps = buildSteps(workout());
  expect(steps.map((_, k) => restFollows(steps, k))).toEqual([
    false, // warm-up to warm-up
    false, // warm-up to main
    true, // m1 to m2
    false, // end of round 1
    true, // m1 to m2 (round 2)
    false, // the last step
  ]);
});

test('rest seconds: the workout, else the program, else none', () => {
  const p = { restSeconds: 0 } as Program;
  expect(restSecondsOf(workout({ restSeconds: 20 }), p)).toBe(20);
  expect(restSecondsOf(workout(), p)).toBe(0);
  expect(restSecondsOf(workout(), { restSeconds: 15 } as Program)).toBe(15);
});

test('the log has the steps reached, with part and round, then the cool-down when it was done', () => {
  const w = workout();
  const log = movesLog(buildSteps(w), ['done', 'skipped', 'hurt']);
  expect(log).toEqual([
    { name: 'w1', part: 'warmup', round: 1, status: 'done' },
    { name: 'w2', part: 'warmup', round: 1, status: 'skipped' },
    { name: 'm1', part: 'main', round: 1, status: 'hurt' },
  ]);
  expect(movesLog(buildSteps(w), [], w.cooldown, 'done')).toEqual([
    { name: 'c1', part: 'cooldown', round: 1, status: 'done' },
  ]);
});

test('where she stopped: the move in front of her, or the last one finished', () => {
  const steps = buildSteps(workout());
  expect(stoppedAtOf(steps, 3, false, false, false)).toEqual({
    part: 'main',
    round: 1,
    move: 'm2',
  });
  // on a rest or the between screen, idx already points at the next move
  expect(stoppedAtOf(steps, 4, true, false, false)).toEqual({ part: 'main', round: 1, move: 'm2' });
  expect(stoppedAtOf(steps, 3, false, true, false)).toEqual({ part: 'main', round: 1, move: 'm1' });
  expect(stoppedAtOf(steps, 0, false, false, false)).toEqual({
    part: 'warmup',
    round: 1,
    move: 'w1',
  });
  expect(stoppedAtOf(steps, 6, false, false, true)).toEqual({
    part: 'cooldown',
    round: 1,
    move: null,
  });
});

test('rounds completed counts only rounds with every move answered', () => {
  const steps = buildSteps(workout());
  expect(roundsCompleted(steps, 3)).toBe(0);
  expect(roundsCompleted(steps, 4)).toBe(1);
  expect(roundsCompleted(steps, 5)).toBe(1);
  expect(roundsCompleted(steps, 6)).toBe(2);
});

test('home lines per part', () => {
  expect(partLines(workout({ rounds: 3 }))).toEqual([
    'Warm-up · 2 moves',
    'Main · 2 moves × 3 rounds',
    'Cool-down · 1 move',
  ]);
  expect(partLines(workout({ warmup: [], cooldown: [], rounds: 1 }))).toEqual(['Main · 2 moves']);
});

test('cool-down: left and right pairs fold into one row, each side', () => {
  const groups = groupStretchPairs([
    mv('Stretch one — left'),
    mv('Stretch one — right'),
    mv('Stretch two'),
    mv('Stretch three', { reps: '30 s each side' }),
  ]);
  expect(groups.map((g) => [g.name, g.eachSide, g.items.length])).toEqual([
    ['Stretch one', true, 2],
    ['Stretch two', false, 1],
    ['Stretch three', true, 1],
  ]);
});

test('cool-down length: timed holds as given, other moves 30 s, at least a minute', () => {
  expect(cooldownMinutes([mv('a')])).toBe(1);
  expect(cooldownMinutes([mv('a', { reps: undefined, seconds: 120 }), mv('b'), mv('c')])).toBe(3);
});
