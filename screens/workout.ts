// 1c. Workout: one move at a time through the warm-up and the main rounds. Between main moves a
// rest (if the data has one); between rounds a "Round done" screen; holds get a get-ready count;
// a cardio choice runs the option picked; a new move asks how it felt after its last round.
// Everything is saved after every change, so a reload picks up on the same step.
import { COPY } from '../copy';
import { $, esc, toast } from '../dom';
import { stopAudio } from '../audio';
import { chime, goBeep, tick, unlockAudio } from '../device';
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
import { movePlain } from '../program';
import { endProgress, pauseProgress, resumeProgress, type Progress } from '../progress';
import {
  buildSteps,
  effectiveRounds,
  endsRound,
  isChoiceStep,
  progressLabel,
  restFollows,
  restSecondsOf,
  skippedSteps,
  stoppedAtOf,
  type Step,
} from '../steps';
import { getCardio, getGetReady, getRestOverride, setCardio, setProgress } from '../storage';
import { formatRemaining, isFinished, newTimer, remainingMs, startTimer } from '../timer';
import type { Feel, MoveStatus, Program, Workout } from '../types';
import { moveInfoHtml, wireMoveInfo } from './moveinfo';
import {
  closeExitSheet,
  closePaused,
  runBarHtml,
  showExitSheet,
  showPaused,
  wireRunBar,
} from './runbar';
import { closeStepSheet, showStepSheet } from './stepsheet';

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
  stopAudio();
  closeExitSheet();
  closeStepSheet();
  closePaused();
}

const FEELS: { value: Feel; label: string }[] = [
  { value: 'easy', label: COPY.feelEasy },
  { value: 'right', label: COPY.feelRight },
  { value: 'hard', label: COPY.feelHard },
];

