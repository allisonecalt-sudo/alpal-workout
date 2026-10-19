// 1c. Workout: one move at a time through the warm-up and the main rounds. Between main moves a
// rest (if the data has one); between rounds a "Round done" screen; holds get a get-ready count.
// Everything is saved after every change, so a reload picks up on the same step.
import { COPY } from '../copy';
import { $, esc, toast } from '../dom';
import { chime, goBeep, speak, stopSpeaking, tick, unlockAudio } from '../device';
import {
  afterReload,
  heldSoFar,
  newHold,
  redoHold,
  startHold,
  stopHold,
  tickHold,
  type HoldState,
} from '../hold';
import { endProgress, pauseProgress, resumeProgress, type Progress } from '../progress';
import {
  buildSteps,
  effectiveRounds,
  endsRound,
  progressLabel,
  restFollows,
  restSecondsOf,
  stoppedAtOf,
  type Step,
} from '../steps';
import { getGetReady, getRestOverride, getVoice, setProgress } from '../storage';
import { formatRemaining, isFinished, newTimer, remainingMs, startTimer } from '../timer';
import type { MoveStatus, Program, Workout } from '../types';
import { moveInfoHtml, wireMoveInfo } from './moveinfo';
import {
  closeExitSheet,
  closePaused,
  runBarHtml,
  showExitSheet,
  showPaused,
  wireRunBar,
} from './runbar';

export type RunExit = 'before' | 'cooldown' | 'after' | 'home';

export interface WorkoutOptions {
  program: Program;
  workout: Workout;
  progress: Progress;
  /** Read the first move aloud now (true when she just tapped Start). */
  speakFirst: boolean;
  /** The page was just (re)loaded with this workout in the middle of a hold. */
  resumed: boolean;
  /** Called when the run is over (after progress has been updated and saved). */
  onExit: (to: RunExit) => void;
}

let tickHandle: number | undefined;

/** Stop the timer loop and anything open. Call whenever the workout screens are left. */
export function leaveWorkout(): void {
  window.clearInterval(tickHandle);
  tickHandle = undefined;
  stopSpeaking();
  closeExitSheet();
  closePaused();
}

