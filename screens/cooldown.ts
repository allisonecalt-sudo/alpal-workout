// The cool-down as one list: every move on one page (left/right pairs folded into "each side"),
// a rough length, each row opens its how-to and video, then one Done or Skip.
import { stopAudio } from '../audio';
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { movePlain } from '../program';
import { pauseProgress, resumeProgress, type Progress } from '../progress';
import { cooldownMinutes, groupStretchPairs } from '../steps';
import { setProgress } from '../storage';
import type { Workout } from '../types';
import { feelAt, setFeel } from '../feel';
import { feelRowHtml, wireFeelRow } from './feelrow';
import { moveInfoHtml, wireMoveInfo } from './moveinfo';
import {
  closeExitSheet,
  closePaused,
  runBarHtml,
  showExitSheet,
  showPaused,
  wireRunBar,
} from './runbar';

export interface CooldownOptions {
  workout: Workout;
  progress: Progress;
  /** Back to the last main move. */
  onBack: () => void;
  /** Done stretching / Skip / Exit-and-log: on to the After screen. */
  onFinish: (how: 'done' | 'skipped' | 'stopped') => void;
  /** Quit without saving. */
  onQuit: () => void;
}

export function leaveCooldown(): void {
  stopAudio();
  closeExitSheet();
  closePaused();
}

export function renderCooldown(root: HTMLElement, opts: CooldownOptions): void {
  const { workout, progress } = opts;
  const groups = groupStretchPairs(workout.cooldown);
  const rows = groups
    .map((g, k) => {
      const first = g.items[0];
      const amount =
        movePlain(first) +
        (g.eachSide && !/each side/i.test(first.reps ?? '') ? ' · each side' : '');
      return `<details class="cd-row">
          <summary><span class="mv-name">${esc(g.name)}</span><span class="mv-amt">${esc(amount)}</span></summary>
          ${moveInfoHtml(first, `-${k}`)}
          ${feelRowHtml(`feel-row-${k}`, feelAt(progress.moveFeel, g.name, 1))}
        </details>`;
    })
    .join('');
  root.innerHTML = `
    <section class="workout cooldown" id="cooldown">
      ${runBarHtml()}
      <p class="progress-line" id="progress-line">${esc(COPY.cooldownTitle)}</p>
      <h1 class="move-name">${esc(COPY.cooldownTitle)}</h1>
      <p class="quiet" id="cooldown-minutes">~${cooldownMinutes(workout.cooldown)} min</p>
      <div id="cooldown-list">${rows}</div>
      <div class="actions">
        <button type="button" class="btn btn-main" id="cooldown-done">${esc(COPY.doneStretching)}</button>
        <button type="button" class="btn btn-soft" id="cooldown-skip">${esc(COPY.skip)}</button>
      </div>
    </section>`;
  groups.forEach((g, k) => {
    wireMoveInfo(root, g.items[0], `-${k}`);
    wireFeelRow(root, `feel-row-${k}`, (value) => {
      setFeel(progress.moveFeel, g.name, 1, value);
      setProgress(progress);
    });
  });

  const showPausedOverlay = (): void =>
    showPaused({
      onResume: () => {
        resumeProgress(progress, Date.now());
        setProgress(progress);
      },
      onExit: exit,
    });
  const exit = (): void =>
    showExitSheet({ onLog: () => opts.onFinish('stopped'), onQuit: opts.onQuit });
  wireRunBar(root, {
    onBack: opts.onBack,
    onPause: () => {
      pauseProgress(progress, Date.now());
      setProgress(progress);
      showPausedOverlay();
    },
    onExit: exit,
  });
  $(root, '#cooldown-done').addEventListener('click', () => opts.onFinish('done'));
  $(root, '#cooldown-skip').addEventListener('click', () => opts.onFinish('skipped'));
  if (progress.pausedAt !== null) showPausedOverlay();
}
