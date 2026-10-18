// 1a. Unlock: first open only. One input, one button.
import { COPY } from '../copy';
import { $, esc } from '../dom';

export interface UnlockOptions {
  error?: string;
  onSubmit: (raw: string) => Promise<void>;
}

export function renderUnlock(root: HTMLElement, opts: UnlockOptions): void {
  root.innerHTML = `
    <section class="card unlock">
      <h1>${esc(COPY.unlockTitle)}</h1>
      <p>${esc(COPY.unlockText)}</p>
      <form id="unlock-form" autocomplete="off">
        <label class="sr-only" for="code-input">Code</label>
        <input id="code-input" name="code" type="text" inputmode="text" autocapitalize="characters"
          autocomplete="off" autocorrect="off" spellcheck="false" maxlength="12"
          placeholder="XXXX-XXXX" />
        <p id="unlock-error" class="error" role="alert">${esc(opts.error ?? '')}</p>
        <button type="submit" class="btn btn-main" id="unlock-btn">${esc(COPY.unlockButton)}</button>
      </form>
    </section>`;
  const form = $<HTMLFormElement>(root, '#unlock-form');
  const input = $<HTMLInputElement>(root, '#code-input');
  const btn = $<HTMLButtonElement>(root, '#unlock-btn');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    btn.disabled = true;
    void opts.onSubmit(input.value).finally(() => {
      btn.disabled = false;
    });
  });
}

export function showUnlockError(root: HTMLElement, text: string): void {
  const el = root.querySelector('#unlock-error');
  if (el) el.textContent = text;
}
