import { expect, test } from '@playwright/test';
import { movePlain, parseGuest, parseProgram, weeksSummary } from '../program';

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
  expect(p?.moves).toHaveLength(2);
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

test('weeks summary: counts per week, newest first, skips unknown weeks', () => {
  expect(weeksSummary([{ week: 1 }, { week: 2 }, { week: 1 }, { week: null }])).toEqual([
    { week: 2, n: 1 },
    { week: 1, n: 2 },
  ]);
});

test('move amount: reps as written, seconds with s', () => {
  expect(movePlain({ name: 'A', how: [], reps: '5 each side' })).toBe('5 each side');
  expect(movePlain({ name: 'A', how: [], seconds: 30 })).toBe('30 s');
});
