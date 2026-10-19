// Reads what the store sends and checks its shape. Anything wrong becomes "no program",
// which the app shows as the "not loaded" message. It never invents a workout.
import type { Feel, GuestData, Move, Program, Question, SessionSummary, Workout } from './types';

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strings(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const list = v.filter((x): x is string => typeof x === 'string' && x !== '');
  return list.length > 0 ? list : undefined;
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
  if (typeof raw.video === 'string' && raw.video !== '') move.video = raw.video;
  if (typeof raw.why === 'string' && raw.why !== '') move.why = raw.why;
  const tips = strings(raw.tips);
  if (tips) move.tips = tips;
  const watchOut = strings(raw.watchOut);
  if (watchOut) move.watchOut = watchOut;
  // pictures: only our own files or https links, at most two
  const images = strings(raw.images)
    ?.filter((u) => /^(assets\/|https:\/\/)/.test(u))
    .slice(0, 2);
  if (images && images.length > 0) move.images = images;
  return move;
}

/** A missing list is empty; a list with a bad move makes the whole thing invalid (null). */
function parseMoves(raw: unknown, required: boolean): Move[] | null {
  if (raw === undefined || raw === null) return required ? null : [];
  if (!Array.isArray(raw)) return null;
  if (required && raw.length === 0) return null;
  const out: Move[] = [];
  for (const m of raw) {
    const pm = parseMove(m);
    if (!pm) return null;
    out.push(pm);
  }
  return out;
}

function parseWorkout(raw: unknown): Workout | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (typeof raw.name !== 'string' || typeof raw.minutes !== 'number') return null;
  const main = parseMoves(raw.main, true);
  const warmup = parseMoves(raw.warmup, false);
  const cooldown = parseMoves(raw.cooldown, false);
  if (!main || !warmup || !cooldown) return null;
  const rounds =
    typeof raw.rounds === 'number' && Number.isInteger(raw.rounds) && raw.rounds >= 1
      ? raw.rounds
      : 1;
  const workout: Workout = {
    id: raw.id,
    name: raw.name,
    minutes: raw.minutes,
    warmup,
    main,
    rounds,
    cooldown,
  };
  if (typeof raw.restSeconds === 'number' && raw.restSeconds > 0) {
    workout.restSeconds = Math.round(raw.restSeconds);
  }
  return workout;
}

/**
 * The store may send the week beside the data, or the data nested under "data". The old
 * shape (a flat "moves" list) is read as one workout with one round.
 */
export function parseProgram(raw: unknown): Program | null {
  if (!isObj(raw)) return null;
  const data = isObj(raw.data) ? raw.data : raw;
  const week = typeof raw.week === 'number' ? raw.week : data.week;
  if (typeof week !== 'number') return null;
  const { label, sessionsPerWeek, restSeconds, checkLabel } = data;
  if (typeof label !== 'string') return null;
  if (typeof sessionsPerWeek !== 'number' || sessionsPerWeek < 1) return null;

  let workouts: Workout[];
  if (Array.isArray(data.workouts)) {
    workouts = [];
    for (const w of data.workouts) {
      const pw = parseWorkout(w);
      if (!pw) return null;
      workouts.push(pw);
    }
    if (workouts.length === 0) return null;
    if (new Set(workouts.map((w) => w.id)).size !== workouts.length) return null;
  } else {
    const moves = parseMoves(data.moves, true);
    if (!moves || typeof data.minutes !== 'number') return null;
    workouts = [
      {
        id: 'A',
        name: label,
        minutes: data.minutes,
        warmup: [],
        main: moves,
        rounds: 1,
        cooldown: [],
      },
    ];
  }
  const program: Program = {
    week,
    label,
    sessionsPerWeek,
    workouts,
    restSeconds: typeof restSeconds === 'number' ? restSeconds : 0,
  };
  if (typeof checkLabel === 'string' && checkLabel !== '') program.checkLabel = checkLabel;
  const safety = strings(data.safety);
  if (safety) program.safety = safety;
  if (typeof data.painRule === 'string' && data.painRule !== '') program.painRule = data.painRule;
  return program;
}

function parseFeel(v: unknown): Feel | null {
  return v === 'easy' || v === 'right' || v === 'hard' ? v : null;
}

