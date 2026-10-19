// The strip across the top of every workout screen (Back, Pause, Exit, Voice) and the two
// things it opens: the "Stop here?" sheet and the full-screen "Paused".
import { COPY } from '../copy';
import { $ } from '../dom';
import { stopSpeaking } from '../device';
import { getVoice, setVoice } from '../storage';

export interface RunBarHandlers {
  onBack: () => void;
  onPause: () => void;
  onExit: () => void;
}

/** `showVoice` is false on screens that never speak. */
export function runBarHtml(showVoice = true): string {
  return `<div class="runbar">
      <button type="button" class="back-link" id="back-btn" aria-label="Back one step">‹ Back</button>
      <span class="runbar-right">
        <button type="button" class="icon-btn" id="pause-btn" aria-label="Pause workout">⏸</button>
        <button type="button" class="icon-btn" id="exit-btn" aria-label="Exit">✕</button>
        ${
          showVoice
            ? `<button type="button" class="icon-btn" id="voice-btn" aria-label="Voice" aria-pressed="false"></button>`
            : ''
        }
      </span>
    </div>`;
}

export function wireRunBar(root: HTMLElement, h: RunBarHandlers): void {
  $(root, '#back-btn').addEventListener('click', h.onBack);
  $(root, '#pause-btn').addEventListener('click', h.onPause);
  $(root, '#exit-btn').addEventListener('click', h.onExit);
  const voice = root.querySelector<HTMLButtonElement>('#voice-btn');
  if (voice) {
    const paint = (): void => {
      const on = getVoice();
      voice.textContent = on ? '🔊' : '🔇';
      voice.setAttribute('aria-pressed', String(on));
    };
    paint();
    voice.addEventListener('click', () => {
      setVoice(!getVoice());
      paint();
      if (!getVoice()) stopSpeaking();
    });
  }
}

export interface ExitHandlers {
  /** Log what I did: the After screen, marked lite. */
  onLog: () => void;
  /** Quit without saving: Home, the workout is dropped. */
  onQuit: () => void;
}

/** The "Stop here?" sheet. "Keep going" (or a tap outside) just closes it. */
export function showExitSheet(h: ExitHandlers): void {
  if (document.getElementById('exit-sheet')) return;
  const sheet = document.createElement('div');
  sheet.id = 'exit-sheet';
  sheet.className = 'exit-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', COPY.exitTitle);
  sheet.innerHTML = `
    <div class="exit-card">
      <h2 class="exit-title">${COPY.exitTitle}</h2>
      <button type="button" class="btn btn-main" id="exit-log">${COPY.exitLog}</button>
      <button type="button" class="btn btn-soft" id="exit-keep">${COPY.exitKeep}</button>
      <button type="button" class="back-link" id="exit-quit">${COPY.exitQuit}</button>
    </div>`;
  document.body.appendChild(sheet);
  const close = (): void => sheet.remove();
  $(sheet, '#exit-keep').addEventListener('click', close);
  $(sheet, '#exit-log').addEventListener('click', () => {
    close();
    h.onLog();
  });
  $(sheet, '#exit-quit').addEventListener('click', () => {
    close();
    h.onQuit();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });
}

export function closeExitSheet(): void {
  document.getElementById('exit-sheet')?.remove();
}

export interface PausedHandlers {
  onResume: () => void;
  onExit: () => void;
}

/** Full-screen "Paused". Every timer is frozen while it shows. */
export function showPaused(h: PausedHandlers): void {
  if (document.getElementById('paused-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'paused-overlay';
  overlay.className = 'paused-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', COPY.paused);
  overlay.innerHTML = `
    <div class="paused-inner">
      <h1>${COPY.paused}</h1>
      <button type="button" class="btn btn-main" id="resume-btn">${COPY.resume}</button>
      <button type="button" class="btn btn-soft" id="paused-exit">✕ ${COPY.exit}</button>
    </div>`;
  document.body.appendChild(overlay);
  $(overlay, '#resume-btn').addEventListener('click', () => {
    overlay.remove();
    h.onResume();
  });
  $(overlay, '#paused-exit').addEventListener('click', h.onExit);
}

export function closePaused(): void {
  document.getElementById('paused-overlay')?.remove();
}
