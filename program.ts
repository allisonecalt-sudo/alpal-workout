// Reads what the store sends and checks its shape. Anything wrong becomes "no program",
// which the app shows as the "not loaded" message. It never invents a workout.
import type { GuestData, Move, Program, SessionSummary, Feel } from './types';

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseMove(raw: unknown): Move | null {
  if (!isObj(raw)) return null;
  const { name, how, reps, seconds } = raw;
  if (typeof name !== 'string' || name === '') return null;
  if (!Array.isArray(how) || !how.every((l) => typeof l === 'string')) return null;
  const hasReps = typeof reps === 'string' && reps !== '';
  const hasSeconds = typeof seconds === 'number' && seconds > 0;
  if (hasReps === hasSeconds) return null; // exactly one of the two
  const move: Move = { name, how: how as string[] };
  if (hasReps) move.reps = reps as string;
  else move.seconds = seconds as number;
  return move;
}

/** The store may send the week beside the data, or the data nested under "data". */
export function parseProgram(raw: unknown): Program | null {
  if (!isObj(raw)) return null;
  const data = isObj(raw.data) ? raw.data : raw;
  const week = typeof raw.week === 'number' ? raw.week : data.week;
  if (typeof week !== 'number') return null;
  const { label, minutes, sessionsPerWeek, moves, restSeconds, checkLabel } = data;
  if (typeof label !== 'string' || typeof minutes !== 'number') return null;
  if (typeof sessionsPerWeek !== 'number' || sessionsPerWeek < 1) return null;
  if (!Array.isArray(moves) || moves.length === 0) return null;
  const parsed: Move[] = [];
  for (const m of moves) {
    const pm = parseMove(m);
    if (!pm) return null;
    parsed.push(pm);
  }
  const program: Program = {
    week,
    label,
    minutes,
    sessionsPerWeek,
    moves: parsed,
    restSeconds: typeof restSeconds === 'number' ? restSeconds : 0,
  };
  if (typeof checkLabel === 'string' && checkLabel !== '') program.checkLabel = checkLabel;
  return program;
}

function parseFeel(v: unknown): Feel | null {
  return v === 'easy' || v === 'right' || v === 'hard' ? v : null;
}

function parseSession(raw: unknown): SessionSummary | null {
  if (!isObj(raw) || typeof raw.done_at !== 'string') return null;
  return {
    done_at: raw.done_at,
    week: typeof raw.week === 'number' ? raw.week : null,
    feel: parseFeel(raw.feel),
    check_0_10: typeof raw.check_0_10 === 'number' ? raw.check_0_10 : null,
  };
}

/** null means the store did not know the code. */
export function parseGuest(raw: unknown): GuestData | null {
  if (!isObj(raw)) return null;
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map(parseSession).filter((s): s is SessionSummary => s !== null)
    : [];
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    tellWhatsapp:
      typeof raw.tell_whatsapp === 'string' && raw.tell_whatsapp !== '' ? raw.tell_whatsapp : null,
    program: parseProgram(raw.program),
    sessions,
  };
}

/** How many sessions in each program week, newest week first. */
export function weeksSummary(sessions: { week: number | null }[]): { week: number; n: number }[] {
  const counts = new Map<number, number>();
  for (const s of sessions) {
    if (s.week === null) continue;
    counts.set(s.week, (counts.get(s.week) ?? 0) + 1);
  }
  return [...counts.entries()].map(([week, n]) => ({ week, n })).sort((a, b) => b.week - a.week);
}

export function movePlain(m: Move): string {
  return m.reps ?? `${m.seconds} s`;
}
