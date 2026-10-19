import { expect, test } from '@playwright/test';
import { afterReload, heldSoFar, newHold, redoHold, startHold, stopHold, tickHold } from '../hold';

const T0 = 1_000_000;

test('a new hold is Ready with the full time and a 3 second get-ready', () => {
  const h = newHold(30);
  expect(h.phase).toBe('ready');
  expect(h.run.durationMs).toBe(30_000);
  expect(h.pre.durationMs).toBe(3000);
});

test('Start begins the get-ready; when it ends the hold begins with a go', () => {
  let h = startHold(newHold(30), T0);
  expect(h.phase).toBe('pre');
  let out = tickHold(h, T0 + 100);
  expect(out.event).toBe('count'); // 3
  h = out.hold;
  out = tickHold(h, T0 + 200);
  expect(out.event).toBeNull(); // the same second does not beep twice
  out = tickHold(out.hold, T0 + 1100);
  expect(out.event).toBe('count'); // 2
  out = tickHold(out.hold, T0 + 2100);
  expect(out.event).toBe('count'); // 1
  out = tickHold(out.hold, T0 + 3000);
  expect(out.event).toBe('go');
  expect(out.hold.phase).toBe('hold');
});

test('a get-ready of 0 goes straight to the hold', () => {
  const h = startHold(newHold(30, 0), T0);
  expect(h.phase).toBe('hold');
});

test('the hold counts the last 3 seconds, then finishes with the full seconds held', () => {
  let h = startHold(newHold(5, 0), T0);
  const events: string[] = [];
  for (let ms = 100; ms <= 5200; ms += 250) {
    const out = tickHold(h, T0 + ms);
    h = out.hold;
    if (out.event) events.push(`${out.event}@${Math.round(ms / 1000)}`);
  }
  expect(events.filter((e) => e.startsWith('count')).length).toBe(3);
  expect(events[events.length - 1]).toMatch(/^finish/);
  expect(h.phase).toBe('held');
  expect(h.heldSec).toBe(5);
});

test('Stop keeps the real seconds held', () => {
  const h = startHold(newHold(30, 0), T0);
  const stopped = stopHold(h, T0 + 18_200);
  expect(stopped.phase).toBe('held');
  expect(stopped.heldSec).toBe(18);
  // stopping when not holding does nothing
  expect(stopHold(newHold(30), T0).phase).toBe('ready');
});

test('held so far never goes over the hold or under zero', () => {
  const h = startHold(newHold(10, 0), T0);
  expect(heldSoFar(h, T0 - 5000)).toBe(0);
  expect(heldSoFar(h, T0 + 99_000)).toBe(10);
});

test('Redo starts that hold over', () => {
  const held = stopHold(startHold(newHold(30, 0), T0), T0 + 10_000);
  const again = redoHold(held);
  expect(again.phase).toBe('ready');
  expect(again.heldSec).toBe(0);
  expect(again.run.durationMs).toBe(30_000);
});

test('after a reload a get-ready starts over', () => {
  const pre = startHold(newHold(30), T0);
  expect(afterReload(pre, T0 + 1000).phase).toBe('ready');
});

test('after a reload a running hold counts what the timer would have shown, up to the moment the page is back', () => {
  let h = startHold(newHold(30, 0), T0);
  h = tickHold(h, T0 + 4500).hold; // the last number shown was about 4 or 5 s
  // the page was gone 8 more seconds: the timer would have shown about 12 or 13
  const back = afterReload(h, T0 + 4500 + 8000);
  expect(back.phase).toBe('held');
  expect(back.heldSec).toBe(13); // 12.5 s rounds to 13
  expect(back.shown).toBe(13);
});

test('the count is capped at the hold length', () => {
  const h = startHold(newHold(30, 0), T0);
  expect(afterReload(h, T0 + 120_000).heldSec).toBe(30);
});

test('after that first moment idle time never counts, and a second reload adds nothing', () => {
  const h = startHold(newHold(30, 0), T0);
  const first = afterReload(h, T0 + 12_000);
  expect(first.heldSec).toBe(12);
  expect(afterReload(first, T0 + 60_000)).toEqual(first);
  expect(afterReload(afterReload(first, T0 + 90_000), T0 + 200_000).heldSec).toBe(12);
});

test('a hold that was paused counts only what the timer showed when it was paused', () => {
  let h = startHold(newHold(30, 0), T0);
  h = { ...h, run: { ...h.run, startedAt: null, usedMs: 7000 } }; // frozen at 7 s
  expect(afterReload(h, T0 + 500_000).heldSec).toBe(7);
});
