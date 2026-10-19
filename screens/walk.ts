// Log a walk: a timer you start, pause and finish, or "I already walked 10 · 20 · 30 · 45 min".
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { getWalk, setWalk } from '../storage';
import {
  WALK_CHOICES,
  formatWalked,
  pauseWalk,
  resumeWalk,
  startWalk,
  walkedMs,
  type WalkState,
} from '../walk';

export interface WalkOptions {
  /** Save the walk: minutes walked and when it ended. */
  onSave: (seconds: number, endMs: number) => Promise<void>;
  onBack: () => void;
}

let tickHandle: number | undefined;

export function leaveWalk(): void {
  window.clearInterval(tickHandle);
  tickHandle = undefined;
}

export function renderWalk(root: HTMLElement, opts: WalkOptions): void {
  leaveWalk();
  const draw = (): void => {
    leaveWalk();
    const w: WalkState | null = getWalk();
    const running = w !== null && w.pausedAt === null;
    const paused = w !== null && w.pausedAt !== null;
    root.innerHTML = `
      <section class="walk card">
        <div class="runbar"><button type="button" class="back-link" id="walk-back">‹ Home</button></div>
        <h1>${esc(COPY.walkTitle)}</h1>
        <p class="timer" id="walk-time" role="timer" aria-live="off">${formatWalked(
          w ? walkedMs(w, Date.now()) : 0
        )}</p>
        <div class="actions">
          ${
            w === null
              ? `<button type="button" class="btn btn-main" id="walk-start">${esc(COPY.start)}</button>`
              : `<button type="button" class="btn btn-soft" id="walk-pause">${
                  paused ? esc(COPY.resume) : esc(COPY.pause)
                }</button>
                 <button type="button" class="btn btn-main" id="walk-finish">${esc(COPY.finish)}</button>`
          }
        </div>
        <h2>${esc(COPY.walkedAlready)}</h2>
        <div class="chips chips-wrap" id="walk-chips">${WALK_CHOICES.map(
          (m) => `<button type="button" class="chip chip-inline" data-min="${m}">${m} min</button>`
        ).join('')}</div>
      </section>`;
    $(root, '#walk-back').addEventListener('click', opts.onBack);
    root.querySelector('#walk-start')?.addEventListener('click', () => {
      setWalk(startWalk(Date.now()));
      draw();
    });
    root.querySelector('#walk-pause')?.addEventListener('click', () => {
      const cur = getWalk();
      if (!cur) return;
      setWalk(cur.pausedAt === null ? pauseWalk(cur, Date.now()) : resumeWalk(cur, Date.now()));
      draw();
    });
    root.querySelector('#walk-finish')?.addEventListener('click', () => {
      const cur = getWalk();
      if (!cur) return;
      const now = Date.now();
      const secs = walkedMs(cur, now) / 1000;
      setWalk(null);
      void opts.onSave(secs, cur.pausedAt ?? now);
    });
    $(root, '#walk-chips').addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
      if (!chip?.dataset.min) return;
      setWalk(null);
      void opts.onSave(Number(chip.dataset.min) * 60, Date.now());
    });
    if (running) {
      tickHandle = window.setInterval(() => {
        const cur = getWalk();
        const el = document.getElementById('walk-time');
        if (cur && el) el.textContent = formatWalked(walkedMs(cur, Date.now()));
      }, 500);
    }
  };
  draw();
}
