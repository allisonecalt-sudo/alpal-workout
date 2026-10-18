// A workout as one flat list of steps: warm-up, the main moves once per round, cool-down.
// Pure logic, so the flow can be unit tested.
import type { Move, MoveStatus, Part, SessionMove, Workout } from './types';

export interface Step {
  move: Move;
  part: Part;
  /** Main moves: 1..rounds. Warm-up and cool-down: 1. */
  round: number;
  /** Position inside its part (and round), 1-based. */
  i: number;
  /** How many moves in that part (per round). */
  n: number;
}

export function buildSteps(w: Workout): Step[] {
  const steps: Step[] = [];
  w.warmup.forEach((move, k) =>
    steps.push({ move, part: 'warmup', round: 1, i: k + 1, n: w.warmup.length })
  );
  for (let r = 1; r <= w.rounds; r++) {
    w.main.forEach((move, k) =>
      steps.push({ move, part: 'main', round: r, i: k + 1, n: w.main.length })
    );
  }
  w.cooldown.forEach((move, k) =>
    steps.push({ move, part: 'cooldown', round: 1, i: k + 1, n: w.cooldown.length })
  );
  return steps;
}

/** The progress line for a step. */
export function progressLabel(step: Step, w: Workout): string {
  if (step.part === 'warmup') return `Warm-up · ${step.i} of ${step.n}`;
  if (step.part === 'cooldown') return `Cool-down · ${step.i} of ${step.n}`;
  if (w.rounds > 1) return `Round ${step.round} of ${w.rounds} · move ${step.i} of ${step.n}`;
  if (w.warmup.length > 0 || w.cooldown.length > 0) return `Main · ${step.i} of ${step.n}`;
  return `Move ${step.i} of ${step.n}`;
}

/** True when finishing step `idx` ends a round that is not the last one. */
export function endsRound(steps: Step[], idx: number, w: Workout): boolean {
  const s = steps[idx];
  return s !== undefined && s.part === 'main' && s.i === s.n && s.round < w.rounds;
}

/** What happened, for the save: only the steps she reached. */
export function movesLog(steps: Step[], statuses: MoveStatus[]): SessionMove[] {
  return statuses.map((status, k) => ({
    name: steps[k].move.name,
    part: steps[k].part,
    round: steps[k].round,
    status,
  }));
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
