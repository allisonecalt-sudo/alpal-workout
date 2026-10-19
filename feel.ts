// How each move felt: Easy, Right or Hard, per move and per round. Pure logic, unit tested.
// A move done in several rounds keeps one entry per round, in order (a round she did not rate
// is null), e.g. ["right", "hard"]. Nothing is kept for a move she never rated.
import type { Feel } from './types';

export type FeelList = (Feel | null)[];
export type MoveFeels = Record<string, FeelList>;

/** What she said about this move in this round (rounds count from 1), or null. */
export function feelAt(feels: MoveFeels, name: string, round: number): Feel | null {
  return feels[name]?.[round - 1] ?? null;
}

/** Set or clear (null) one round's answer. Trailing blanks are dropped; an empty list goes. */
export function setFeel(feels: MoveFeels, name: string, round: number, value: Feel | null): void {
  const list: FeelList = [...(feels[name] ?? [])];
  while (list.length < round) list.push(null);
  list[round - 1] = value;
  while (list.length > 0 && list[list.length - 1] === null) list.pop();
  if (list.length === 0) delete feels[name];
  else feels[name] = list;
}

/** Older sessions kept one word per move; newer ones keep a list. Both read as a list. */
export function asFeelList(v: unknown, parse: (x: unknown) => Feel | null): FeelList | null {
  const raw = Array.isArray(v) ? v : [v];
  const list = raw.map((x) => parse(x));
  while (list.length > 0 && list[list.length - 1] === null) list.pop();
  return list.length > 0 ? list : null;
}
