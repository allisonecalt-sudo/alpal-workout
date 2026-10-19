// Progress: one question, "am I showing up, and what has grown?". Words first, one number in one
// home, no chart under five points, honest scales, no red, no streaks. Early states are calm.
import { formatShortDate } from '../clock';
import { COPY } from '../copy';
import { $, esc } from '../dom';
import {
  beforeAfter,
  checkSeries,
  countsByWeek,
  firstDoneAt,
  fullWeeks,
  holdGrowth,
  nextChange,
  roundsByWeek,
  weekState,
  workoutsOnly,
} from '../stats';
import type { Program, SessionSummary, WeekInfo } from '../types';

export interface ProgressOptions {
  all: SessionSummary[];
  program: Program;
  weeks: WeekInfo[];
  next: Program | null;
  onWeek: (week: number) => void;
  onBack: () => void;
}

const avg = (n: number): string => n.toFixed(1);

function checkDots(values: number[]): string {
  // fixed 0 to 10 scale, a dot per session, oldest on the left: honest, no stretching
  const w = 300;
  const h = 70;
  const step = values.length > 1 ? (w - 20) / (values.length - 1) : 0;
  const dots = values
    .map(
      (v, i) => `<circle cx="${10 + i * step}" cy="${h - 8 - (v / 10) * (h - 16)}" r="4"></circle>`
    )
    .join('');
  return `<svg class="check-dots" id="check-dots" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="Each dot is one session, oldest on the left. Lower is better.">
      <line x1="0" y1="${h - 8}" x2="${w}" y2="${h - 8}" class="axis"></line>${dots}</svg>
    <p class="quiet">Each dot is one session, oldest on the left. Lower is better, 0 to 10.</p>`;
}

