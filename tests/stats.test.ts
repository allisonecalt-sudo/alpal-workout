import { expect, test } from '@playwright/test';
import {
  beforeAfter,
  checkSeries,
  checkWords,
  countsByWeek,
  firstDoneAt,
  fullWeeks,
  holdGrowth,
  longestHold,
  nextChange,
  roundsByWeek,
  totalSeconds,
  usualPerWeek,
  weekState,
  weeksToShow,
  workoutsOnly,
} from '../stats';
import type { Program, SessionSummary, WeekInfo } from '../types';

let n = 0;
function s(over: Partial<SessionSummary> = {}): SessionSummary {
  n += 1;
  return {
    client_id: `s${n}`,
    done_at: new Date(2026, 9, 1 + n, 9, 0).toISOString(),
    started_at: null,
    duration_sec: 1800,
    lite: false,
    readings: {},
    moves: [],
    note: null,
    week: 1,
    workout: 'A',
    feel: null,
    check_0_10: null,
    ...over,
  };
}

test('walks never count: not in the week counts, not in full weeks', () => {
  const list = [s(), s(), s({ workout: 'walk' }), s({ workout: 'walk' })];
  expect(workoutsOnly(list)).toHaveLength(2);
  expect(countsByWeek(list).get(1)).toBe(2);
  expect(fullWeeks(list, 3)).toBe(0);
});

test('full weeks: weeks with at least sessionsPerWeek workouts', () => {
  const list = [
    ...[1, 2, 3].map(() => s({ week: 1 })),
    ...[1, 2].map(() => s({ week: 2 })),
    ...[1, 2, 3, 4].map(() => s({ week: 3 })),
  ];
  expect(fullWeeks(list, 3)).toBe(2);
});

test('week state: full, partial or none', () => {
  expect(weekState(3, 3)).toBe('full');
  expect(weekState(4, 3)).toBe('full');
  expect(weekState(2, 3)).toBe('partial');
  expect(weekState(0, 3)).toBe('none');
});

test('the first date is the oldest workout, ignoring walks', () => {
  const a = s({ done_at: '2026-10-12T08:00:00Z' });
  const w = s({ done_at: '2026-10-01T08:00:00Z', workout: 'walk' });
  expect(firstDoneAt([a, w])).toBe(Date.parse('2026-10-12T08:00:00Z'));
  expect(firstDoneAt([])).toBeNull();
});

test('total time and the longest hold', () => {
  const list = [
    s({ duration_sec: 1800, readings: { holds: { 'Hold one': [18, 20], 'Hold two': [25] } } }),
    s({ duration_sec: null, readings: { holds: { 'Hold one': [30] } } }),
  ];
  expect(totalSeconds(list)).toBe(1800);
  expect(longestHold(list)).toEqual({ name: 'Hold one', seconds: 30 });
  expect(longestHold([s()])).toBeNull();
});

test('the check in words: zeros out of the sessions that answered, and the highest', () => {
  const list = [s({ check_0_10: 0 }), s({ check_0_10: 2 }), s({ check_0_10: 0 }), s()];
  expect(checkWords(list, 'Test check')).toBe('Test check 0 on 2 of 3 · highest 2');
  expect(checkWords([s()], 'Test check')).toBeNull();
});

test('your usual: only from 4 full finished weeks on, never counting the open week', () => {
  const week = (w: number, c: number) => Array.from({ length: c }, () => s({ week: w }));
  const three = [...week(1, 3), ...week(2, 3), ...week(3, 3)];
  expect(usualPerWeek(three, 3, null)).toBeNull();
  const four = [...three, ...week(4, 3), ...week(5, 1)];
  expect(usualPerWeek(four, 3, 5)).toEqual({ usual: 3, full: 4 });
  // the open week, even if it is full, is not part of it
  expect(usualPerWeek([...three, ...week(4, 3)], 3, 4)).toBeNull();
});

