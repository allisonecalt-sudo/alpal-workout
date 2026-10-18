// 1d. After: three quick, optional answers, then Save.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import type { Feel, Program } from '../types';

export interface AfterAnswers {
  feel: Feel | null;
  check: number | null;
  note: string | null;
}

export interface AfterOptions {
  program: Program;
  onSave: (answers: AfterAnswers) => Promise<void>;
}

const FEELS: { value: Feel; label: string }[] = [
  { value: 'easy', label: COPY.feelEasy },
  { value: 'right', label: COPY.feelRight },
  { value: 'hard', label: COPY.feelHard },
];

export function renderAfter(root: HTMLElement, opts: AfterOptions): void {
  const checkLabel = opts.program.checkLabel ?? COPY.checkDefault;
  const feelChips = FEELS.map(
    (f) =>
      `<button type="button" class="chip" data-feel="${f.value}" aria-pressed="false">${esc(f.label)}</button>`
  ).join('');
  const checkChips = Array.from(
    { length: 11 },
    (_, n) =>
      `<button type="button" class="chip chip-num" data-check="${n}" aria-pressed="false">${n}</button>`
  ).join('');
  root.innerHTML = `
    <section class="card after">
      <h1>${esc(COPY.afterTitle)}</h1>
      <h2>${esc(COPY.feelQuestion)}</h2>
      <div class="chips" id="feel-chips">${feelChips}</div>
      <h2>${esc(checkLabel)}</h2>
      <div class="chips chips-wrap" id="check-chips">${checkChips}</div>
      <p class="quiet">${esc(COPY.checkHint)}</p>
      <h2><label for="note">${esc(COPY.noteQuestion)}</label></h2>
      <textarea id="note" dir="auto" rows="3" maxlength="2000"></textarea>
      <button type="button" class="btn btn-main" id="save-btn">${esc(COPY.save)}</button>
    </section>`;

  let feel: Feel | null = null;
  let check: number | null = null;

  // Tapping a chip picks it; tapping it again clears it (every answer is optional).
  const bind = (groupSel: string, attr: string, pick: (v: string | null) => void): void => {
    const group = $(root, groupSel);
    group.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('button.chip');
      if (!chip) return;
      const wasOn = chip.getAttribute('aria-pressed') === 'true';
      group.querySelectorAll('button.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      if (wasOn) pick(null);
      else {
        chip.setAttribute('aria-pressed', 'true');
        pick(chip.getAttribute(attr));
      }
    });
  };
  bind('#feel-chips', 'data-feel', (v) => {
    feel = v as Feel | null;
  });
  bind('#check-chips', 'data-check', (v) => {
    check = v === null ? null : Number(v);
  });

  const btn = $<HTMLButtonElement>(root, '#save-btn');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    const note = $<HTMLTextAreaElement>(root, '#note').value.trim();
    void opts.onSave({ feel, check, note: note === '' ? null : note });
  });
}
