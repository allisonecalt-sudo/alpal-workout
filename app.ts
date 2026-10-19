// App shell: decides which screen to show. Screens live in screens/; every store call is in
// store.ts; everything kept on the phone is in storage.ts.
import { COPY } from './copy';
import { isValidCode, normaliseCode } from './code';
import { $, toast } from './dom';
import { keepAwake, releaseAwake, unlockAudio } from './device';
import { enqueue, flushQueue, newClientId } from './queue';
import { buildSteps, movesLog } from './steps';
import {
  getCode,
  getProgress,
  getSafetySeen,
  getQueue,
  setCode,
  setProgress,
  setQueue,
  setSafetySeen,
  type Progress,
} from './storage';
import {
  StoreError,
  StoreLocked,
  getCachedGuest,
  guestLoad,
  guestSaveAnswer,
  guestSaveSession,
  sendQueued,
} from './store';
import type { AnswerPayload, GuestData, Program, Question, SessionPayload, Workout } from './types';
import { isAnswer } from './types';
import { APP_VERSION, BUILD_SHORT } from './version';
import { renderAfter, type AfterAnswers } from './screens/after';
import { renderHome } from './screens/home';
import { renderCantOpen, renderLoading, renderNotLoaded } from './screens/notloaded';
import { renderQuestions } from './screens/questions';
import { renderUnlock, showUnlockError } from './screens/unlock';
import { leaveWorkout, renderWorkout } from './screens/workout';

const STALE_WORKOUT_MS = 12 * 60 * 60 * 1000;

const root = $(document, '#app');
let code = '';
let data: GuestData | null = null;
let flushing = false;
/** What she did with the safety card this visit; redraws keep it. */
let safetyChoice: { week: number; open: boolean } | null = null;
/** The store is throttling but a saved copy is shown: one quiet line says so. */
let lockedLine = false;
/** Shown once on the next Home, then cleared. */
let notice: string | null = null;
/** The workout she picked from the chips (null = the Up next one). */
let chosenId: string | null = null;

function tellHref(): string | null {
  const digits = (data?.tellWhatsapp ?? '').replace(/\D/g, '');
  return digits === ''
    ? null
    : `https://wa.me/${digits}?text=${encodeURIComponent(COPY.tellPrefill)}`;
}

function setHeader(): void {
  // her rule: the version tag carries the build date and time too
  $(document, '#app-version').textContent = `${APP_VERSION} · ${BUILD_SHORT}`;
  const tell = $<HTMLAnchorElement>(document, '#tell');
  const href = tellHref();
  if (href === null) {
    tell.hidden = true;
    tell.removeAttribute('href');
    return;
  }
  tell.textContent = COPY.tellButton;
  tell.href = href;
  tell.hidden = false;
}

function showUnlock(error?: string): void {
  leaveWorkout();
  data = null;
  setHeader();
  renderUnlock(root, {
    error,
    onSubmit: async (raw) => {
      const norm = normaliseCode(raw);
      if (!isValidCode(norm)) {
        showUnlockError(root, COPY.unlockWrong);
        return;
      }
      showUnlockError(root, '');
      try {
        const loaded = await guestLoad(norm);
        if (loaded === null) {
          showUnlockError(root, COPY.unlockWrong);
          return;
        }
        code = norm;
        setCode(norm);
        void keepStorage();
        data = loaded;
        setHeader();
        route(false);
        void flush();
      } catch (e) {
        if (e instanceof StoreLocked) showUnlockError(root, COPY.unlockLocked);
        else if (e instanceof StoreError) showUnlockError(root, COPY.unlockOffline);
        else throw e;
      }
    },
  });
}

function programOf(): Program | null {
  return data?.program ?? null;
}

function workoutOf(id: string): Workout | null {
  return programOf()?.workouts.find((w) => w.id === id) ?? null;
}

function queuedSessions(): SessionPayload[] {
  return getQueue().filter((q): q is SessionPayload => !isAnswer(q));
}

function queuedAnswers(): AnswerPayload[] {
  return getQueue().filter(isAnswer);
}

/** Questions still to answer: not already waiting in the queue. */
function openQuestions(): Question[] {
  const waiting = new Set(queuedAnswers().map((a) => a.question_id));
  return (data?.questions ?? []).filter((q) => !waiting.has(q.id));
}

/** Open the first time she sees it this program week, closed after that. */
function safetyOpen(week: number): boolean {
  if (safetyChoice?.week === week) return safetyChoice.open; // her hand wins for the visit
  if (getSafetySeen(week)) return false;
  setSafetySeen(week);
  safetyChoice = { week, open: true };
  return true;
}

function showHome(): void {
  leaveWorkout();
  releaseAwake();
  const program = programOf();
  if (!data || !program) {
    renderNotLoaded(root);
    return;
  }
  const shown = notice === null ? undefined : { text: notice, tellHref: tellHref() };
  notice = null;
  const waitingSessions = queuedSessions();
  renderHome(root, {
    data,
    program,
    sessions: [...data.sessions, ...waitingSessions],
    chosenId,
    questionsLeft: openQuestions().length,
    safetyOpen: program.safety ? safetyOpen(program.week) : false,
    onSafetyToggle: (open) => {
      safetyChoice = { week: program.week, open };
    },
    offlineLine: lockedLine ? COPY.lockedOffline : null,
    unsentSessions: waitingSessions.length,
    unsentAnswers: queuedAnswers().length,
    notice: shown,
    onStart: startWorkout,
    onChoose: (id) => {
      chosenId = id;
      showHome();
    },
    onQuestions: showQuestions,
  });
}