function parseSession(raw: unknown): SessionSummary | null {
  if (!isObj(raw) || typeof raw.done_at !== 'string') return null;
  return {
    client_id: typeof raw.client_id === 'string' ? raw.client_id : null,
    done_at: raw.done_at,
    week: typeof raw.week === 'number' ? raw.week : null,
    workout: typeof raw.workout === 'string' && raw.workout !== '' ? raw.workout : null,
    feel: parseFeel(raw.feel),
    check_0_10: typeof raw.check_0_10 === 'number' ? raw.check_0_10 : null,
  };
}

function parseQuestion(raw: unknown): Question | null {
  if (!isObj(raw) || typeof raw.text !== 'string' || raw.text === '') return null;
  if (typeof raw.id !== 'string' && typeof raw.id !== 'number') return null;
  return {
    id: String(raw.id),
    section: typeof raw.section === 'string' ? raw.section : '',
    text: raw.text,
  };
}

/** null means the store did not know the code. */
export function parseGuest(raw: unknown): GuestData | null {
  if (!isObj(raw)) return null;
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map(parseSession).filter((s): s is SessionSummary => s !== null)
    : [];
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map(parseQuestion).filter((q): q is Question => q !== null)
    : [];
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    tellWhatsapp:
      typeof raw.tell_whatsapp === 'string' && raw.tell_whatsapp !== '' ? raw.tell_whatsapp : null,
    program: parseProgram(raw.program),
    sessions,
    questions,
    answered: typeof raw.answered === 'number' ? raw.answered : 0,
  };
}

export interface SessionLite {
  week: number | null;
  workout: string | null;
  done_at?: string;
}

/** Which workouts are done in this program week. */
export function doneIds(sessions: SessionLite[], week: number): Set<string> {
  const ids = new Set<string>();
  for (const s of sessions) if (s.week === week && s.workout !== null) ids.add(s.workout);
  return ids;
}

/** How many sessions count toward this program week (any workout). */
export function sessionsThisWeek(sessions: SessionLite[], week: number): number {
  return sessions.filter((s) => s.week === week).length;
}

/** The week is done only when the session count reaches sessionsPerWeek. */
export function weekIsDone(sessions: SessionLite[], program: Program): boolean {
  return sessionsThisWeek(sessions, program.week) >= program.sessionsPerWeek;
}

/**
 * Up next: the first workout, in the data's order, not yet done this week. When every one has
 * been done once, cycle back to the one done the fewest times this week, then the one done
 * longest ago. (The caller decides whether the week is already done.)
 */
export function nextWorkout(
  workouts: Workout[],
  sessions: SessionLite[],
  week: number
): Workout | null {
  const inWeek = sessions.filter((s) => s.week === week);
  const fresh = workouts.find((w) => !inWeek.some((s) => s.workout === w.id));
  if (fresh) return fresh;
  let best: Workout | null = null;
  let bestCount = Infinity;
  let bestLast = '';
  for (const w of workouts) {
    const mine = inWeek.filter((s) => s.workout === w.id);
    const last = mine.map((s) => s.done_at ?? '').reduce((a, b) => (a > b ? a : b), '');
    if (mine.length < bestCount || (mine.length === bestCount && last < bestLast)) {
      best = w;
      bestCount = mine.length;
      bestLast = last;
    }
  }
  return best;
}

/** "Week 2 · A ✓ B ✓ C" per program week, newest first. One workout: "Week 1 · 2 of 3". */
export function weekRows(sessions: SessionLite[], program: Program): string[] {
  const weeks = [...new Set(sessions.map((s) => s.week).filter((w): w is number => w !== null))];
  weeks.sort((a, b) => b - a);
  return weeks.map((w) => {
    const inWeek = sessions.filter((s) => s.week === w);
    if (program.workouts.length === 1) {
      return `Week ${w} · ${inWeek.length} of ${program.sessionsPerWeek}`;
    }
    const done = doneIds(inWeek, w);
    const letters = program.workouts.map((x) => (done.has(x.id) ? `${x.id} ✓` : x.id)).join(' ');
    return `Week ${w} · ${letters}`;
  });
}

export function movePlain(m: Move): string {
  return m.reps ?? `${m.seconds} s`;
}