export function renderProgress(root: HTMLElement, opts: ProgressOptions): void {
  const { program } = opts;
  const per = program.sessionsPerWeek;
  const workouts = workoutsOnly(opts.all);
  const label = program.checkLabel ?? null;

  if (workouts.length === 0) {
    root.innerHTML = `
      <section class="progress">
        <div class="runbar"><button type="button" class="back-link" id="progress-back">‹ Home</button></div>
        <h1>${esc(COPY.progressTitle)}</h1>
        <div class="card" id="progress-empty">
          <p>${esc(COPY.progressEmpty)}</p>
          <button type="button" class="btn btn-main" id="progress-home">${esc(COPY.progressHome)}</button>
        </div>
      </section>`;
    $(root, '#progress-back').addEventListener('click', opts.onBack);
    $(root, '#progress-home').addEventListener('click', opts.onBack);
    return;
  }

  const full = fullWeeks(opts.all, per);
  const first = firstDoneAt(opts.all);
  const m = workouts.length;
  const headline =
    full > 0
      ? `${full} full week${full === 1 ? '' : 's'}`
      : `${m} workout${m === 1 ? '' : 's'} so far`;
  const basis =
    full > 0
      ? `since ${first === null ? '' : formatShortDate(first)} · ${m} workout${m === 1 ? '' : 's'}`
      : `since ${first === null ? '' : formatShortDate(first)}`;

  // the grid: every program week up to now
  const counts = countsByWeek(opts.all);
  const activeWeek = opts.weeks.find((w) => w.active)?.week ?? program.week;
  const gridWeeks = (opts.weeks.length > 0 ? opts.weeks : [])
    .filter((w) => w.week <= activeWeek)
    .map((w) => w.week);
  if (gridWeeks.length === 0)
    gridWeeks.push(...[...new Set([...counts.keys(), activeWeek])].sort((a, b) => a - b));
  const grid = gridWeeks
    .map((week) => {
      const c = counts.get(week) ?? 0;
      const state = weekState(c, per);
      const value = state === 'full' ? '✓' : c > 0 ? String(c) : '–';
      const now = week === activeWeek;
      return `<button type="button" class="wk ${state}${now ? ' now' : ''}" data-week="${week}"
          aria-label="Week ${week}: ${c} of ${per}${now ? ', this week' : ''}">
          <span class="wk-n">Week ${week}</span><span class="wk-v">${value}</span>${
            now ? '<span class="wk-now">now</span>' : ''
          }</button>`;
    })
    .join('');

  // what grew
  const grew: string[] = [];
  for (const g of holdGrowth(opts.all)) {
    grew.push(
      g.sessions >= 2
        ? `<li>${esc(g.name)}: ${g.first} s → ${g.latest} s · since ${esc(formatShortDate(g.sinceMs))}</li>`
        : `<li>${esc(g.name)}: ${g.latest} s so far</li>`
    );
  }
  const rounds = roundsByWeek(opts.all);
  if (rounds.length >= 2) {
    const a = rounds[0];
    const b = rounds[rounds.length - 1];
    grew.push(
      `<li>Rounds in a session: ${a.rounds} (week ${a.week}) → ${b.rounds} (${
        b.week === activeWeek ? 'this week' : `week ${b.week}`
      })</li>`
    );
  }

  // body check
  const series = checkSeries(opts.all);
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const zeros = series.filter((v) => v === 0).length;
  const check =
    label && latest !== null
      ? `${label} 0 on ${zeros} of ${series.length} · latest ${latest}`
      : null;
  const body = beforeAfter(opts.all, 'body');
  const mood = beforeAfter(opts.all, 'mood');
  const bodyCard: string[] = [];
  if (check) bodyCard.push(`<p id="check-words">${esc(check)}</p>`);
  if (series.length >= 5) bodyCard.push(checkDots(series));
  if (body) {
    bodyCard.push(
      `<p id="body-avg">Body: ${avg(body.before)} before → ${avg(body.after)} after (average of ${body.n} sessions)</p>`
    );
  }
  if (mood) {
    bodyCard.push(
      `<p id="mood-avg">Mood: ${avg(mood.before)} before → ${avg(mood.after)} after (average of ${mood.n} sessions)</p>`
    );
  }

  // coming next week and past weeks
  let comingNext = '';
  if (opts.next) {
    const change = nextChange(
      opts.weeks.find((w) => w.week === activeWeek),
      opts.next
    );
    const parts: string[] = [];
    if (change.added.length > 0) parts.push(`Added: ${change.added.join(', ')}`);
    if (change.removed.length > 0) parts.push(`Removed: ${change.removed.join(', ')}`);
    comingNext = `<h3>${esc(COPY.comingNext)}</h3><p id="coming-next">${esc(
      parts.length > 0 ? parts.join(' · ') : COPY.sameMoves
    )}</p>`;
  }
  const past = opts.weeks
    .filter((w) => w.week < activeWeek)
    .sort((a, b) => b.week - a.week)
    .map(
      (w) => `<details class="past-week">
        <summary>${esc(w.label)}</summary>
        ${w.workouts
          .map(
            (x) =>
              `<p class="pw-name">${esc(x.name)}</p><ul class="d-list">${x.moves
                .map((mv) => `<li>${esc(mv)}</li>`)
                .join('')}</ul>`
          )
          .join('')}
      </details>`
    )
    .join('');

  root.innerHTML = `
    <section class="progress">
      <div class="runbar"><button type="button" class="back-link" id="progress-back">‹ Home</button></div>
      <h1>${esc(COPY.progressTitle)}</h1>
      <div class="card" id="progress-headline">
        <p class="big" id="headline">${esc(headline)}</p>
        <p class="quiet" id="headline-basis">${esc(basis)}</p>
        <p class="quiet">A full week is ${per} workouts.</p>
      </div>
      <h2>${esc(COPY.weeksGridTitle)}</h2>
      <div class="weeks-grid" id="weeks-grid">${grid}</div>
      ${
        grew.length > 0
          ? `<h2>${esc(COPY.whatGrew)}</h2><div class="card"><ul class="d-list" id="grew">${grew.join(
              ''
            )}</ul><p class="quiet">The best hold of each session, compared with the first.</p></div>`
          : ''
      }
      ${
        bodyCard.length > 0
          ? `<h2>${esc(label ?? COPY.checkDefault)}</h2><div class="card" id="body-check">${bodyCard.join('')}</div>`
          : ''
      }
      ${
        comingNext || past
          ? `<h2>${esc(COPY.weeksSection)}</h2><div class="card" id="weeks-section">${comingNext}${
              past ? `<h3>${esc(COPY.pastWeeks)}</h3>${past}` : ''
            }</div>`
          : ''
      }
    </section>`;
  $(root, '#progress-back').addEventListener('click', opts.onBack);
  $(root, '#weeks-grid').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.wk');
    if (b?.dataset.week) opts.onWeek(Number(b.dataset.week));
  });
}
