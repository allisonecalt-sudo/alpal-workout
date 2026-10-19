// First-time tips: the FIRST time a feature appears, one small bubble points at it with a
// "Got it" button. One at a time, in order; each is remembered by id. A tip never covers the
// primary button (Start, Done, Save, Send), stays inside the screen, and never shows during a
// hold countdown, a recording, or while a sheet is open.
import { COPY } from './copy';
import { addTipSeen, getTipsOn, getTipsSeen } from './storage';

interface TipSpec {
  id: string;
  /** The thing the bubble points at. */
  selector: string;
  text: string;
  /** Extra condition on the target (e.g. a hold that has not started). */
  when?: (el: HTMLElement) => boolean;
}

/** In the order they are due. */
export const TIPS: TipSpec[] = [
  { id: 'home-week', selector: '#week-btn', text: COPY.tipWeek },
  { id: 'home-start', selector: '#start-btn', text: COPY.tipStart },
  { id: 'note-btn', selector: '#note-btn', text: COPY.tipNote },
  { id: 'before-scores', selector: '#before-body', text: COPY.tipBefore },
  { id: 'before-check', selector: '#before-check', text: COPY.tipCheck },
  { id: 'before-lite', selector: '#lite-chip', text: COPY.tipLite },
  {
    id: 'move-first',
    selector: '#move-name',
    text: COPY.tipMove,
    when: () => document.getElementById('done-btn') !== null,
  },
  { id: 'move-pills', selector: '#pills', text: COPY.tipPills },
  { id: 'move-feel', selector: '#feel-row', text: COPY.tipFeel },
  { id: 'move-hurt', selector: '#hurt-btn', text: COPY.tipHurt },
  {
    id: 'move-hold',
    selector: '#timer-btn',
    text: COPY.tipHold,
    when: (el) => el.textContent?.trim() === COPY.start,
  },
  { id: 'rest', selector: '#skip-rest', text: COPY.tipRest },
  { id: 'steps', selector: '#steps-btn', text: COPY.tipSteps },
  { id: 'pause', selector: '#pause-btn', text: COPY.tipPause },
  { id: 'after', selector: '#after-title', text: COPY.tipAfter },
  { id: 'questions', selector: '#q-text', text: COPY.tipQuestions },
  { id: 'sessions', selector: '#sessions-title', text: COPY.tipSessions },
  { id: 'progress', selector: '#progress-title', text: COPY.tipProgress },
];

const TIP_ID = 'tip';
let current: { id: string; target: HTMLElement } | null = null;
let timer: number | undefined;

/** Anything that must not have a bubble over it or a bubble beside it. */
function blocked(): boolean {
  if (
    document.querySelector(
      '#paused-overlay, #exit-sheet, #note-sheet, #confirm-code, .sheet, #get-ready'
    )
  ) {
    return true;
  }
  // a hold that is counting down
  const hold = document.getElementById('timer-btn');
  return hold !== null && hold.textContent?.trim() === COPY.stop;
}

function visible(el: HTMLElement): boolean {
  return !el.hidden && el.getClientRects().length > 0;
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function closeTip(): void {
  document.getElementById(TIP_ID)?.remove();
  current = null;
}

/** Make the bubble for a tip and put it above or below its target. False when neither fits. */
function place(spec: TipSpec, target: HTMLElement): boolean {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  let r = target.getBoundingClientRect();
  if (r.top < 0 || r.bottom > vh) {
    target.scrollIntoView({ block: 'center' });
    r = target.getBoundingClientRect();
  }
  const tip = document.createElement('div');
  tip.id = TIP_ID;
  tip.className = 'tip';
  tip.setAttribute('role', 'status');
  const width = Math.min(320, vw - 32);
  tip.style.width = `${width}px`;
  tip.style.visibility = 'hidden';
  tip.innerHTML = `<p class="tip-text"></p><button type="button" class="btn btn-soft tip-ok" id="tip-ok">${COPY.gotIt}</button>`;
  (tip.firstElementChild as HTMLElement).textContent = spec.text;
  document.body.appendChild(tip);
  const h = tip.offsetHeight;
  const left = Math.max(16, Math.min(vw - 16 - width, r.left + r.width / 2 - width / 2));
  const primary = [...document.querySelectorAll<HTMLElement>('.btn-main, .btn-start, .player')]
    .filter((b) => b !== target && visible(b))
    .map((b) => b.getBoundingClientRect());
  const hit = (top: number): DOMRect | undefined => {
    const box = new DOMRect(left, top, width, h);
    return primary.find((p) => overlaps(box, p));
  };
  // Below its target (the page grows to hold it), else above it, else just below the button
  // in the way. Never over the primary button, never above the top of the screen.
  const below = r.bottom + 10;
  const above = r.top - 10 - h;
  let top: number | null = null;
  let floating = false;
  if (!hit(below)) top = below;
  else if (above >= 8 && !hit(above)) top = above;
  else {
    let t = below;
    for (let k = 0; k < 3; k++) {
      const p = hit(t);
      if (!p) break;
      t = p.bottom + 10;
    }
    if (!hit(t)) {
      top = t;
      floating = true;
    }
  }
  if (top === null) {
    tip.remove();
    return false;
  }
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${top + window.scrollY}px`;
  // the little arrow points at the middle of the target
  const arrow = Math.max(14, Math.min(width - 14, r.left + r.width / 2 - left));
  tip.style.setProperty('--arrow-x', `${arrow}px`);
  tip.classList.add(floating ? 'tip-float' : top === below ? 'tip-below' : 'tip-above');
  tip.style.visibility = '';
  tip.scrollIntoView({ block: 'nearest' });
  tip.querySelector('#tip-ok')?.addEventListener('click', () => {
    addTipSeen(spec.id);
    closeTip();
    consider(); // the next one that is due, if any
  });
  current = { id: spec.id, target };
  return true;
}

/** The screen changed under a tip (the explanation player opened): place it again, clear of it. */
export function refreshTip(): void {
  closeTip();
  consider();
}

/** Show the next tip that is due on this screen, if none is showing. */
export function consider(): void {
  if (current) {
    if (current.target.isConnected && !blocked() && getTipsOn()) return;
    closeTip();
  }
  if (!getTipsOn() || blocked()) return;
  const seen = new Set(getTipsSeen());
  for (const spec of TIPS) {
    if (seen.has(spec.id)) continue;
    const el = document.querySelector<HTMLElement>(spec.selector);
    if (!el || !visible(el) || (spec.when && !spec.when(el))) continue;
    if (place(spec, el)) return;
  }
}

/** Watch the screen: whenever it changes, a tip may be due. */
export function startTips(): void {
  const onChange = (records: MutationRecord[]): void => {
    const own = (n: Node): boolean => n instanceof HTMLElement && n.id === TIP_ID;
    if (
      records.every(
        (r) =>
          [...r.addedNodes, ...r.removedNodes].length > 0 &&
          [...r.addedNodes, ...r.removedNodes].every(own)
      )
    ) {
      return;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(consider, 150);
  };
  const obs = new MutationObserver(onChange);
  const app = document.getElementById('app');
  if (app) obs.observe(app, { childList: true });
  obs.observe(document.body, { childList: true });
  const header = document.querySelector('header.top');
  if (header) obs.observe(header, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      closeTip();
      consider();
    }, 150);
  });
}
