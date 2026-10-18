// Questions from Allison: one at a time. Save, Skip for now (it stays for next time) or Done
// for now. The screen only shows; the app decides where an answer goes.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import type { Question } from '../types';

export interface QuestionsOptions {
  questions: Question[];
  /** 'saved' = sent or queued; 'refused' = the store said no (not retried). */
  save: (q: Question, answer: string) => Promise<'saved' | 'refused'>;
  onDone: () => void;
  tellHref: string | null;
}

export function renderQuestions(root: HTMLElement, opts: QuestionsOptions): void {
  const list = [...opts.questions];
  let cursor = 0;

  const allDone = (): void => {
    root.innerHTML = `
      <section class="card questions">
        <p id="all-answered">${esc(COPY.allAnswered)}</p>
        <button type="button" class="btn btn-main" id="back-btn">Back to Home</button>
      </section>`;
    $(root, '#back-btn').addEventListener('click', opts.onDone);
  };

  const show = (): void => {
    if (list.length === 0) return allDone();
    if (cursor >= list.length) return opts.onDone(); // skipped to the end: back Home
    const q = list[cursor];
    root.innerHTML = `
      <section class="card questions">
        <p class="quiet" id="q-progress">${cursor + 1} of ${list.length} left</p>
        <p class="q-section" id="q-section">${esc(q.section)}</p>
        <h1 class="q-text" id="q-text" dir="auto">${esc(q.text)}</h1>
        <label class="sr-only" for="q-answer">Your answer</label>
        <textarea id="q-answer" dir="auto" rows="5" maxlength="4000"></textarea>
        <p class="quiet">${esc(COPY.answerHint)}</p>
        <p class="error" id="q-error" role="alert"></p>
        <div class="actions">
          <button type="button" class="btn btn-main" id="q-save" disabled>${esc(COPY.save)}</button>
          <div class="actions-row">
            <button type="button" class="btn btn-soft" id="q-skip">${esc(COPY.skipForNow)}</button>
            <button type="button" class="btn btn-soft" id="q-done">${esc(COPY.doneForNow)}</button>
          </div>
        </div>
      </section>`;
    const area = $<HTMLTextAreaElement>(root, '#q-answer');
    const saveBtn = $<HTMLButtonElement>(root, '#q-save');
    area.addEventListener('input', () => {
      saveBtn.disabled = area.value.trim() === '';
    });
    saveBtn.addEventListener('click', () => {
      saveBtn.disabled = true;
      void opts.save(q, area.value.trim()).then((result) => {
        if (result === 'saved') {
          list.splice(cursor, 1); // the next question slides into this place
          show();
          return;
        }
        const err = $(root, '#q-error');
        err.innerHTML = `${esc(COPY.saveRefused)}${
          opts.tellHref
            ? ` <a class="tell" href="${esc(opts.tellHref)}" target="_blank" rel="noopener" id="q-tell">${esc(COPY.tellButton)}</a>`
            : ''
        }`;
        saveBtn.disabled = area.value.trim() === '';
      });
    });
    $(root, '#q-skip').addEventListener('click', () => {
      cursor += 1;
      show();
    });
    $(root, '#q-done').addEventListener('click', opts.onDone);
  };

  show();
}