export function renderWorkout(root: HTMLElement, opts: WorkoutOptions): void {
  const { workout, program, progress } = opts;
  let steps: Step[] = buildSteps(workout, progress.before.lite, progress.choices);
  const rounds = effectiveRounds(workout, progress.before.lite);
  const restSec = restSecondsOf(workout, program, getRestOverride());
  let freezeHold = opts.resumed;

  const save = (): void => setProgress(progress);
  const now = (): number => Date.now();
  const rebuild = (): void => {
    steps = buildSteps(workout, progress.before.lite, progress.choices);
  };

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
    progress.redoAsk = false;
    progress.redoing = false;
    if (workout.cooldown.length > 0) {
      progress.stage = 'cooldown';
      save();
      leave('cooldown');
    } else toAfter(false);
  };

  /** After the last step: offer the skipped ones once, then on to the cool-down. */
  const afterLast = (): void => {
    const skipped = skippedSteps(progress.statuses, steps);
    if (skipped.length > 0 && !progress.redoAsked) {
      progress.redoAsk = true;
      progress.redoAsked = true;
      save();
      show(false);
      return;
    }
    finishMain();
  };

  /** Does a new or stepped-up move just finish its last round? */
  const needsFeel = (step: Step, status: MoveStatus): boolean => {
    if (status !== 'done') return false;
    if (!step.move.new && !step.move.stepped) return false;
    return step.part === 'warmup' || step.round === rounds;
  };

  const advance = (status: MoveStatus): void => {
    captureHold();
    const step = steps[progress.idx];
    progress.statuses[progress.idx] = status;
    const done = progress.idx;
    progress.hold = null;
    progress.rest = null;
    if (needsFeel(step, status)) progress.feelAsk = step.move.name;
    if (progress.redoing) {
      // doing the skipped steps now: the next one in the list, then the end
      const next = progress.redo.shift();
      progress.between = false;
      if (next !== undefined) progress.idx = next;
      else {
        progress.redoing = false;
        progress.idx = steps.length;
      }
    } else {
      progress.idx = done + 1;
      progress.between = progress.idx < steps.length && endsRound(steps, done, rounds);
      if (!progress.between && restSec > 0 && restFollows(steps, done)) {
        progress.rest = startTimer(newTimer(restSec), now());
      }
    }
    save();
    if (progress.feelAsk === null && progress.idx >= steps.length) return afterLast();
    show(!progress.between && progress.rest === null);
  };

  const goBack = (): void => {
    captureHold();
    if (progress.idx === 0 && progress.rest === null && !progress.feelAsk) {
      // the first step has nothing behind it: back goes to the Before screen
      progress.stage = 'before';
      progress.hold = null;
      save();
      leave('before');
      return;
    }
    // from a rest, the between screen or a question, idx already points at the NEXT step: back is
    // the move she just finished; from a move it is the move before it. One index back.
    const target = Math.min(progress.idx, steps.length) - 1;
    delete progress.holds[String(target)];
    progress.idx = Math.max(0, target);
    progress.statuses[progress.idx] = null;
    progress.between = false;
    progress.rest = null;
    progress.hold = null;
    progress.feelAsk = null;
    progress.redoAsk = false;
    progress.redoAsked = false;
    progress.redoing = false;
    save();
    show(false);
  };

  /** The jump list: any step, in any order. */
  const jumpTo = (k: number): void => {
    captureHold();
    progress.idx = Math.max(0, Math.min(steps.length - 1, k));
    progress.between = false;
    progress.rest = null;
    progress.hold = null;
    progress.feelAsk = null;
    progress.redoAsk = false;
    progress.redoing = false;
    save();
    show(false);
  };

  const openSteps = (): void =>
    showStepSheet({
      steps,
      statuses: progress.statuses,
      current: Math.min(progress.idx, steps.length - 1),
      rounds,
      onJump: jumpTo,
    });

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

  const bar = (): void =>
    wireRunBar(root, { onBack: goBack, onPause: doPause, onExit: doExit, onSteps: openSteps });

  const showBetween = (): void => {
    const done = steps[progress.idx - 1].round;
    root.innerHTML = `
      <section class="workout between">
        ${runBarHtml(true)}
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

  /** "How was it?" for a new or stepped-up move, after its last round. */
  const showFeelAsk = (): void => {
    const name = progress.feelAsk ?? '';
    root.innerHTML = `
      <section class="workout feel">
        ${runBarHtml(true)}
        <h1 id="move-feel-title">How was ${esc(name)}?</h1>
        <div class="chips" id="move-feel">${FEELS.map(
          (f) =>
            `<button type="button" class="chip" data-feel="${f.value}">${esc(f.label)}</button>`
        ).join('')}</div>
        <button type="button" class="back-link" id="move-feel-skip">${esc(COPY.moveFeelSkip)}</button>
      </section>`;
    bar();
    const done = (): void => {
      progress.feelAsk = null;
      save();
      if (progress.idx >= steps.length) return afterLast();
      show(!progress.between && progress.rest === null);
    };
    $(root, '#move-feel').addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('button.chip');
      if (!chip) return;
      progress.moveFeel[name] = chip.dataset.feel as Feel;
      done();
    });
    $(root, '#move-feel-skip').addEventListener('click', done);
  };

  /** After the last step: "2 skipped — do them now?" */
  const showRedoAsk = (): void => {
    const skipped = skippedSteps(progress.statuses, steps);
    root.innerHTML = `
      <section class="workout between">
        ${runBarHtml(true)}
        <h1 id="redo-title">${skipped.length} skipped — do them now?</h1>
        <div class="actions">
          <button type="button" class="btn btn-main" id="redo-yes">${esc(COPY.doThem)}</button>
          <button type="button" class="btn btn-soft" id="redo-no">${esc(COPY.finish)}</button>
        </div>
      </section>`;
    bar();
    $(root, '#redo-yes').addEventListener('click', () => {
      progress.redoAsk = false;
      progress.redoing = true;
      progress.redo = skipped.slice(1);
      progress.idx = skipped[0];
      progress.between = false;
      save();
      show(true);
    });
    $(root, '#redo-no').addEventListener('click', () => {
      progress.redoAsk = false;
      save();
      finishMain();
    });
  };

  const RING = 2 * Math.PI * 52;

  const showRest = (): void => {
    const next = steps[progress.idx];
    const t = progress.rest;
    if (!t) return;
    root.innerHTML = `
      <section class="workout rest" id="rest-screen">
        ${runBarHtml(true)}
        <p class="progress-line">${esc(COPY.rest)}</p>
        <div class="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="ring-bg" cx="60" cy="60" r="52"></circle>
            <circle class="ring-fg" id="rest-ring" cx="60" cy="60" r="52"
              stroke-dasharray="${RING}" stroke-dashoffset="0"></circle>
          </svg>
          <div class="ring-count" id="rest-count" role="timer"></div>
        </div>
        <p class="rest-next" id="rest-next">Next · ${esc(next.move.name)} · ${esc(movePlain(next.move))}</p>
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

  /** The cardio choice: one button per option, and a way to skip it today. */
  const showChoice = (step: Step): void => {
    const options = step.move.options ?? [];
    const last = getCardio();
    root.innerHTML = `
      <section class="workout choice">
        ${runBarHtml(true)}
        <p class="progress-line" id="progress-line">${esc(progressLabel(step, workout, rounds))}</p>
        <h1 class="move-name" id="move-name">${esc(step.move.name)}</h1>
        <ul class="how" id="how">${step.move.how.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <div class="actions">
          ${options
            .map(
              (o, k) =>
                `<button type="button" class="btn ${
                  o.label === last ? 'btn-main' : 'btn-soft'
                }" id="cardio-opt-${k}">${esc(o.label)}${
                  o.label === last ? ' <span class="last-time">· last time</span>' : ''
                }</button>`
            )
            .join('')}
          <button type="button" class="back-link" id="cardio-skip">${esc(COPY.skipCardio)}</button>
        </div>
      </section>`;
    bar();
    options.forEach((o, k) =>
      $(root, `#cardio-opt-${k}`).addEventListener('click', () => {
        unlockAudio();
        progress.choices[step.choiceKey ?? ''] = k;
        setCardio(o.label);
        rebuild();
        save();
        show(true);
      })
    );
    $(root, '#cardio-skip').addEventListener('click', () => {
      toast(COPY.skipped);
      advance('skipped');
    });
  };

  /** The move card for a step. */
  const showStep = (speakIt: boolean): void => {
    const step = steps[progress.idx];
    if (isChoiceStep(step)) return showChoice(step);
    const move = step.move;
    const timed = move.seconds !== undefined;
    if (timed) {
      if (!progress.hold) progress.hold = newHold(move.seconds ?? 0, getGetReady());
      else if (freezeHold && progress.pausedAt === null) {
        progress.hold = afterReload(progress.hold, now());
      }
      // an option's timed moves go on by themselves, with their get-ready
      if (step.auto && speakIt && progress.hold.phase === 'ready' && progress.pausedAt === null) {
        progress.hold = startHold(progress.hold, now());
      }
      freezeHold = false;
      save();
    }
    freezeHold = false;
    const hold: HoldState | null = timed ? progress.hold : null;
    const amount = hold ? holdHtml(hold) : `<p class="reps" id="reps">${esc(move.reps ?? '')}</p>`;
    const pain = program.painRule
      ? `<p class="pain-rule" id="pain-rule">${esc(program.painRule)}</p>`
      : '';
    const badges =
      move.new || move.stepped
        ? `<p class="badges">${
            move.new ? `<span class="badge" id="badge-new">${esc(COPY.newBadge)}</span>` : ''
          }${
            move.stepped
              ? `<span class="badge" id="badge-stepped">${esc(COPY.steppedBadge)}</span>`
              : ''
          }</p>`
        : '';
    root.innerHTML = `
      <section class="workout">
        ${runBarHtml(true)}
        <p class="progress-line" id="progress-line">${esc(progressLabel(step, workout, rounds))}</p>
        <h1 class="move-name" id="move-name">${esc(move.name)}</h1>
        ${badges}
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
    if (hold) wireHold(step);
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

  const wireHold = (step: Step): void => {
    const h0 = progress.hold;
    if (!h0) return;
    const display = root.querySelector<HTMLElement>('#timer');
    const paint = (): void => {
      const h = progress.hold;
      if (!h || !display) return;
      let text = '';
      if (h.phase === 'ready') text = formatRemaining(h.run.durationMs);
      else if (h.phase === 'pre') {
        text = String(Math.max(1, Math.ceil(remainingMs(h.pre, now()) / 1000)));
      } else if (h.phase === 'hold') text = formatRemaining(remainingMs(h.run, now()));
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
      const atIdx = progress.idx;
      tickHandle = window.setInterval(() => {
        const h = progress.hold;
        if (!h || progress.pausedAt !== null) return;
        const before = h.phase;
        const out = tickHold(h, now());
        progress.hold = out.hold;
        if (out.event === 'count') tick();
        else if (out.event === 'go') goBeep();
        else if (out.event === 'finish') {
          chime();
          if (step.auto) {
            // an option's timed move goes on by itself once it is held
            window.setTimeout(() => {
              if (
                progress.idx === atIdx &&
                progress.hold?.phase === 'held' &&
                progress.pausedAt === null
              ) {
                advance('done');
              }
            }, 900);
          }
        }
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
    stopAudio(); // a new screen is a new move: its explanation does not carry over
    window.clearInterval(tickHandle);
    tickHandle = undefined;
    closeExitSheet();
    closeStepSheet();
    closePaused();
    if (progress.rest && isFinished(progress.rest, now()) && progress.pausedAt === null) {
      progress.rest = null; // a rest that ran out while the page was closed is simply over
      save();
    }
    if (progress.feelAsk) showFeelAsk();
    else if (progress.redoAsk) showRedoAsk();
    else if (progress.idx >= steps.length) return afterLast();
    else if (progress.rest) showRest();
    else if (progress.between) showBetween();
    else showStep(speakIt);
    if (progress.pausedAt !== null) showPausedOverlay();
  };

  show(opts.speakFirst);
}
