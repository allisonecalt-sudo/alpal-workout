// 1d. After: how it went, when it ended, and a note. Every answer is optional, and everything
// typed or tapped is kept on the phone, so a reload loses nothing.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { durationSec, type AfterDraft, type Progress } from '../progress';
import { buildSteps, effectiveRounds, roundsCompleted } from '../steps';
import type { Feel, Program, Workout } from '../types';
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
  const steps = buildSteps(workout, progress.before.lite);
  const rounds = effectiveRounds(workout, progress.before.lite);
  const doneRounds = roundsCompleted(steps, progress.statuses.length);
  const skipped =
    progress.statuses.filter((s) => s === 'skipped').length +
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
          ? `<p class="quiet" id="after-skipped">${skipped} move${skipped === 1 ? '' : 's'} skipped</p>`
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
    onChange: (at, touched) => {
      d.endAt = at;
      d.endTouched = touched;
      paintTimes();
      opts.onChange(d);
    },
  });

  const btn = $<HTMLButtonElement>(root, '#save-btn');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    stop();
    void opts.onSave();
  });
  return stop;
}
