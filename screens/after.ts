// 1d. After: how it went, when it ended, and a note. Every answer is optional, and everything
// typed or tapped is kept on the phone, so a reload loses nothing.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { durationSec, type AfterDraft, type Progress } from '../progress';
import { buildSteps, effectiveRounds, roundsCompleted } from '../steps';
import type { Feel, Program, Question, Workout } from '../types';
import { mountTimeConfirm } from './timeconfirm';

export interface AfterOptions {
  program: Program;
  workout: Workout;
  progress: Progress;
  /** Sessions already counted this week, plus this one. */
  weekCount: number;
  /** Called on every change so the draft is kept. */
  onChange: (draft: AfterDraft) => void;
  onSave: () => Promise<void>;
  /** Open the Note sheet already recording ('record') or on the write view ('write'). */
  onTell: (mode: 'record' | 'write') => void;
  /** The next unanswered question, shown inline (null when none are left). */
  question: Question | null;
  /** How many questions are still open. */
  questionsLeft: () => number;
  saveAnswer: (q: Question, answer: string) => Promise<'saved' | 'refused'>;
}

const FEELS: { value: Feel; label: string }[] = [
  { value: 'easy', label: COPY.feelEasy },
  { value: 'right', label: COPY.feelRight },
  { value: 'hard', label: COPY.feelHard },
];

function chipRow(id: string, from: number, to: number, picked: number | null): string {
  const chips = Array.from({ length: to - from + 1 }, (_, k) => from + k)
    .map(
      (n) =>
        `<button type="button" class="chip chip-num" data-value="${n}" aria-pressed="${picked === n}">${n}</button>`
    )
    .join('');
  return `<div class="chips chips-wrap" id="${id}">${chips}</div>`;
}

