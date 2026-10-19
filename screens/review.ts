// Weekly review: one program week per page, with the sessions of that week and a few totals in
// words. An open week is never judged.
import { formatLength } from '../clock';
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { checkWords, longestHold, sessionsOfWeek, totalSeconds, usualPerWeek } from '../stats';
import type { Program, SessionSummary, WeekInfo } from '../types';
import { rowHtml, type ListedSession } from './sessions';

export interface ReviewOptions {
  weeks: WeekInfo[];
  /** Which week to show first (a program week number). */
  startWeek: number;
  program: Program;
  /** Everything known, saved and waiting. */
  items: ListedSession[];
  onOpen: (item: ListedSession, week: number) => void;
  onBack: () => void;
}

export function renderReview(root: HTMLElement, opts: ReviewOptions): void {
  // never page into a week that has not started: the last page is the active week
  const activeWeekNumber = opts.weeks.find((x) => x.active)?.week ?? null;
  const weeks =
    activeWeekNumber === null ? opts.weeks : opts.weeks.filter((x) => x.week <= activeWeekNumber);
  let index = Math.max(
    0,
    weeks.findIndex((w) => w.week === opts.startWeek)
  );
  const all: SessionSummary[] = opts.items.map((i) => i.record);
  const per = opts.program.sessionsPerWeek;
  const label = opts.program.checkLabel ?? null;

  const draw = (): void => {
    const w = weeks[index];
    const inWeek = opts.items.filter((i) => i.record.week === w.week);
    const workouts = sessionsOfWeek(all, w.week);
    const activeWeek = weeks.find((x) => x.active)?.week ?? null;
    const future = false; // future weeks are never shown
    const open = w.active;

    const totals: string[] = [];
    if (workouts.length > 0) {
      const secs = totalSeconds(workouts);
      if (secs > 0) totals.push(`<p id="review-time">Total time ${esc(formatLength(secs))}</p>`);
      const hold = longestHold(workouts);
      if (hold)
        totals.push(`<p id="review-hold">Longest hold ${hold.seconds} s (${esc(hold.name)})</p>`);
      const words = label ? checkWords(workouts, label) : null;
      if (words) totals.push(`<p id="review-check">${esc(words)}</p>`);
    }
    const usual = usualPerWeek(all, per, activeWeek);
    const usualLine =
      usual && !future
        ? `<p class="quiet" id="review-usual">Your usual: ${usual.usual} a week · ${open ? 'this week' : 'that week'}: ${workouts.length}</p>`
        : '';

    let status = '';
    if (open) status = `<p class="quiet" id="review-status">${esc(COPY.weekOpen)}</p>`;
    else if (future) status = `<p class="quiet" id="review-status">${esc(COPY.weekFuture)}</p>`;
    else if (inWeek.length === 0) {
      status = `<p class="quiet" id="review-status">${esc(COPY.weekEmpty)}</p>`;
    }

    root.innerHTML = `
      <section class="review">
        <div class="runbar"><button type="button" class="back-link" id="review-back">‹ Home</button></div>
        <div class="pager">
          <button type="button" class="icon-btn" id="review-prev" aria-label="Previous week"${
            index === 0 ? ' disabled' : ''
          }>‹</button>
          <h1 id="review-title">Week ${w.week} · ${workouts.length} of ${per}</h1>
          <button type="button" class="icon-btn" id="review-next" aria-label="Next week"${
            index === weeks.length - 1 ? ' disabled' : ''
          }>›</button>
        </div>
        ${status}
        ${totals.join('')}
        ${usualLine}
        ${
          inWeek.length > 0
            ? `<div class="session-list" id="review-sessions">${inWeek
                .map((it, k) => rowHtml(it, k, label))
                .join('')}</div>`
            : ''
        }
      </section>`;
    $(root, '#review-back').addEventListener('click', opts.onBack);
    $(root, '#review-prev').addEventListener('click', () => {
      if (index > 0) {
        index -= 1;
        draw();
      }
    });
    $(root, '#review-next').addEventListener('click', () => {
      if (index < weeks.length - 1) {
        index += 1;
        draw();
      }
    });
    root.querySelector('#review-sessions')?.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.session-row');
      if (!row) return;
      const item = inWeek[Number(row.dataset.key)];
      if (item) opts.onOpen(item, w.week);
    });
  };
  draw();
}