test('hold growth: first to latest best-of-session, with its own since date', () => {
  const list = [
    s({ done_at: '2026-10-12T08:00:00Z', readings: { holds: { 'Hold one': [18, 15] } } }),
    s({
      done_at: '2026-10-14T08:00:00Z',
      readings: { holds: { 'Hold one': [20], 'Hold two': [10] } },
    }),
    s({ done_at: '2026-10-16T08:00:00Z', readings: { holds: { 'Hold one': [30, 25] } } }),
  ];
  const g = holdGrowth(list);
  expect(g.find((x) => x.name === 'Hold one')).toMatchObject({
    first: 18,
    latest: 30,
    sessions: 3,
  });
  expect(g.find((x) => x.name === 'Hold one')?.sinceMs).toBe(Date.parse('2026-10-12T08:00:00Z'));
  // a move held only once has its own since date and a single session
  expect(g.find((x) => x.name === 'Hold two')).toMatchObject({
    first: 10,
    latest: 10,
    sessions: 1,
  });
});

test('rounds per week: the most rounds in one session', () => {
  const mv = (round: number) => ({
    name: 'M',
    part: 'main' as const,
    round,
    status: 'done' as const,
  });
  const list = [
    s({ week: 1, moves: [mv(1), mv(2)] }),
    s({ week: 1, moves: [mv(1)] }),
    s({ week: 2, moves: [mv(1), mv(2), mv(3)] }),
    s({ week: 3, moves: [] }),
  ];
  expect(roundsByWeek(list)).toEqual([
    { week: 1, rounds: 2 },
    { week: 2, rounds: 3 },
  ]);
});

test('the check series is oldest first and skips sessions with no answer', () => {
  const list = [
    s({ done_at: '2026-10-14T08:00:00Z', check_0_10: 2 }),
    s({ done_at: '2026-10-12T08:00:00Z', check_0_10: 0 }),
    s({ done_at: '2026-10-13T08:00:00Z' }),
  ];
  expect(checkSeries(list)).toEqual([0, 2]);
});

test('before and after averages need 3 sessions with both numbers', () => {
  const pair = (b: number, a: number) =>
    s({
      readings: { before: { body: b, mood: null, check: null }, after: { body: a, mood: null } },
    });
  expect(beforeAfter([pair(4, 6), pair(5, 5)], 'body')).toBeNull();
  const r = beforeAfter([pair(4, 6), pair(5, 5), pair(6, 7)], 'body');
  expect(r?.n).toBe(3);
  expect(r?.before).toBeCloseTo(5);
  expect(r?.after).toBeCloseTo(6);
  expect(beforeAfter([pair(4, 6), pair(5, 5), pair(6, 7)], 'mood')).toBeNull();
});

test('weeks to show: the store list, or one made from what is known', () => {
  const program = { week: 2, label: 'Week 2' } as Program;
  const store: WeekInfo[] = [{ week: 1, label: 'Week 1', active: false, workouts: [] }];
  expect(weeksToShow(store, program, [])).toBe(store);
  const made = weeksToShow([], program, [s({ week: 1 })]);
  expect(made.map((w) => [w.week, w.active])).toEqual([
    [1, false],
    [2, true],
  ]);
});

test('next week: moves added and removed, by name', () => {
  const now: WeekInfo = {
    week: 1,
    label: 'Week 1',
    active: true,
    workouts: [{ id: 'A', name: 'Workout A', moves: ['One', 'Two', 'Three'] }],
  };
  const mv = (name: string) => ({ name, how: [], reps: '1' });
  const next = {
    workouts: [{ warmup: [mv('One')], main: [mv('Two'), mv('Four')], cooldown: [] }],
  } as unknown as Program;
  expect(nextChange(now, next)).toEqual({ added: ['Four'], removed: ['Three'] });
  const same = {
    workouts: [{ warmup: [], main: [mv('One'), mv('Two'), mv('Three')], cooldown: [] }],
  };
  expect(nextChange(now, same as unknown as Program)).toEqual({ added: [], removed: [] });
});
