import { expect, test } from '@playwright/test';
import { doneIds, movePlain, parseGuest, parseProgram, upNext, weekRows } from '../program';

const base = {
  week: 2,
  label: 'Week 2',
  minutes: 10,
  sessionsPerWeek: 3,
  restSeconds: 0,
  moves: [
    { name: 'Move one', how: ['Line one'], reps: '8 times' },
    { name: 'Move two', how: ['Line one', 'Line two'], seconds: 30 },
  ],
};

test('program: week beside the data', () => {
  const p = parseProgram(base);
  expect(p?.week).toBe(2);
  // the old flat shape reads as one workout with one round
  expect(p?.workouts).toHaveLength(1);
  expect(p?.workouts[0].main).toHaveLength(2);
  expect(p?.workouts[0].rounds).toBe(1);
  expect(p?.workouts[0].minutes).toBe(10);
});

test('program: data nested under "data" is accepted too', () => {
  const { week, ...data } = base;
  const p = parseProgram({ week, data });
  expect(p?.label).toBe('Week 2');
});

test('program: a move needs exactly one of reps or seconds', () => {
  const both = { ...base, moves: [{ name: 'X', how: [], reps: '1', seconds: 5 }] };
  const neither = { ...base, moves: [{ name: 'X', how: [] }] };
  expect(parseProgram(both)).toBeNull();
  expect(parseProgram(neither)).toBeNull();
});

test('program: empty or malformed means null, never a made-up workout', () => {
  expect(parseProgram(null)).toBeNull();
  expect(parseProgram({})).toBeNull();
  expect(parseProgram({ ...base, moves: [] })).toBeNull();
  expect(parseProgram({ ...base, sessionsPerWeek: 0 })).toBeNull();
});

test('guest: null for an unknown code, program null when missing', () => {
  expect(parseGuest(null)).toBeNull();
  const g = parseGuest({ name: 'Test User', tell_whatsapp: null, program: null, sessions: [] });
  expect(g?.program).toBeNull();
  expect(g?.tellWhatsapp).toBeNull();
});

test('move amount: reps as written, seconds with s', () => {
  expect(movePlain({ name: 'A', how: [], reps: '5 each side' })).toBe('5 each side');
  expect(movePlain({ name: 'A', how: [], seconds: 30 })).toBe('30 s');
});

const rounds = {
  week: 1,
  label: 'Week 1',
  sessionsPerWeek: 3,
  workouts: [
    {
      id: 'A',
      name: 'Workout A',
      minutes: 30,
      warmup: [{ name: 'W', how: ['x'], reps: '1 time' }],
      main: [
        {
          name: 'M',
          how: ['x'],
          seconds: 20,
          video: 'https://youtu.be/abcdefghijk',
          why: 'Reason',
          tips: ['t1'],
          watchOut: ['w1'],
        },
      ],
      rounds: 3,
      cooldown: [{ name: 'C', how: ['x'], reps: '1 time' }],
    },
    { id: 'B', name: 'Workout B', minutes: 20, main: [{ name: 'M', how: [], reps: '2' }] },
  ],
};

test('program: several workouts with rounds, extra move info kept', () => {
  const p = parseProgram(rounds);
  expect(p?.workouts.map((w) => w.id)).toEqual(['A', 'B']);
  expect(p?.workouts[0].rounds).toBe(3);
  expect(p?.workouts[1].rounds).toBe(1); // defaults to 1
  expect(p?.workouts[1].warmup).toEqual([]); // optional
  expect(p?.workouts[0].main[0]).toMatchObject({
    video: 'https://youtu.be/abcdefghijk',
    why: 'Reason',
    tips: ['t1'],
    watchOut: ['w1'],
  });
});

test('program: a workout with no main moves, a bad move or a repeated id is invalid', () => {
  const w = rounds.workouts;
  expect(parseProgram({ ...rounds, workouts: [{ ...w[0], main: [] }] })).toBeNull();
  expect(parseProgram({ ...rounds, workouts: [{ ...w[0], warmup: [{ name: 'X' }] }] })).toBeNull();
  expect(parseProgram({ ...rounds, workouts: [w[0], { ...w[1], id: 'A' }] })).toBeNull();
  expect(parseProgram({ ...rounds, workouts: [] })).toBeNull();
});

test('guest: questions and the answered count come through; ids may be numbers', () => {
  const g = parseGuest({
    name: 'Test User',
    program: null,
    sessions: [{ done_at: '2026-10-12T08:00:00Z', week: 1, workout: 'A' }],
    questions: [{ id: 7, section: 'S', text: 'Question one?' }, { id: 'x' }],
    answered: 4,
  });
  expect(g?.questions).toEqual([{ id: '7', section: 'S', text: 'Question one?' }]);
  expect(g?.answered).toBe(4);
  expect(g?.sessions[0].workout).toBe('A');
});

test('up next: the first workout, in the data order, not done this week', () => {
  const p = parseProgram(rounds);
  const ws = p?.workouts ?? [];
  expect(upNext(ws, new Set())?.id).toBe('A');
  expect(upNext(ws, new Set(['A']))?.id).toBe('B');
  expect(upNext(ws, new Set(['B']))?.id).toBe('A');
  expect(upNext(ws, new Set(['A', 'B']))).toBeNull();
});

test('done ids count only this program week', () => {
  const ids = doneIds(
    [
      { week: 1, workout: 'A' },
      { week: 2, workout: 'B' },
      { week: 1, workout: null },
    ],
    1
  );
  expect([...ids]).toEqual(['A']);
});

test('weeks list: letters with a tick when done, newest first', () => {
  const p = parseProgram(rounds);
  if (!p) throw new Error('program');
  expect(
    weekRows(
      [
        { week: 1, workout: 'A' },
        { week: 2, workout: 'B' },
        { week: 1, workout: 'B' },
        { week: 1, workout: 'A' },
      ],
      p
    )
  ).toEqual(['Week 2 · A B ✓', 'Week 1 · A ✓ B ✓']);
});

test('weeks list for one workout: a count out of sessions per week', () => {
  const p = parseProgram(base);
  if (!p) throw new Error('program');
  expect(
    weekRows(
      [
        { week: 1, workout: null },
        { week: 1, workout: null },
      ],
      p
    )
  ).toEqual(['Week 1 · 2 of 3']);
});
