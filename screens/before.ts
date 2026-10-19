// The Before screen: between Start and the first move. Every answer is optional; a chip is blank
// until tapped, and a second tap clears it. Nothing here is switched on by itself.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import type { BeforeAnswers } from '../progress';
import type { Program, Workout } from '../types';
import { mountTimeConfirm } from './timeconfirm';

export interface BeforeOptions {
  program: Program;
  workout: Workout;
  before: BeforeAnswers;
  /** Called on every change so it is kept (a reload keeps what was tapped). */
  onChange: (before: BeforeAnswers) => void;
  onStart: () => void;
  /** Back to Home (nothing has been started yet). */
  onHome: () => void;
}

function row(id: string, title: string, from: number, to: number, picked: number | null): string {
  const chips = Array.from({ length: to - from + 1 }, (_, k) => from + k)
    .map(
      (n) =>
        `<button type="button" class="chip chip-num" data-value="${n}" aria-pressed="${picked === n}">${n}</button>`
    )
    .join('');
  return `<h2>${esc(title)}</h2><div class="chips chips-wrap" id="${id}">${chips}</div>`;
}

export function renderBefore(root: HTMLElement, opts: BeforeOptions): () => void {
  const { workout, program } = opts;
  const b = opts.before;
  const checkRow = program.checkLabel
    ? row('before-check', program.checkLabel, 0, 10, b.check)
    : '';
  const hasLite = workout.rounds > 1;
  root.innerHTML = `
    <section class="card before">
      <div class="runbar"><button type="button" class="back-link" id="before-home">‹ Home</button></div>
      <h1>${esc(workout.name)}</h1>
      ${row('before-body', COPY.bodyToday, 1, 10, b.body)}
      ${row('before-mood', COPY.mood, 1, 10, b.mood)}
      ${checkRow}
      ${
        hasLite
          ? `<button type="button" class="chip lite-chip" id="lite-chip" aria-pressed="${b.lite}">${esc(COPY.liteChip)}</button>`
          : ''
      }
      <div id="before-time"></div>
      <button type="button" class="btn btn-main" id="before-start">${esc(COPY.start)}</button>
    </section>`;

  const paintLite = (): void => {
    const chip = root.querySelector<HTMLElement>('#lite-chip');
    if (!chip) return;
    chip.setAttribute('aria-pressed', String(b.lite));
    // suggested (gently highlighted), never switched on by itself, when the body is low
    chip.classList.toggle('suggested', !b.lite && b.body !== null && b.body <= 3);
  };

  const bind = (id: string, key: 'body' | 'mood' | 'check'): void => {
    const group = root.querySelector(`#${id}`);
    group?.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('button.chip');
      if (!chip) return;
      const was = chip.getAttribute('aria-pressed') === 'true';
      group.querySelectorAll('button.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      if (was) b[key] = null;
      else {
        chip.setAttribute('aria-pressed', 'true');
        b[key] = Number(chip.dataset.value);
      }
      paintLite();
      opts.onChange(b);
    });
  };
  bind('before-body', 'body');
  bind('before-mood', 'mood');
  if (program.checkLabel) bind('before-check', 'check');
  root.querySelector('#lite-chip')?.addEventListener('click', () => {
    b.lite = !b.lite;
    paintLite();
    opts.onChange(b);
  });
  paintLite();

  const stop = mountTimeConfirm($(root, '#before-time'), {
    kind: 'start',
    label: 'Starting',
    verb: 'Started',
    at: b.startAt,
    touched: b.startTouched,
    follow: true,
    onChange: (at, touched) => {
      b.startAt = at;
      b.startTouched = touched;
      opts.onChange(b);
    },
  });
  $(root, '#before-start').addEventListener('click', () => {
    stop();
    opts.onStart();
  });
  $(root, '#before-home').addEventListener('click', () => {
    stop();
    opts.onHome();
  });
  return stop;
}
