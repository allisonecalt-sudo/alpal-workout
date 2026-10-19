// 1b. Home: greeting, this week's dots, Up next (with the other workouts as chips), the
// questions card, the quiet line, past weeks. Tapping a move opens a read-only sheet.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import {
  doneIds,
  movePlain,
  nextWorkout,
  sessionsThisWeek,
  weekIsDone,
  weekRows,
  type SessionLite,
} from '../program';
import { partLines } from '../steps';
import type { GuestData, Move, Program, Workout } from '../types';
import { moveInfoHtml, wireMoveInfo } from './moveinfo';

export interface HomeOptions {
  data: GuestData;
  program: Program;
  /** Saved sessions plus any finished on the phone but not yet sent. */
  sessions: SessionLite[];
  /** The workout she picked from the chips, if any. */
  chosenId: string | null;
  questionsLeft: number;
  /** Show the safety card open (the first time this program week). */
  safetyOpen: boolean;
  /** She opened or closed the safety card by hand: remember it for the visit. */
  onSafetyToggle: (open: boolean) => void;
  /** A quiet line when the store cannot be reached but the saved copy is shown. */
  offlineLine: string | null;
  unsentSessions: number;
  unsentAnswers: number;
  /** A one-time note, e.g. a save that was refused. */
  notice?: { text: string; tellHref: string | null };
  onStart: (id: string) => void;
  onChoose: (id: string) => void;
  onQuestions: () => void;
}

function unsentText(sessions: number, answers: number): string {
  const total = sessions + answers;
  if (total === 0) return '';
  let what: string;
  if (answers === 0) what = sessions === 1 ? '1 workout' : `${sessions} workouts`;
  else if (sessions === 0) what = answers === 1 ? '1 answer' : `${answers} answers`;
  else what = `${total} things`;
  return `${what} not sent yet — it'll send when you're online.`;
}

function chip(w: Workout, done: Set<string>): string {
  const label = done.has(w.id) ? `${w.id} ✓` : w.id;
  return `<button type="button" class="chip" data-workout="${esc(w.id)}" aria-label="Workout ${esc(w.id)}">${esc(label)}</button>`;
}

function partMoves(w: Workout): { title: string; moves: Move[] }[] {
  const lines = partLines(w);
  const parts: Move[][] = [];
  if (w.warmup.length > 0) parts.push(w.warmup);
  parts.push(w.main);
  if (w.cooldown.length > 0) parts.push(w.cooldown);
  return parts.map((moves, k) => ({ title: lines[k], moves }));
}

