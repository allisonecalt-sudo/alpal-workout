// Settings: beeps, rest, get-ready, export, about, and "use a different code".
// Everything is remembered on the phone.
import { COPY } from '../copy';
import { $, esc, toast } from '../dom';
import { browserKind, installCardHtml, paintInstallButtons } from '../install';
import { closeTip, consider } from '../tips';
import {
  getBeeps,
  getGetReady,
  getRestOverride,
  getTipsOn,
  resetTips,
  setTipsOn,
  setBeeps,
  setGetReady,
  setRestOverride,
} from '../storage';
import type { ListedNote } from '../notes';
import { notesListHtml } from './noteslist';

export interface SettingsOptions {
  /** The plan's own rest in seconds (shown on the first rest chip), 0 when none. */
  planRest: number;
  version: string;
  unsent: number;
  /** Her notes to Allison, newest first. */
  notes: ListedNote[];
  onExport: () => void;
  onChangeCode: () => void;
  onBack: () => void;
}

const REST_CHOICES = [0, 15, 30, 45, 60, 90];
const READY_CHOICES = [0, 3, 5, 10];

function chips(id: string, items: { value: string; label: string }[], picked: string): string {
  return `<div class="chips chips-wrap" id="${id}">${items
    .map(
      (i) =>
        `<button type="button" class="chip chip-inline" data-value="${esc(i.value)}" aria-pressed="${
          i.value === picked
        }">${esc(i.label)}</button>`
    )
    .join('')}</div>`;
}

export function renderSettings(root: HTMLElement, opts: SettingsOptions): void {
  const rest = getRestOverride();
  const planLabel = opts.planRest > 0 ? `Plan's (${opts.planRest} s)` : "Plan's (none)";
  root.innerHTML = `
    <section class="card settings">
      <div class="runbar"><button type="button" class="back-link" id="settings-back">‹ Home</button></div>
      <h1>${esc(COPY.settingsTitle)}</h1>
      <div class="set-row">
        <span>${esc(COPY.beeps)}</span>
        <button type="button" class="chip chip-inline" id="set-beeps" aria-pressed="${getBeeps()}">${
          getBeeps() ? 'On' : 'Off'
        }</button>
      </div>
      <div class="set-row">
        <span>${esc(COPY.tipsRow)}</span>
        <button type="button" class="chip chip-inline" id="set-tips" aria-pressed="${getTipsOn()}">${
          getTipsOn() ? esc(COPY.tipsHide) : esc(COPY.tipsShow)
        }</button>
      </div>
      <button type="button" class="btn btn-soft" id="tips-again">${esc(COPY.tipsAgain)}</button>
      <h2>${esc(COPY.restBetween)}</h2>
      ${chips(
        'set-rest',
        [
          { value: 'plan', label: planLabel },
          ...REST_CHOICES.map((s) => ({ value: String(s), label: `${s} s` })),
        ],
        rest === null ? 'plan' : String(rest)
      )}
      <h2>${esc(COPY.getReady)}</h2>
      ${chips(
        'set-ready',
        READY_CHOICES.map((s) => ({ value: String(s), label: `${s} s` })),
        String(getGetReady())
      )}
      <h2>${esc(COPY.notesTitle)}</h2>
      <div id="settings-notes">${notesListHtml(opts.notes)}</div>
      <button type="button" class="door" id="install-row" aria-expanded="false"><span>${esc(COPY.settingsInstall)}</span><span aria-hidden="true">›</span></button>
      <div id="install-holder"></div>
      <h2>${esc(COPY.yourData)}</h2>
      <button type="button" class="btn btn-soft" id="export-btn">${esc(COPY.exportData)}</button>
      <h2>${esc(COPY.about)}</h2>
      <p class="quiet" id="about">${esc(opts.version)}</p>
      <button type="button" class="btn btn-soft" id="change-code">${esc(COPY.changeCode)}</button>
    </section>`;

  $(root, '#settings-back').addEventListener('click', opts.onBack);
  const beeps = $<HTMLButtonElement>(root, '#set-beeps');
  beeps.addEventListener('click', () => {
    setBeeps(!getBeeps());
    beeps.setAttribute('aria-pressed', String(getBeeps()));
    beeps.textContent = getBeeps() ? 'On' : 'Off';
  });
  $(root, '#install-row').addEventListener('click', () => {
    const holder = $(root, '#install-holder');
    const row = $(root, '#install-row');
    const open = holder.childElementCount > 0;
    holder.innerHTML = open ? '' : installCardHtml(browserKind(navigator.userAgent));
    row.setAttribute('aria-expanded', String(!open));
    paintInstallButtons(root);
  });
  const tipsBtn = $<HTMLButtonElement>(root, '#set-tips');
  tipsBtn.addEventListener('click', () => {
    setTipsOn(!getTipsOn());
    tipsBtn.setAttribute('aria-pressed', String(getTipsOn()));
    tipsBtn.textContent = getTipsOn() ? COPY.tipsHide : COPY.tipsShow;
    if (!getTipsOn()) closeTip();
  });
  $(root, '#tips-again').addEventListener('click', () => {
    resetTips();
    tipsBtn.setAttribute('aria-pressed', 'true');
    tipsBtn.textContent = COPY.tipsHide;
    toast(COPY.tipsAgainDone);
    consider();
  });
  const pick = (id: string, apply: (v: string) => void): void => {
    const group = $(root, `#${id}`);
    group.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('button.chip');
      if (!chip) return;
      group.querySelectorAll('button.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      apply(chip.dataset.value ?? '');
    });
  };
  pick('set-rest', (v) => setRestOverride(v === 'plan' ? null : Number(v)));
  pick('set-ready', (v) => setGetReady(Number(v)));
  $(root, '#export-btn').addEventListener('click', opts.onExport);
  $(root, '#change-code').addEventListener('click', () => {
    if (document.getElementById('confirm-code')) return;
    const sheet = document.createElement('div');
    sheet.id = 'confirm-code';
    sheet.className = 'exit-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    const unsent =
      opts.unsent > 0
        ? `<p id="confirm-unsent">${opts.unsent} not sent yet will be removed from this phone.</p>`
        : '';
    sheet.innerHTML = `
      <div class="exit-card">
        <h2 class="exit-title">${esc(COPY.changeCodeTitle)}</h2>
        <p>${esc(COPY.changeCodeText)}</p>
        ${unsent}
        <button type="button" class="btn btn-main" id="confirm-yes">${esc(COPY.changeCodeYes)}</button>
        <button type="button" class="btn btn-soft" id="confirm-no">${esc(COPY.cancel)}</button>
      </div>`;
    document.body.appendChild(sheet);
    $(sheet, '#confirm-no').addEventListener('click', () => sheet.remove());
    $(sheet, '#confirm-yes').addEventListener('click', () => {
      sheet.remove();
      opts.onChangeCode();
    });
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) sheet.remove();
    });
  });
}

export function closeSettingsSheets(): void {
  document.getElementById('confirm-code')?.remove();
}
