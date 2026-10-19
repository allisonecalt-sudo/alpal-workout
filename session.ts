// Turns a finished (or stopped) workout into what is sent to the store. Pure, unit tested.
import { durationSec, type Progress } from './progress';
import { buildSteps, movesLog } from './steps';
import type { Readings, SessionPayload, SessionSummary, Workout } from './types';

export function buildPayload(
  p: Progress,
  w: Workout,
  week: number,
  clientId: string
): SessionPayload {
  const steps = buildSteps(w, p.before.lite, p.choices);
  const readings: Readings = {};
  const b = p.before;
  if (b.body !== null || b.mood !== null || b.check !== null) {
    readings.before = { body: b.body, mood: b.mood, check: b.check };
  }
  const a = p.after;
  if (a.body !== null || a.mood !== null) readings.after = { body: a.body, mood: a.mood };

  // seconds held, per move name, in the order they were held (one entry per round)
  const holds: Record<string, number[]> = {};
  Object.keys(p.holds)
    .map(Number)
    .sort((x, y) => x - y)
    .forEach((idx) => {
      const step = steps[idx];
      if (!step) return;
      (holds[step.move.name] ??= []).push(p.holds[String(idx)]);
    });
  if (Object.keys(holds).length > 0) readings.holds = holds;
  if (p.stoppedAt) readings.stopped_at = p.stoppedAt;
  if (Object.keys(p.moveFeel).length > 0) readings.move_feel = p.moveFeel;

  const note = a.note.trim();
  return {
    client_id: clientId,
    done_at: new Date(a.endAt).toISOString(),
    started_at: new Date(p.startedAt).toISOString(),
    duration_sec: durationSec(p.startedAt, a.endAt, p.pausedMs),
    lite: b.lite || p.stoppedAt !== null,
    readings,
    week,
    workout: w.id,
    moves: movesLog(steps, p.statuses, w.cooldown, p.cooldownStatus),
    feel: a.feel,
    check_0_10: a.check,
    note: note === '' ? null : note,
  };
}

/** A waiting session as the history shows it (so it can be listed before it is sent). */
export function recordOfPayload(p: SessionPayload): SessionSummary {
  return {
    client_id: p.client_id,
    done_at: p.done_at,
    started_at: p.started_at,
    duration_sec: p.duration_sec,
    lite: p.lite,
    readings: p.readings,
    moves: p.moves,
    note: p.note,
    week: p.week,
    workout: p.workout,
    feel: p.feel,
    check_0_10: p.check_0_10,
  };
}
