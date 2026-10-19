// 1a. Unlock: first open only. One input, one button.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { browserKind, installBodyHtml, isInstalled, paintInstallButtons } from '../install';

export interface UnlockOptions {
  error?: string;
  onSubmit: (raw: string) => Promise<void>;
}

export function renderUnlock(root: HTMLElement, opts: UnlockOptions): void {
  // In a browser tab the steps for the home screen come first and the code box waits behind a
  // link; opened from the home screen it is only the code box.
  const steps = !isInstalled();
  const revealed = !steps || !!opts.error;
  const stepsHtml = steps
    ? `<ol class="unlock-steps" id="unlock-steps">
        <li class="unlock-step">
          <h2>${esc(COPY.unlockStep1)}</h2>
          ${installBodyHtml(browserKind(navigator.userAgent), { unlock: true })}
        </li>
        <li class="unlock-step">
          <h2>${esc(COPY.unlockStep2)}</h2>
          <button type="button" class="link-btn" id="show-code" aria-expanded="${revealed}"${revealed ? ' hidden' : ''}>${esc(COPY.unlockHere)}</button>
        </li>
      </ol>`
    : '';
  root.innerHTML = `
    <section class="card unlock">
      <h1>${esc(COPY.unlockTitle)}</h1>
      ${stepsHtml}
      <div id="code-area"${revealed ? '' : ' hidden'}>
      <p>${esc(COPY.unlockText)}</p>
      <form id="unlock-form" autocomplete="off">
        <label class="sr-only" for="code-input">Code</label>
        <input id="code-input" name="code" type="text" inputmode="text" autocapitalize="characters"
          autocomplete="off" autocorrect="off" spellcheck="false" maxlength="40"
          placeholder="XXXX-XXXX" />
        <p id="unlock-error" class="error" role="alert">${esc(opts.error ?? '')}</p>
        <button type="submit" class="btn btn-main" id="unlock-btn">${esc(COPY.unlockButton)}</button>
      </form>
      </div>
    </section>`;
  paintInstallButtons(root);
  root.querySelector('#show-code')?.addEventListener('click', () => {
    root.querySelector('#code-area')?.removeAttribute('hidden');
    root.querySelector('#show-code')?.setAttribute('hidden', '');
    root.querySelector<HTMLInputElement>('#code-input')?.focus();
  });
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
