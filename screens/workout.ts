// 1c. Workout: one move at a time, full screen. Progress is saved after every change, so a
// reload picks up on the same move with the timer's wall-clock time intact.
import { COPY } from '../copy';
import { $, esc, toast } from '../dom';
import { beep, speak, stopSpeaking, unlockAudio } from '../device';
import { getVoice, setProgress, setVoice, type Progress } from '../storage';
import {
  finishTimer,
  formatRemaining,
  isFinished,
  isRunning,
  newTimer,
  pauseTimer,
  remainingMs,
  startTimer,
} from '../timer';
import type { Move, MoveStatus, Program } from '../types';

export interface WorkoutOptions {
  program: Program;
  progress: Progress;
  /** Read the first move aloud now (true when she just tapped Start). */
  speakFirst: boolean;
  onFinished: () => void;
}

let tick: number | undefined;

/** Stop the timer loop. Call whenever the workout screen is left. */
export function leaveWorkout(): void {
  window.clearInterval(tick);
  tick = undefined;
  stopSpeaking();
}

export function renderWorkout(root: HTMLElement, opts: WorkoutOptions): void {
  const { program, progress } = opts;

  const save = (): void => setProgress(progress);

  const advance = (status: MoveStatus): void => {
    progress.statuses[progress.idx] = status;
    progress.idx += 1;
    progress.timer = null;
    save();
    show(true);
  };

  const show = (speakIt: boolean): void => {
    window.clearInterval(tick);
    if (progress.idx >= program.moves.length) {
      progress.finished = true;
      save();
      leaveWorkout();
      opts.onFinished();
      return;
    }
    const move: Move = program.moves[progress.idx];
    const timed = move.seconds !== undefined;
    if (timed && progress.timer === null) {
      progress.timer = newTimer(move.seconds ?? 0);
      save();
    }
    // A timer that ran out while the page was closed ends quietly, with no late beep.
    if (progress.timer && isRunning(progress.timer) && isFinished(progress.timer, Date.now())) {
      progress.timer = finishTimer(progress.timer);
      save();
    }
    const voiceOn = getVoice();
    const how = move.how.map((l) => `<li>${esc(l)}</li>`).join('');
    const amount = timed
      ? `<div class="timer" id="timer" role="timer" aria-live="off">${formatRemaining(
          remainingMs(progress.timer ?? newTimer(move.seconds ?? 0), Date.now())
        )}</div>
         <button type="button" class="btn btn-soft" id="timer-btn"></button>`
      : `<p class="reps" id="reps">${esc(move.reps ?? '')}</p>`;
    root.innerHTML = `
      <section class="workout">
        <div class="workout-top">
          <p class="progress-line" id="progress-line">Move ${progress.idx + 1} of ${program.moves.length}</p>
          <button type="button" class="voice-btn" id="voice-btn" aria-pressed="${voiceOn}"
            aria-label="Voice"></button>
        </div>
        <h1 class="move-name" id="move-name">${esc(move.name)}</h1>
        <ul class="how" id="how">${how}</ul>
        ${amount}
        <div class="actions">
          <button type="button" class="btn btn-main" id="done-btn">${esc(COPY.done)}</button>
          <div class="actions-row">
            <button type="button" class="btn btn-soft" id="skip-btn">${esc(COPY.skip)}</button>
            <button type="button" class="btn btn-soft" id="hurt-btn">${esc(COPY.hurts)}</button>
          </div>
        </div>
      </section>`;

    const voiceBtn = $<HTMLButtonElement>(root, '#voice-btn');
    const paintVoice = (): void => {
      const on = getVoice();
      voiceBtn.textContent = on ? '🔊' : '🔇';
      voiceBtn.setAttribute('aria-pressed', String(on));
    };
    paintVoice();
    voiceBtn.addEventListener('click', () => {
      setVoice(!getVoice());
      paintVoice();
      if (!getVoice()) stopSpeaking();
    });

    $(root, '#done-btn').addEventListener('click', () => advance('done'));
    $(root, '#skip-btn').addEventListener('click', () => {
      toast(COPY.skipped);
      advance('skipped');
    });
    $(root, '#hurt-btn').addEventListener('click', () => {
      toast(COPY.skipped);
      advance('hurt');
    });

    if (timed) wireTimer();
    if (speakIt && voiceOn) speak([move.name, move.how[0] ?? ''].join('. '));
  };

  const wireTimer = (): void => {
    const display = $(root, '#timer');
    const btn = $<HTMLButtonElement>(root, '#timer-btn');
    const paint = (): void => {
      const t = progress.timer;
      if (!t) return;
      const now = Date.now();
      const text = formatRemaining(remainingMs(t, now));
      if (display.textContent !== text) display.textContent = text;
      const over = isFinished(t, now);
      // Only touch the button when it changes: replacing its text every tick can eat a tap on iOS.
      const label = isRunning(t) ? 'Pause' : 'Start';
      if (btn.textContent !== label) btn.textContent = label;
      if (btn.disabled !== over) btn.disabled = over;
      display.classList.toggle('over', over);
    };
    btn.addEventListener('click', () => {
      const t = progress.timer;
      if (!t) return;
      unlockAudio();
      progress.timer = isRunning(t) ? pauseTimer(t, Date.now()) : startTimer(t, Date.now());
      save();
      paint();
    });
    paint();
    tick = window.setInterval(() => {
      const t = progress.timer;
      if (t && isRunning(t) && isFinished(t, Date.now())) {
        progress.timer = finishTimer(t);
        save();
        beep();
      }
      paint();
    }, 250);
  };

  show(opts.speakFirst);
}
