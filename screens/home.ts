// 1b. Home: greeting, this week's dots, today's workout card, the quiet line, past weeks.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { movePlain, weeksSummary } from '../program';
import type { GuestData, Program } from '../types';

export interface HomeOptions {
  data: GuestData;
  program: Program;
  /** Sessions finished on the phone but not yet sent (counted so the dot fills at once). */
  queuedWeeks: number[];
  /** A one-time note, e.g. a save that was refused. */
  notice?: { text: string; tellHref: string | null };
  onStart: () => void;
}

export function renderHome(root: HTMLElement, opts: HomeOptions): void {
  const { data, program } = opts;
  const weeks = [
    ...data.sessions.map((s) => ({ week: s.week })),
    ...opts.queuedWeeks.map((w) => ({ week: w })),
  ];
  const doneThisWeek = weeks.filter((s) => s.week === program.week).length;
  const dotCount = Math.max(program.sessionsPerWeek, doneThisWeek);
  const dots = Array.from(
    { length: dotCount },
    (_, i) => `<span class="dot${i < doneThisWeek ? ' filled' : ''}"></span>`
  ).join('');
  const moves = program.moves
    .map(
      (m) =>
        `<li><span class="mv-name">${esc(m.name)}</span><span class="mv-amt">${esc(movePlain(m))}</span></li>`
    )
    .join('');
  const past = weeksSummary(weeks);
  const pastHtml =
    past.length === 0
      ? `<p class="quiet">${esc(COPY.noWeeks)}</p>`
      : `<ul class="weeks">${past
          .map((w) => `<li>Week ${w.week} · ${w.n} of ${program.sessionsPerWeek}</li>`)
          .join('')}</ul>`;
  const greeting = data.name === '' ? 'Hi 👋' : `Hi ${esc(data.name)} 👋`;
  const unsent = opts.queuedWeeks.length;
  const unsentHtml =
    unsent === 0
      ? ''
      : `<p class="quiet" id="unsent-line">${unsent === 1 ? '1 workout' : `${unsent} workouts`} not sent yet — it'll send when you're online.</p>`;
  const n = opts.notice;
  const noticeHtml = n
    ? `<div class="card notice" id="notice"><p>${esc(n.text)}</p>${
        n.tellHref
          ? `<a class="tell" href="${esc(n.tellHref)}" target="_blank" rel="noopener" id="notice-tell">${esc(COPY.tellButton)}</a>`
          : ''
      }</div>`
    : '';
  root.innerHTML = `
    <section class="home">
      ${noticeHtml}
      <h1 id="greeting">${greeting}</h1>
      <div class="week-dots" aria-label="This week">
        <div class="dots" id="dots">${dots}</div>
        <p id="week-words">${doneThisWeek} of ${program.sessionsPerWeek} this week</p>
      </div>
      <div class="card today">
        <p class="card-kicker" id="week-label">${esc(program.label)}</p>
        <ul class="move-list" id="move-list">${moves}</ul>
        <p class="minutes" id="minutes">About ${program.minutes} min</p>
        <button class="btn btn-start" id="start-btn" type="button">${esc(COPY.start)}</button>
      </div>
      ${unsentHtml}
      <p class="quiet" id="quiet-line">${esc(COPY.quietLine)}</p>
      <h2>${esc(COPY.yourWeeks)}</h2>
      <div id="past-weeks">${pastHtml}</div>
    </section>`;
  $<HTMLButtonElement>(root, '#start-btn').addEventListener('click', opts.onStart);
}