function startWorkout(id: string): void {
  const program = programOf();
  if (!program || !workoutOf(id)) return;
  unlockAudio();
  chosenId = null;
  const progress: Progress = {
    week: program.week,
    workoutId: id,
    startedAt: Date.now(),
    idx: 0,
    statuses: [],
    between: false,
    timer: null,
    finished: false,
  };
  setProgress(progress);
  showWorkout(progress, true);
}

function showWorkout(progress: Progress, speakFirst: boolean): void {
  const workout = workoutOf(progress.workoutId);
  if (!workout) {
    setProgress(null);
    showHome();
    return;
  }
  keepAwake();
  renderWorkout(root, {
    workout,
    progress,
    speakFirst,
    onFinished: () => showAfter(),
  });
}

function showAfter(): void {
  const program = programOf();
  if (!program) return;
  releaseAwake();
  renderAfter(root, { program, onSave: (answers) => saveSession(program, answers) });
}

async function saveSession(program: Program, answers: AfterAnswers): Promise<void> {
  const progress = getProgress();
  const workout = progress ? workoutOf(progress.workoutId) : null;
  if (!progress || !workout) {
    setProgress(null);
    showHome();
    return;
  }
  const session: SessionPayload = {
    client_id: newClientId(),
    done_at: new Date().toISOString(),
    week: program.week,
    workout: workout.id,
    moves: movesLog(buildSteps(workout), progress.statuses),
    feel: answers.feel,
    check_0_10: answers.check,
    note: answers.note,
  };
  // 'sent' = the store took it; 'refused' = it answered ok:false; 'offline' = no answer.
  // A "locked" reply (the throttle) is not a refusal: it waits in the queue and retries.
  let outcome: 'sent' | 'refused' | 'offline' = 'offline';
  try {
    const res = await guestSaveSession(code, session);
    outcome = res.ok ? 'sent' : res.reason === 'locked' ? 'offline' : 'refused';
  } catch {
    outcome = 'offline';
  }
  if (outcome === 'sent') {
    data?.sessions.unshift({
      done_at: session.done_at,
      week: session.week,
      workout: session.workout,
      feel: session.feel,
      check_0_10: session.check_0_10,
    });
  } else if (outcome === 'offline') {
    setQueue(enqueue(getQueue(), session));
    toast(COPY.savedLocal, 5000);
  } else {
    notice = COPY.saveRefused;
  }
  setProgress(null);
  showHome();
}

function showQuestions(): void {
  leaveWorkout();
  renderQuestions(root, {
    questions: openQuestions(),
    tellHref: tellHref(),
    save: saveAnswer,
    onDone: showHome,
  });
}

async function saveAnswer(q: Question, answer: string): Promise<'saved' | 'refused'> {
  const payload: AnswerPayload = { client_id: newClientId(), question_id: q.id, answer };
  try {
    const res = await guestSaveAnswer(code, payload);
    if (!res.ok && res.reason === 'locked') throw new StoreError('locked'); // wait and retry
    if (!res.ok) return 'refused'; // not queued: retrying cannot help
    if (data) {
      data.questions = data.questions.filter((x) => x.id !== q.id);
      data.answered += 1;
    }
    return 'saved';
  } catch {
    setQueue(enqueue(getQueue(), payload));
    toast(COPY.savedLocal, 5000);
    return 'saved';
  }
}

/**
 * Send anything saved on the phone while offline. Runs on every app open and when the phone
 * comes back online. One flush at a time; a request that arrives mid-flush is covered because
 * the loop re-reads the queue until nothing untried is left.
 */
async function flush(): Promise<void> {
  if (flushing || getQueue().length === 0) return;
  flushing = true;
  try {
    const { sent, dropped } = await flushQueue(getQueue, setQueue, (item) =>
      sendQueued(code, item)
    );
    if (dropped > 0) notice = COPY.saveRefused;
    if (sent > 0 || dropped > 0) {
      const fresh = await guestLoad(code).catch(() => null);
      if (fresh) {
        data = fresh;
        lockedLine = false;
      }
      if (root.querySelector('.home')) showHome();
    }
  } finally {
    flushing = false;
  }
}

/** Open on the right screen: a workout in progress comes back where it was. */
function route(resume: boolean): void {
  const program = programOf();
  if (!data || !program) {
    renderNotLoaded(root);
    return;
  }
  const progress = getProgress();
  if (progress && progress.week === program.week && resume) {
    if (progress.finished) return showAfter();
    if (Date.now() - progress.startedAt < STALE_WORKOUT_MS) return showWorkout(progress, false);
    setProgress(null);
  }
  showHome();
}

async function boot(): Promise<void> {
  setHeader();
  registerWorker();
  const saved = getCode();
  if (saved === null) {
    showUnlock();
    return;
  }
  code = saved;
  renderLoading(root);
  try {
    data = await guestLoad(code);
  } catch (e) {
    data = null;
    setHeader();
    if (e instanceof StoreLocked) {
      // throttled: keep the saved code. With a saved copy, show it (saves still queue).
      const cached = getCachedGuest(code);
      if (cached) {
        data = cached;
        lockedLine = true;
        setHeader();
        route(true);
        void flush();
        return;
      }
      renderCantOpen(root, () => void boot());
    } else renderNotLoaded(root);
    return;
  }
  if (data === null) {
    setCode(null);
    showUnlock(COPY.unlockWrong);
    return;
  }
  setHeader();
  route(true);
  void flush();
}

/** Ask the browser not to clear the phone's saved copy and queue. Ignored if unsupported. */
async function keepStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* unsupported */
  }
}

function registerWorker(): void {
  try {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js');
  } catch {
    /* offline shell is a bonus */
  }
}

// Coming back online retries the queue too, not only opening the app.
window.addEventListener('online', () => {
  if (code !== '') void flush();
});

void boot();
