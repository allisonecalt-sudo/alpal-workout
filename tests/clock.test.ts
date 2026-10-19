import { expect, test } from '@playwright/test';
import { formatClock, formatDayClock, inputClock, minutesAgo, sameDay, withClock } from '../clock';

// local time, so these hold in any zone
const at = (h: number, m: number, s = 0) => new Date(2026, 9, 19, h, m, s).getTime();

test('shown time has no leading zero on the hour; an input value does', () => {
  expect(formatClock(at(9, 4))).toBe('9:04');
  expect(formatClock(at(14, 30))).toBe('14:30');
  expect(inputClock(at(9, 4))).toBe('09:04');
});

test('a time picked on the clock keeps the same day', () => {
  const picked = withClock(at(9, 42, 30), '08:15');
  expect(new Date(picked).getDate()).toBe(19);
  expect(formatClock(picked)).toBe('8:15');
  expect(new Date(picked).getSeconds()).toBe(0);
  // junk leaves it alone
  expect(withClock(at(9, 42), 'nope')).toBe(at(9, 42));
  expect(withClock(at(9, 42), '25:00')).toBe(at(9, 42));
});

test('minutes ago is on the minute', () => {
  const t = minutesAgo(at(9, 42, 40), 10);
  expect(formatClock(t)).toBe('9:32');
  expect(new Date(t).getSeconds()).toBe(0);
});

test('the same-day test follows the calendar day, so a card ends at midnight', () => {
  expect(sameDay(at(0, 5), at(23, 59))).toBe(true);
  expect(sameDay(new Date(2026, 9, 18, 23, 59).getTime(), at(0, 1))).toBe(false);
});

test('day and clock for the left-open card', () => {
  // 19 Oct 2026 is a Monday
  expect(formatDayClock(at(9, 12))).toBe('Mon 9:12');
});