function openSheet(root: HTMLElement, move: Move): void {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Move');
  sheet.innerHTML = `
    <div class="sheet-inner">
      <h1 id="sheet-name">${esc(move.name)}</h1>
      <p class="sheet-amount" id="sheet-amount">${esc(movePlain(move))}</p>
      ${moveInfoHtml(move)}
      <button type="button" class="btn btn-main" id="sheet-close">Close</button>
    </div>`;
  root.appendChild(sheet);
  wireMoveInfo(sheet, move);
  const close = (): void => {
    sheet.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  $(sheet, '#sheet-close').addEventListener('click', close);
}

export function renderHome(root: HTMLElement, opts: HomeOptions): void {
  const { data, program } = opts;
  const done = doneIds(opts.sessions, program.week);
  const doneThisWeek = sessionsThisWeek(opts.sessions, program.week);
  const dotCount = Math.max(program.sessionsPerWeek, doneThisWeek);
  const dots = Array.from(
    { length: dotCount },
    (_, i) => `<span class="dot${i < doneThisWeek ? ' filled' : ''}"></span>`
  ).join('');

  // the week is done only when the session count reaches sessionsPerWeek
  const next = weekIsDone(opts.sessions, program)
    ? null
    : nextWorkout(program.workouts, opts.sessions, program.week);
  const picked = program.workouts.find((w) => w.id === opts.chosenId) ?? null;
  const shown = picked ?? next;

  let card: string;
  if (shown === null) {
    card = `
      <div class="card today">
        <p id="all-done">All ${program.sessionsPerWeek} done this week 🎉</p>
        <p class="chips-line" id="chips-line"><span>Extra one?</span> ${program.workouts
          .map((w) => chip(w, done))
          .join('')}</p>
      </div>`;
  } else {
    const kicker =
      picked === null || picked.id === next?.id ? 'Up next' : next === null ? 'Extra' : 'Your pick';
    const parts = partMoves(shown)
      .map(
        (p, pi) => `
        <details class="part">
          <summary>${esc(p.title)}</summary>
          <ul class="move-list">${p.moves
            .map(
              (m, mi) =>
                `<li><button type="button" class="move-link" data-part="${pi}" data-move="${mi}"><span class="mv-name">${esc(m.name)}</span><span class="mv-amt">${esc(movePlain(m))}</span></button></li>`
            )
            .join('')}</ul>
        </details>`
      )
      .join('');
    const others = program.workouts.filter((w) => w.id !== shown.id);
    const chips =
      others.length === 0
        ? ''
        : `<p class="chips-line" id="chips-line"><span>or do:</span> ${others
            .map((w) => chip(w, done))
            .join('')}</p>`;
    card = `
      <div class="card today">
        <p class="card-kicker" id="up-next">${kicker} · ${esc(shown.name)}</p>
        <p class="minutes" id="minutes">About ${shown.minutes} min</p>
        <div id="parts">${parts}</div>
        <button class="btn btn-start" id="start-btn" type="button">${esc(COPY.start)}</button>
        ${chips}
      </div>`;
  }

  const safety =
    program.safety && program.safety.length > 0
      ? `<details class="card safety" id="safety"${opts.safetyOpen ? ' open' : ''}>
           <summary>${esc(COPY.safetyTitle)}</summary>
           <ul>${program.safety.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
         </details>`
      : '';
  const questions =
    opts.questionsLeft > 0
      ? `<div class="card" id="questions-card">
           <h2>Questions from Allison</h2>
           <p class="quiet" id="questions-left">${opts.questionsLeft} left · answer whenever you like</p>
           <button type="button" class="btn btn-soft" id="questions-btn">Answer a few</button>
         </div>`
      : '';

  const offlineHtml = opts.offlineLine
    ? `<p class="quiet" id="offline-line">${esc(opts.offlineLine)}</p>`
    : '';
  const unsent = unsentText(opts.unsentSessions, opts.unsentAnswers);
  const unsentHtml = unsent === '' ? '' : `<p class="quiet" id="unsent-line">${esc(unsent)}</p>`;
  const n = opts.notice;
  const noticeHtml = n
    ? `<div class="card notice" id="notice"><p>${esc(n.text)}</p>${
        n.tellHref
          ? `<a class="tell" href="${esc(n.tellHref)}" target="_blank" rel="noopener" id="notice-tell">${esc(COPY.tellButton)}</a>`
          : ''
      }</div>`
    : '';
  const rows = weekRows(opts.sessions, program);
  const pastHtml =
    rows.length === 0
      ? `<p class="quiet">${esc(COPY.noWeeks)}</p>`
      : `<ul class="weeks">${rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
  const greeting = data.name === '' ? 'Hi 👋' : `Hi ${esc(data.name)} 👋`;

  root.innerHTML = `
    <section class="home">
      ${noticeHtml}
      <h1 id="greeting">${greeting}</h1>
      <div class="week-dots" aria-label="This week">
        <div class="dots" id="dots">${dots}</div>
        <p id="week-words">${doneThisWeek} of ${program.sessionsPerWeek} this week</p>
      </div>
      ${safety}
      ${card}
      ${questions}
      ${unsentHtml}
      ${offlineHtml}
      <p class="quiet" id="quiet-line">${esc(COPY.quietLine)}</p>
      <h2>${esc(COPY.yourWeeks)}</h2>
      <div id="past-weeks">${pastHtml}</div>
    </section>`;

  root.querySelector('#start-btn')?.addEventListener('click', () => {
    if (shown) opts.onStart(shown.id);
  });
  root.querySelector('#chips-line')?.addEventListener('click', (e) => {
    const chipEl = (e.target as HTMLElement).closest<HTMLElement>('[data-workout]');
    if (chipEl?.dataset.workout) opts.onChoose(chipEl.dataset.workout);
  });
  root.querySelector('#parts')?.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('.move-link');
    if (!link || !shown) return;
    const part = partMoves(shown)[Number(link.dataset.part)];
    const move = part?.moves[Number(link.dataset.move)];
    if (move) openSheet(root, move);
  });
  root.querySelector('#questions-btn')?.addEventListener('click', opts.onQuestions);
  root.querySelector<HTMLDetailsElement>('#safety')?.addEventListener('toggle', (e) => {
    opts.onSafetyToggle((e.target as HTMLDetailsElement).open);
  });
}
