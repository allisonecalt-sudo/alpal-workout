import { expect, test } from '@playwright/test';
import { asFeelList, feelAt, setFeel, type MoveFeels } from '../feel';
import { parseGuest } from '../program';

const parse = (x: unknown) => (x === 'easy' || x === 'right' || x === 'hard' ? x : null);

test('setFeel keeps one entry per round and trims trailing blanks', () => {
  const m: MoveFeels = {};
  setFeel(m, 'Move', 2, 'hard');
  expect(m).toEqual({ Move: [null, 'hard'] });
  setFeel(m, 'Move', 1, 'right');
  expect(m).toEqual({ Move: ['right', 'hard'] });
  setFeel(m, 'Move', 2, null);
  expect(m).toEqual({ Move: ['right'] });
  setFeel(m, 'Move', 1, null);
  expect(m).toEqual({});
});

test('feelAt reads a round, or null', () => {
  const m: MoveFeels = { Move: ['right', 'hard'] };
  expect(feelAt(m, 'Move', 1)).toBe('right');
  expect(feelAt(m, 'Move', 2)).toBe('hard');
  expect(feelAt(m, 'Move', 3)).toBeNull();
  expect(feelAt(m, 'Other', 1)).toBeNull();
});

test('the older one-word shape reads as a one-round list; junk is dropped', () => {
  expect(asFeelList('hard', parse)).toEqual(['hard']);
  expect(asFeelList(['right', null, 'hard'], parse)).toEqual(['right', null, 'hard']);
  expect(asFeelList([null, 'nonsense'], parse)).toBeNull();
  expect(asFeelList('nonsense', parse)).toBeNull();
});

test('a session from the store keeps its lists', () => {
  const g = parseGuest({
    name: 'Test User',
    program: null,
    sessions: [
      {
        done_at: '2026-10-12T08:00:00Z',
        week: 1,
        readings: { move_feel: { A: ['right', 'hard'], B: 'easy', C: [] } },
      },
    ],
  });
  expect(g?.sessions[0].readings.move_feel).toEqual({ A: ['right', 'hard'], B: ['easy'] });
});
