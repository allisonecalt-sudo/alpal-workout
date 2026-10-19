// A workout as one flat list of steps: warm-up, then the main moves once per round.
// (The cool-down is one list screen after these, not steps.) A move with `options` (a cardio
// choice) is one choice step until she picks; then the chosen option's moves take its place.
// Pure logic, unit tested.
import type { Move, MoveStatus, Program, SessionMove, StoppedAt, Workout } from './types';

export interface Step {
  move: Move;
  part: 'warmup' | 'main';
  /** Main moves: 1..rounds. Warm-up: 1. */
  round: number;
  /** Position inside its part (and round), 1-based. */
  i: number;
  /** How many moves in that part (per round). */
  n: number;
  /** The last step of its part and round. */
  last: boolean;
  /** Set on a choice step and on the steps that replaced it: which choice it was. */
  choiceKey?: string;
  /** Set on the steps of a chosen option: its label, and the position inside it. */
  optionLabel?: string;
  sub?: { i: number; n: number };
  /** An option's timed moves go on by themselves, with their get-ready. */
  auto?: boolean;
}

export function stepKey(part: string, round: number, i: number): string {
  return `${part}:${round}:${i}`;
}

/** A choice step: has options and none is chosen yet. */
export function isChoiceStep(s: Step): boolean {
  return s.move.options !== undefined && s.move.options.length > 0 && s.optionLabel === undefined;
}

/** Lite = one round less, never under 1. */
export function effectiveRounds(w: Workout, lite: boolean): number {
  return lite ? Math.max(1, w.rounds - 1) : w.rounds;
}

function expand(
  moves: Move[],
  part: 'warmup' | 'main',
  round: number,
  choices: Record<string, number>
): Step[] {
  const out: Step[] = [];
  moves.forEach((move, k) => {
    const i = k + 1;
    const n = moves.length;
    if (move.options && move.options.length > 0) {
      const key = stepKey(part, round, i);
      const option = choices[key] !== undefined ? move.options[choices[key]] : undefined;
      if (option) {
        option.moves.forEach((m, j) =>
          out.push({
            move: m,
            part,
            round,
            i,
            n,
            last: false,
            choiceKey: key,
            optionLabel: option.label,
            sub: { i: j + 1, n: option.moves.length },
            auto: true,
          })
        );
        return;
      }
      out.push({ move, part, round, i, n, last: false, choiceKey: key });
      return;
    }
    out.push({ move, part, round, i, n, last: false });
  });
  return out;
}

export function buildSteps(w: Workout, lite = false, choices: Record<string, number> = {}): Step[] {
  const steps: Step[] = [...expand(w.warmup, 'warmup', 1, choices)];
  const rounds = effectiveRounds(w, lite);
  for (let r = 1; r <= rounds; r++) steps.push(...expand(w.main, 'main', r, choices));
  steps.forEach((s, k) => {
    const next = steps[k + 1];
    s.last = next === undefined || next.part !== s.part || next.round !== s.round;
  });
  return steps;
}

/** The progress line for a step. */
export function progressLabel(step: Step, w: Workout, rounds: number): string {
  let base: string;
  if (step.part === 'warmup') base = `Warm-up · ${step.i} of ${step.n}`;
  else if (rounds > 1) base = `Round ${step.round} of ${rounds} · move ${step.i} of ${step.n}`;
  else if (w.warmup.length > 0 || w.cooldown.length > 0) base = `Main · ${step.i} of ${step.n}`;
  else base = `Move ${step.i} of ${step.n}`;
  if (step.optionLabel && step.sub) base += ` · ${step.optionLabel} ${step.sub.i} of ${step.sub.n}`;
  return base;
}

/** True when finishing step `idx` ends a round that is not the last one. */
export function endsRound(steps: Step[], idx: number, rounds: number): boolean {
  const s = steps[idx];
  return s !== undefined && s.part === 'main' && s.last && s.round < rounds;
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

/** Rest seconds for a workout: her own choice, else the workout's, else the program's, else none. */
export function restSecondsOf(w: Workout, p: Program, override: number | null = null): number {
  if (override !== null) return override;
  return w.restSeconds ?? p.restSeconds ?? 0;
}

/** What happened, for the save: only the steps reached, then the cool-down moves. */
export function movesLog(
  steps: Step[],
  statuses: (MoveStatus | null)[],
  cooldown: Move[] = [],
  cooldownStatus: MoveStatus | null = null
): SessionMove[] {
  const log: SessionMove[] = [];
  steps.forEach((s, k) => {
    const status = statuses[k];
    if (!status) return;
    const entry: SessionMove = { name: s.move.name, part: s.part, round: s.round, status };
    if (s.optionLabel) entry.option = s.optionLabel;
    log.push(entry);
  });
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
  const step = steps[onNext ? idx : Math.max(0, Math.min(idx, steps.length) - 1)] ?? steps[0];
  return { part: step.part, round: step.round, move: step.move.name };
}

/** How many main rounds have every move answered. */
export function roundsCompleted(steps: Step[], statuses: (MoveStatus | null)[]): number {
  const rounds = Math.max(0, ...steps.filter((s) => s.part === 'main').map((s) => s.round));
  let done = 0;
  for (let r = 1; r <= rounds; r++) {
    const ofRound = steps
      .map((s, k) => ({ s, k }))
      .filter((x) => x.s.part === 'main' && x.s.round === r);
    if (ofRound.length > 0 && ofRound.every((x) => statuses[x.k])) done += 1;
  }
  return done;
}

/** The steps she skipped, in order (the ones to offer again at the end). */
export function skippedSteps(statuses: (MoveStatus | null)[], steps: Step[]): number[] {
  const out: number[] = [];
  statuses.forEach((s, k) => {
    // "Skip cardio today" is a decision, not something to come back to
    if (s === 'skipped' && steps[k] && !isChoiceStep(steps[k])) out.push(k);
  });
  return out;
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

/** Names of moves flagged new, anywhere in the workout (for the Before screen's meta line). */
export function newMoveNames(w: Workout): string[] {
  const names: string[] = [];
  const visit = (m: Move): void => {
    if (m.new && !names.includes(m.name)) names.push(m.name);
    m.options?.forEach((o) => o.moves.forEach(visit));
  };
  [...w.warmup, ...w.main, ...w.cooldown].forEach(visit);
  return names;
}