export function renderWorkout(root: HTMLElement, opts: WorkoutOptions): void {
  const { workout, program, progress } = opts;
  const steps: Step[] = buildSteps(workout, progress.before.lite);
  const rounds = effectiveRounds(workout, progress.before.lite);
  const restSec = restSecondsOf(workout, program, getRestOverride());
  let freezeHold = opts.resumed;

  const save = (): void => setProgress(progress);
  const now = (): number => Date.now();

  /** Whatever hold is on the current step counts for what was really held. */
  const captureHold = (): void => {
    const h = progress.hold;
    if (!h) return;
    const key = String(progress.idx);
    if (h.phase === 'held') progress.holds[key] = h.heldSec;
    else if (h.phase === 'hold') {
      const sec = heldSoFar(h, now());
      if (sec > 0) progress.holds[key] = sec;
    }
  };

  const leave = (to: RunExit): void => {
    leaveWorkout();
    opts.onExit(to);
  };

  /** Into the After screen: the workout has ended (finished the list, or stopped early). */
  const toAfter = (stopped: boolean): void => {
    captureHold();
    if (stopped) {
      progress.stoppedAt = stoppedAtOf(
        steps,
        progress.idx,
        progress.between,
        progress.rest !== null,
        false
      );
    }
    endProgress(progress, now());
    save();
    leave('after');
  };

  /** The main moves are done: the cool-down list, or straight to After when there is none. */
  const finishMain = (): void => {
    captureHold();
    progress.rest = null;
    progress.hold = null;
    progress.between = false;
    if (workout.cooldown.length > 0) {
      progress.stage = 'cooldown';
      save();
      leave('cooldown');
    } else toAfter(false);
  };

  const advance = (status: MoveStatus): void => {
    captureHold();
    progress.statuses[progress.idx] = status;
    const done = progress.idx;
    progress.idx += 1;
    progress.hold = null;
    progress.rest = null;
    if (progress.idx >= steps.length) return finishMain();
    progress.between = endsRound(steps, done, rounds);
    if (!progress.between && restSec > 0 && restFollows(steps, done)) {
      progress.rest = startTimer(newTimer(restSec), now());
    }
    save();
    show(!progress.between && progress.rest === null);
  };

  const goBack = (): void => {
    captureHold();
    if (progress.idx === 0 && progress.rest === null) {
      // the first step has nothing behind it: back goes to the Before screen
      progress.stage = 'before';
      progress.hold = null;
      save();
      leave('before');
      return;
    }
    // from a rest or a between screen, idx already points at the NEXT step: back is the move she
    // just finished; from a move it is the move before it. Either way one index back.
    const target = progress.idx - 1;
    delete progress.holds[String(target)];
    progress.idx = target;
    progress.statuses = progress.statuses.slice(0, target);
    progress.between = false;
    progress.rest = null;
    progress.hold = null;
    save();
    show(false);
  };

  const doPause = (): void => {
    pauseProgress(progress, now());
    save();
    window.clearInterval(tickHandle);
    showPausedOverlay();
  };

  const doExit = (): void => {
    showExitSheet({
      onLog: () => toAfter(true),
      onQuit: () => {
        leave('home'); // the half session is dropped by the app
      },
    });
  };

  const showPausedOverlay = (): void => {
    showPaused({
      onResume: () => {
        resumeProgress(progress, now());
        save();
        show(false);
      },
      onExit: doExit,
    });
  };

  const bar = (): void => wireRunBar(root, { onBack: goBack, onPause: doPause, onExit: doExit });

  const showBetween = (): void => {
    const done = steps[progress.idx - 1].round;
    root.innerHTML = `
      <section class="workout between">
        ${runBarHtml(false)}
        <h1 id="between-title">Round ${done} done 👏 · Round ${done + 1} of ${rounds}</h1>
        <div class="actions">
          <button type="button" class="btn btn-main" id="next-round-btn">Next round</button>
          <button type="button" class="btn btn-soft" id="finish-btn">Finish now</button>
        </div>
      </section>`;
    bar();
    $(root, '#next-round-btn').addEventListener('click', () => {
      progress.between = false;
      save();
      show(true);
    });
    $(root, '#finish-btn').addEventListener('click', () => toAfter(true));
  };

  const RING = 2 * Math.PI * 52;

  const showRest = (): void => {
    const next = steps[progress.idx];
    const t = progress.rest;
    if (!t) return;
    root.innerHTML = `
      <section class="workout rest" id="rest-screen">
        ${runBarHtml(false)}
        <p class="progress-line">${esc(COPY.rest)}</p>
        <div class="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="ring-bg" cx="60" cy="60" r="52"></circle>
            <circle class="ring-fg" id="rest-ring" cx="60" cy="60" r="52"
              stroke-dasharray="${RING}" stroke-dashoffset="0"></circle>
          </svg>
          <div class="ring-count" id="rest-count" role="timer"></div>
        </div>
        <p class="rest-next" id="rest-next">Next · ${esc(next.move.name)} · ${esc(
          next.move.reps ?? `${next.move.seconds} s`
        )}</p>
        <div class="actions">
          <button type="button" class="btn btn-soft" id="skip-rest">${esc(COPY.skipRest)}</button>
        </div>
      </section>`;
    bar();
    const count = $(root, '#rest-count');
    const ring = $(root, '#rest-ring');
    const paint = (): void => {
      const rest = progress.rest;
      if (!rest) return;
      const rem = remainingMs(rest, now());
      const text = String(Math.ceil(rem / 1000));
      if (count.textContent !== text) count.textContent = text;
      ring.setAttribute('stroke-dashoffset', String(RING * (1 - rem / rest.durationMs)));
    };
    const endRest = (): void => {
      progress.rest = null;
      save();
      show(true);
    };
    $(root, '#skip-rest').addEventListener('click', endRest);
    paint();
    tickHandle = window.setInterval(() => {
      const rest = progress.rest;
      if (!rest || progress.pausedAt !== null) return;
      if (isFinished(rest, now())) return endRest();
      paint();
    }, 250);
  };

  /** The move card for a step. */
  const showStep = (speakIt: boolean): void => {
    const step = steps[progress.idx];
    const move = step.move;
    const timed = move.seconds !== undefined;
    if (timed) {
      if (!progress.hold) progress.hold = newHold(move.seconds ?? 0, getGetReady());
      else if (freezeHold && progress.pausedAt === null) progress.hold = afterReload(progress.hold);
      freezeHold = false;
      save();
    }
    freezeHold = false;
    const hold: HoldState | null = timed ? progress.hold : null;
    const amount = hold ? holdHtml(hold) : `<p class="reps" id="reps">${esc(move.reps ?? '')}</p>`;
    const pain = program.painRule
      ? `<p class="pain-rule" id="pain-rule">${esc(program.painRule)}</p>`
      : '';
    root.innerHTML = `
      <section class="workout">
        ${runBarHtml(true)}
        <p class="progress-line" id="progress-line">${esc(progressLabel(step, workout, rounds))}</p>
        <h1 class="move-name" id="move-name">${esc(move.name)}</h1>
        ${moveInfoHtml(move)}
        ${amount}
        ${pain}
        <div class="actions">
          <button type="button" class="btn btn-main" id="done-btn">${esc(COPY.done)}</button>
          <div class="actions-row">
            <button type="button" class="btn btn-soft" id="skip-btn">${esc(COPY.skip)}</button>
            <button type="button" class="btn btn-soft" id="hurt-btn">${esc(COPY.hurts)}</button>
          </div>
        </div>
      </section>`;
    bar();
    wireMoveInfo(root, move);
    $(root, '#done-btn').addEventListener('click', () => advance('done'));
    $(root, '#skip-btn').addEventListener('click', () => {
      toast(COPY.skipped);
      advance('skipped');
    });
    $(root, '#hurt-btn').addEventListener('click', () => {
      toast(COPY.skipped);
      advance('hurt');
    });
    if (hold) wireHold();
    if (speakIt && getVoice() && progress.pausedAt === null) {
      speak([move.name, move.how[0] ?? ''].join('. '));
    }
  };

  const holdHtml = (h: HoldState): string => {
    if (h.phase === 'held') {
      return `<p class="held" id="held">✓ held ${h.heldSec} s</p>
        <button type="button" class="btn btn-soft" id="hold-redo">${esc(COPY.redo)}</button>`;
    }
    if (h.phase === 'pre') {
      return `<p class="get-ready" id="get-ready">${esc(COPY.getReady)}</p>
        <div class="timer" id="timer" role="timer" aria-live="off"></div>`;
    }
    const label = h.phase === 'hold' ? COPY.stop : COPY.start;
    return `<div class="timer" id="timer" role="timer" aria-live="off"></div>
        <button type="button" class="btn btn-soft" id="timer-btn">${esc(label)}</button>`;
  };

  const wireHold = (): void => {
    const h0 = progress.hold;
    if (!h0) return;
    const display = root.querySelector<HTMLElement>('#timer');
    const paint = (): void => {
      const h = progress.hold;
      if (!h || !display) return;
      let text = '';
      if (h.phase === 'ready') text = formatRemaining(h.run.durationMs);
      else if (h.phase === 'pre')
        text = String(Math.max(1, Math.ceil(remainingMs(h.pre, now()) / 1000)));
      else if (h.phase === 'hold') text = formatRemaining(remainingMs(h.run, now()));
      if (display.textContent !== text) display.textContent = text;
    };
    paint();
    root.querySelector('#timer-btn')?.addEventListener('click', () => {
      const h = progress.hold;
      if (!h) return;
      unlockAudio();
      if (h.phase === 'ready') {
        progress.hold = startHold(h, now());
      } else if (h.phase === 'hold') {
        progress.hold = stopHold(h, now());
      }
      save();
      show(false);
    });
    root.querySelector('#hold-redo')?.addEventListener('click', () => {
      const h = progress.hold;
      if (!h) return;
      delete progress.holds[String(progress.idx)];
      progress.hold = redoHold(h);
      save();
      show(false);
    });
    if (h0.phase === 'pre' || h0.phase === 'hold') {
      tickHandle = window.setInterval(() => {
        const h = progress.hold;
        if (!h || progress.pausedAt !== null) return;
        const before = h.phase;
        const out = tickHold(h, now());
        progress.hold = out.hold;
        if (out.event === 'count') tick();
        else if (out.event === 'go') goBeep();
        else if (out.event === 'finish') chime();
        if (out.hold.phase !== before) {
          save();
          show(false); // the card changes shape: Ready, get-ready, hold, held
          return;
        }
        if (out.hold.shown !== h.shown) save();
        paint();
      }, 250);
    }
  };

  const show = (speakIt: boolean): void => {
    window.clearInterval(tickHandle);
    tickHandle = undefined;
    closeExitSheet();
    closePaused();
    if (progress.rest && isFinished(progress.rest, now()) && progress.pausedAt === null) {
      progress.rest = null; // a rest that ran out while the page was closed is simply over
      save();
    }
    if (progress.idx >= steps.length) return finishMain();
    if (progress.rest) showRest();
    else if (progress.between) showBetween();
    else showStep(speakIt);
    if (progress.pausedAt !== null) showPausedOverlay();
  };

  show(opts.speakFirst);
}
