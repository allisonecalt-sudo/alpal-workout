// "Add to your Home Screen": is the app installed, which browser is this, and the steps for it.
// Pure logic and HTML; the screens place the card.
import { COPY } from './copy';
import { esc } from './dom';

export type BrowserKind = 'ios-safari' | 'ios-chrome' | 'android-chrome' | 'other';

/** Opened from the home screen (full screen), not from a browser tab. */
export function isInstalled(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** Which browser (and phone) this is, from the user agent. */
export function browserKind(ua: string): BrowserKind {
  if (/iPhone|iPad|iPod/i.test(ua)) return /CriOS/i.test(ua) ? 'ios-chrome' : 'ios-safari';
  if (/Android/i.test(ua) && /Chrome/i.test(ua)) return 'android-chrome';
  return 'other';
}

const STEPS: Record<Exclude<BrowserKind, 'other'>, { title: string; steps: readonly string[] }> = {
  'ios-safari': { title: COPY.installSafariTitle, steps: COPY.installSafari },
  'ios-chrome': { title: COPY.installIosChromeTitle, steps: COPY.installIosChrome },
  'android-chrome': { title: COPY.installAndroidTitle, steps: COPY.installAndroid },
};

const ORDER: Exclude<BrowserKind, 'other'>[] = ['ios-safari', 'ios-chrome', 'android-chrome'];

function list(steps: readonly string[]): string {
  return `<ol class="install-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
}

/** The steps for this browser, the other browsers folded away, and the closing lines. */
export function installBodyHtml(kind: BrowserKind, opts: { unlock?: boolean } = {}): string {
  const first: Exclude<BrowserKind, 'other'> = kind === 'other' ? 'ios-safari' : kind;
  const others = ORDER.filter((k) => k !== first);
  const iphone = kind === 'ios-safari' || kind === 'ios-chrome' || kind === 'other';
  return `
    <div class="install-first" id="install-first" data-browser="${first}">
      <h3>${esc(STEPS[first].title)}</h3>
      ${list(STEPS[first].steps)}
    </div>
    ${
      opts.unlock
        ? `<p class="install-note" id="install-storage">${esc(COPY.installStorageUnlock)}</p>`
        : iphone
          ? `<p class="install-note" id="install-storage">${esc(COPY.installStorage)}</p>`
          : ''
    }
    <p class="install-note" id="install-fullscreen">${esc(COPY.installFullScreen)}</p>
    <details class="install-other" id="install-other">
      <summary>${esc(COPY.installOther)}</summary>
      ${others.map((k) => `<h3>${esc(STEPS[k].title)}</h3>${list(STEPS[k].steps)}`).join('')}
    </details>
    <div class="install-prompt" id="install-prompt-slot"></div>`;
}

/** The card for Home and Settings. `notNow` adds the dismiss button (Home only). */
export function installCardHtml(kind: BrowserKind, opts: { notNow?: boolean } = {}): string {
  return `<section class="card install-card" id="install-card">
      <h2>${esc(COPY.installTitle)}</h2>
      ${installBodyHtml(kind)}
      ${
        opts.notNow
          ? `<button type="button" class="btn btn-soft" id="install-notnow">${esc(COPY.installNotNow)}</button>`
          : ''
      }
    </section>`;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: InstallPromptEvent | null = null;

/** Put an Install button in every place that has a slot, when the browser offers one (Android). */
export function paintInstallButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('#install-prompt-slot').forEach((slot) => {
    if (deferred === null || slot.childElementCount > 0) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-main';
    btn.id = 'install-btn';
    btn.textContent = COPY.installButton;
    btn.addEventListener('click', () => {
      const ev = deferred;
      if (!ev) return;
      deferred = null;
      void ev
        .prompt()
        .then(() => ev.userChoice)
        .catch(() => undefined);
      btn.remove();
    });
    slot.appendChild(btn);
  });
}

/** Listen once for the browser's own install offer. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    paintInstallButtons();
  });
}
