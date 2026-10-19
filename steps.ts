// A workout as one flat list of steps: warm-up, then the main moves once per round.
// (The cool-down is one list screen after these, not steps.) Pure logic, unit tested.
import type { Move, MoveStatus, Part, Program, SessionMove, StoppedAt, Workout } from './types';

export interface Step {
  move: Move;
  part: 'warmup' | 'main';
  /** Main moves: 1..rounds. Warm-up: 1. */
  round: number;
  /** Position inside its part (and round), 1-based. */
  i: number;
  /** How many moves in that part (per round). */
  n: number;
}

/** Lite = one round less, never under 1. */
export function effectiveRounds(w: Workout, lite: boolean): number {
  return lite ? Math.max(1, w.rounds - 1) : w.rounds;
}

export function buildSteps(w: Workout, lite = false): Step[] {
  const steps: Step[] = [];
  w.warmup.forEach((move, k) =>
    steps.push({ move, part: 'warmup', round: 1, i: k + 1, n: w.warmup.length })
  );
  const rounds = effectiveRounds(w, lite);
  for (let r = 1; r <= rounds; r++) {
    w.main.forEach((move, k) =>
      steps.push({ move, part: 'main', round: r, i: k + 1, n: w.main.length })
    );
  }
  return steps;
}

/** The progress line for a step. */
export function progressLabel(step: Step, w: Workout, rounds: number): string {
  if (step.part === 'warmup') return `Warm-up · ${step.i} of ${step.n}`;
  if (rounds > 1) return `Round ${step.round} of ${rounds} · move ${step.i} of ${step.n}`;
  if (w.warmup.length > 0 || w.cooldown.length > 0) return `Main · ${step.i} of ${step.n}`;
  return `Move ${step.i} of ${step.n}`;
}

/** True when finishing step `idx` ends a round that is not the last one. */
export function endsRound(steps: Step[], idx: number, rounds: number): boolean {
  const s = steps[idx];
  return s !== undefined && s.part === 'main' && s.i === s.n && s.round < rounds;
}

/** True when a rest belongs between step `idx` and the next one (both main, same round). */
export function restFollows(steps: Step[], idx: number): boolean {
  const a = steps[idx];
  const b = steps[idx + 1];
  return (
    a !== undefined &&
    b !== undefined &&
    a.part === 'main' &&
    b.part === 'main' &&
    a.round === b.round
  );
}

/** Rest seconds for a workout: its own value, else the program's, else none. */
export function restSecondsOf(w: Workout, p: Program, override: number | null = null): number {
  if (override !== null) return override;
  return w.restSeconds ?? p.restSeconds ?? 0;
}

/** What happened, for the save: only the steps reached, then the cool-down moves. */
export function movesLog(
  steps: Step[],
  statuses: MoveStatus[],
  cooldown: Move[] = [],
  cooldownStatus: MoveStatus | null = null
): SessionMove[] {
  const log: SessionMove[] = statuses.map((status, k) => ({
    name: steps[k].move.name,
    part: steps[k].part,
    round: steps[k].round,
    status,
  }));
  if (cooldownStatus !== null) {
    for (const m of cooldown) {
      log.push({ name: m.name, part: 'cooldown', round: 1, status: cooldownStatus });
    }
  }
  return log;
}

/** Where she was when she stopped: the move in front of her, or the last one finished. */
export function stoppedAtOf(
  steps: Step[],
  idx: number,
  between: boolean,
  resting: boolean,
  inCooldown: boolean
): StoppedAt {
  if (inCooldown) return { part: 'cooldown', round: 1, move: null };
  const onNext = idx < steps.length && !between && !resting;
  const step = steps[onNext ? idx : Math.max(0, idx - 1)] ?? steps[0];
  return { part: step.part, round: step.round, move: step.move.name };
}

/** How many main rounds have every move answered. */
export function roundsCompleted(steps: Step[], statusCount: number): number {
  let done = 0;
  const rounds = Math.max(0, ...steps.filter((s) => s.part === 'main').map((s) => s.round));
  for (let r = 1; r <= rounds; r++) {
    const ofRound = steps
      .map((s, k) => ({ s, k }))
      .filter((x) => x.s.part === 'main' && x.s.round === r);
    if (ofRound.length > 0 && ofRound.every((x) => x.k < statusCount)) done += 1;
  }
  return done;
}

export function partLines(w: Workout): string[] {
  const lines: string[] = [];
  const count = (n: number): string => `${n} move${n === 1 ? '' : 's'}`;
  if (w.warmup.length > 0) lines.push(`Warm-up · ${count(w.warmup.length)}`);
  lines.push(
    w.rounds > 1
      ? `Main · ${count(w.main.length)} × ${w.rounds} rounds`
      : `Main · ${count(w.main.length)}`
  );
  if (w.cooldown.length > 0) lines.push(`Cool-down · ${count(w.cooldown.length)}`);
  return lines;
}

export interface StretchGroup {
  key: string;
  name: string;
  eachSide: boolean;
  items: Move[];
}

/**
 * Left/right pairs ("Name — left", "Name — right") fold into one row marked "each side".
 * A single move whose own amount says "each side" is marked too.
 */
export function groupStretchPairs(moves: Move[]): StretchGroup[] {
  const groups: StretchGroup[] = [];
  const byStem = new Map<string, StretchGroup>();
  for (const m of moves) {
    const match = /^(.+?)\s+[—–-]\s+(?:right|left)\b/i.exec(m.name);
    const stem = match?.[1];
    if (stem) {
      const existing = byStem.get(stem);
      if (existing) {
        existing.items.push(m);
        existing.eachSide = true;
        continue;
      }
    }
    const g: StretchGroup = {
      key: stem ?? m.name,
      name: stem ?? m.name,
      eachSide: /each side/i.test(m.reps ?? ''),
      items: [m],
    };
    groups.push(g);
    if (stem) byStem.set(stem, g);
  }
  return groups;
}

/** A rough length of the cool-down in minutes (at least 1): timed holds as given, others 30 s. */
export function cooldownMinutes(moves: Move[]): number {
  const sec = moves.reduce((total, m) => total + (m.seconds ?? 30), 0);
  return Math.max(1, Math.round(sec / 60));
}

export type { Part };