export function renderAfter(root: HTMLElement, opts: AfterOptions): () => void {
  const { workout, progress } = opts;
  const d = progress.after;
  const stopped = progress.stoppedAt !== null;
  const steps = buildSteps(workout, progress.before.lite, progress.choices);
  const rounds = effectiveRounds(workout, progress.before.lite);
  const doneRounds = roundsCompleted(steps, progress.statuses);
  const hurt = progress.statuses.filter((s) => s === 'hurt').length;
  const skipped =
    progress.statuses.filter((s) => s === 'skipped').length +
    hurt +
    (progress.cooldownStatus === 'skipped' ? workout.cooldown.length : 0);

  const title = stopped ? `Stopped early · ${workout.name}` : `Nice. ${workout.name} done.`;
  const summary = stopped
    ? `${doneRounds} of ${rounds} round${rounds === 1 ? '' : 's'}`
    : `${doneRounds} round${doneRounds === 1 ? '' : 's'} · ${opts.weekCount} of ${opts.program.sessionsPerWeek} this week`;
  const checkLabel = opts.program.checkLabel ?? COPY.checkDefault;

  root.innerHTML = `
    <section class="card after">
      <h1 id="after-title">${esc(title)}</h1>
      <p id="after-summary">${esc(summary)}</p>
      ${
        skipped > 0
          ? `<p class="quiet" id="after-skipped">${skipped} move${skipped === 1 ? '' : 's'} skipped${hurt > 0 ? ` (${hurt} because it hurt)` : ''}</p>`
          : ''
      }
      <div id="after-time"></div>
      <p class="warn" id="time-warn" role="alert"></p>
      <p class="quiet" id="after-duration"></p>
      <h2>${esc(COPY.bodyAfter)}</h2>
      ${chipRow('after-body', 1, 10, d.body)}
      <h2>${esc(COPY.moodAfter)}</h2>
      ${chipRow('after-mood', 1, 10, d.mood)}
      <h2>${esc(checkLabel)}</h2>
      ${chipRow('check-chips', 0, 10, d.check)}
      <p class="quiet">${esc(COPY.checkHint)}</p>
      <h2>${esc(COPY.feelQuestion)}</h2>
      <div class="chips" id="feel-chips">${FEELS.map(
        (f) =>
          `<button type="button" class="chip" data-feel="${f.value}" aria-pressed="${d.feel === f.value}">${esc(f.label)}</button>`
      ).join('')}</div>
      <h2><label for="note">${esc(COPY.noteQuestion)}</label></h2>
      <textarea id="note" dir="auto" rows="3" maxlength="2000"></textarea>
      <div class="card tell-card" id="tell-card">
        <h2>${esc(COPY.tellTitle)}</h2>
        <p>${esc(COPY.tellLine)}</p>
        <div class="actions-row">
          <button type="button" class="btn btn-soft" id="tell-record">${esc(COPY.tellRecord)}</button>
          <button type="button" class="btn btn-soft" id="tell-write">${esc(COPY.tellWrite)}</button>
        </div>
      </div>
      ${
        opts.question
          ? `<div class="card" id="after-question">
        <h2>${esc(COPY.oneQuestion)}</h2>
        <p class="q-section" id="aq-section">${esc(opts.question.section)}</p>
        <p class="aq-text" id="aq-text" dir="auto">${esc(opts.question.text)}</p>
        <label class="sr-only" for="aq-answer">Your answer</label>
        <textarea id="aq-answer" dir="auto" rows="3" maxlength="4000"></textarea>
        <p class="error" id="aq-error" role="alert"></p>
        <button type="button" class="btn btn-soft" id="aq-save" disabled>${esc(COPY.saveAnswer)}</button>
        <button type="button" class="back-link" id="aq-skip">${esc(COPY.skip)}</button>
      </div>`
          : ''
      }
      <button type="button" class="btn btn-main" id="save-btn">${esc(COPY.save)}</button>
    </section>`;
  const note = $<HTMLTextAreaElement>(root, '#note');
  note.value = d.note;

  // Tapping a chip picks it; tapping it again clears it (every answer is optional).
  const bind = (id: string, pick: (v: number | null) => void): void => {
    const group = $(root, `#${id}`);
    group.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('button.chip');
      if (!chip) return;
      const was = chip.getAttribute('aria-pressed') === 'true';
      group.querySelectorAll('button.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      if (was) pick(null);
      else {
        chip.setAttribute('aria-pressed', 'true');
        pick(Number(chip.dataset.value));
      }
      opts.onChange(d);
    });
  };
  bind('after-body', (v) => (d.body = v));
  bind('after-mood', (v) => (d.mood = v));
  bind('check-chips', (v) => (d.check = v));
  $(root, '#feel-chips').addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('button.chip');
    if (!chip) return;
    const was = chip.getAttribute('aria-pressed') === 'true';
    root
      .querySelectorAll('#feel-chips button.chip')
      .forEach((c) => c.setAttribute('aria-pressed', 'false'));
    if (was) d.feel = null;
    else {
      chip.setAttribute('aria-pressed', 'true');
      d.feel = chip.dataset.feel as Feel;
    }
    opts.onChange(d);
  });
  note.addEventListener('input', () => {
    d.note = note.value;
    opts.onChange(d);
  });

  const paintTimes = (): void => {
    const warn = $(root, '#time-warn');
    warn.textContent = d.endAt < progress.startedAt ? COPY.finishBeforeStart : '';
    const sec = durationSec(progress.startedAt, d.endAt, progress.pausedMs);
    $(root, '#after-duration').textContent = `About ${Math.max(1, Math.round(sec / 60))} min`;
  };
  paintTimes();
  const stop = mountTimeConfirm($(root, '#after-time'), {
    kind: 'end',
    label: 'Finished',
    verb: 'Finished',
    at: d.endAt,
    touched: d.endTouched,
    follow: false, // an unconfirmed finish is fixed at the moment After first appeared
    onChange: (at, touched) => {
      d.endAt = at;
      d.endTouched = touched;
      paintTimes();
      opts.onChange(d);
    },
  });

  $(root, '#tell-record').addEventListener('click', () => opts.onTell('record'));
  $(root, '#tell-write').addEventListener('click', () => opts.onTell('write'));
  const question = opts.question;
  if (question) {
    const card = $(root, '#after-question');
    const area = $<HTMLTextAreaElement>(card, '#aq-answer');
    const save = $<HTMLButtonElement>(card, '#aq-save');
    area.addEventListener('input', () => {
      save.disabled = area.value.trim() === '';
    });
    save.addEventListener('click', () => {
      save.disabled = true;
      void opts.saveAnswer(question, area.value.trim()).then((result) => {
        if (result === 'saved') {
          const left = opts.questionsLeft();
          card.innerHTML = `<p id="aq-thanks" role="status">${esc(
            left > 0 ? COPY.thanksLeft(left) : COPY.thanksNone
          )}</p>`;
          return;
        }
        $(card, '#aq-error').textContent = COPY.saveRefused;
        save.disabled = area.value.trim() === '';
      });
    });
    $(card, '#aq-skip').addEventListener('click', () => card.remove());
  }

  const btn = $<HTMLButtonElement>(root, '#save-btn');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    stop();
    void opts.onSave();
  });
  return stop;
}
