// Small clock helpers for the time lines ("Starting · 9:04. Right?"). All local time.

/** "9:04" for showing. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "09:04" for a time input's value. */
export function inputClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Sun 9:12": weekday and time, for "You left Workout A open (started Sun 9:12)". */
export function formatDayClock(ms: number): string {
  const day = new Date(ms).toLocaleDateString('en-US', { weekday: 'short' });
  return `${day} ${formatClock(ms)}`;
}

/** The same calendar day as `baseMs`, at the clock time of an input's "HH:MM". */
export function withClock(baseMs: number, hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return baseMs;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return baseMs;
  const d = new Date(baseMs);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

/** `minutes` before `nowMs`, on the minute. */
export function minutesAgo(nowMs: number, minutes: number): number {
  const d = new Date(nowMs - minutes * 60_000);
  d.setSeconds(0, 0);
  return d.getTime();
}

/** The current time, cut to the minute. */
export function nowToMinute(): number {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.getTime();
}

/** True while `ms` is still the same local calendar day as `nowMs` (the Done card's life). */
export function sameDay(ms: number, nowMs: number): boolean {
  const a = new Date(ms);
  const b = new Date(nowMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
