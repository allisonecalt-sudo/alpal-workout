// App shell: decides which screen to show. Screens live in screens/; every store call is in
// store.ts; everything kept on the phone is in storage.ts.
import { COPY } from './copy';
import { isValidCode, normaliseCode } from './code';
import { $, toast } from './dom';
import { keepAwake, releaseAwake, unlockAudio } from './device';
import { sameDay } from './clock';
import { endProgress, newProgress, type Progress } from './progress';
import { buildPayload, recordOfPayload } from './session';
import { enqueue, flushQueue, newClientId } from './queue';
import { buildExport, downloadText, exportFileName } from './export';
import { buildSteps, restSecondsOf, stoppedAtOf } from './steps';
import {
  getCode,
  clearPhone,
  getBeeps,
  getDoneToday,
  getGetReady,
  getRestOverride,
  getVoice,
  getProgress,
  getSafetySeen,
  getQueue,
  setCode,
  setProgress,
  setQueue,
  setSafetySeen,
  setDoneToday,
} from './storage';
import {
  StoreError,
  StoreLocked,
  getCachedGuest,
  guestLoad,
  guestSaveAnswer,
  guestSaveSession,
  guestUpdateNote,
  sendQueued,
} from './store';
import { sessionsThisWeek } from './program';
import { weeksToShow } from './stats';
import type { AnswerPayload, GuestData, Program, Question, SessionPayload, Workout } from './types';
import { isAnswer, isNoteEdit, isSession } from './types';
import { APP_VERSION, BUILD_SHORT } from './version';
import { thumbnailUrl, youtubeId } from './video';
import { renderAfter } from './screens/after';
import { renderBefore } from './screens/before';
import { leaveCooldown, renderCooldown } from './screens/cooldown';
import { renderHome } from './screens/home';
import { renderCantOpen, renderLoading, renderNotLoaded } from './screens/notloaded';
import { renderProgress } from './screens/progress';
import { renderQuestions } from './screens/questions';
import { renderReview } from './screens/review';
import { renderSessionDetail, renderSessionList, type ListedSession } from './screens/sessions';
import { closeSettingsSheets, renderSettings } from './screens/settings';
import { renderUnlock, showUnlockError } from './screens/unlock';
import { leaveWorkout, renderWorkout, type RunExit } from './screens/workout';

/** A workout untouched for this long is not resumed on its own. */
const STALE_WORKOUT_MS = 3 * 60 * 60 * 1000;

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
  setGear(true);
  if (href === null) {
    tell.hidden = true;
    tell.removeAttribute('href');
    return;
  }
  tell.textContent = COPY.tellButton;
  tell.href = href;
  tell.hidden = false;
}

/** The gear shows on Home-level screens, never in the middle of a workout. */
function setGear(visible: boolean): void {
  $<HTMLButtonElement>(document, '#settings-btn').hidden = !visible || data === null;
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
  return getQueue().filter(isSession);
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
  closeSettingsSheets();
  setGear(true);
  releaseAwake();
  const program = programOf();
  if (!data || !program) {
    renderNotLoaded(root);
    return;
  }
  const shown = notice === null ? undefined : { text: notice, tellHref: tellHref() };
  notice = null;
  const waitingSessions = queuedSessions();
  const left = leftOpenWorkout(program);
  const done = getDoneToday();
  const doneWorkout = done ? workoutOf(done.workoutId) : null;
  const doneCard =
    done && doneWorkout && sameDay(done.at, Date.now()) ? { name: doneWorkout.name } : null;
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
    leftOpen: left ? { name: left.name, startedAt: left.progress.startedAt } : null,
    onLeftOpenYes: () => left && saveLeftOpen(left.progress),
    onLeftOpenNo: () => {
      setProgress(null);
      showHome();
    },
    onLeftOpenKeep: () => {
      if (left) showStage(left.progress, true);
    },
    doneToday: doneCard,
    unsentSessions: waitingSessions.length,
    unsentAnswers: queuedAnswers().length,
    unsentNotes: getQueue().filter(isNoteEdit).length,
    notice: shown,
    onStart: startWorkout,
    onChoose: (id) => {
      chosenId = id;
      showHome();
    },
    onQuestions: showQuestions,
    onSessions: () => showSessions(0),
    onProgress: showProgress,
    onReview: () => showReview(program.week),
  });
}

function startWorkout(id: string): void {
  const program = programOf();
  if (!program || !workoutOf(id)) return;
  chosenId = null;
  const progress = newProgress(program.week, id, Date.now());
  setProgress(progress);
  showStage(progress, false);
}

/** What to do when the workout screens say they are done. */
function afterRun(progress: Progress, to: RunExit): void {
  if (to === 'home') {
    setProgress(null);
    showHome();
    return;
  }
  showStage(progress, false);
}

let stopTimeLine: (() => void) | null = null;

/** Draw the screen for where she is in the workout (Before, the moves, the cool-down, After). */
function showStage(progress: Progress, resumed: boolean): void {
  stopTimeLine?.();
  stopTimeLine = null;
  setGear(false);
  leaveWorkout();
  leaveCooldown();
  const program = programOf();
  const workout = workoutOf(progress.workoutId);
  if (!program || !workout) {
    setProgress(null);
    showHome();
    return;
  }
  if (progress.stage === 'before') {
    releaseAwake();
    stopTimeLine = renderBefore(root, {
      program,
      workout,
      before: progress.before,
      onChange: () => setProgress(progress),
      onStart: () => {
        unlockAudio();
        progress.startedAt = progress.before.startAt;
        progress.stage = 'run';
        setProgress(progress);
        showStage(progress, false);
      },
      onHome: () => {
        setProgress(null);
        showHome();
      },
    });
  } else if (progress.stage === 'run') {
    keepAwake();
    renderWorkout(root, {
      program,
      workout,
      progress,
      speakFirst: !resumed && progress.idx === 0 && progress.statuses.length === 0,
      resumed,
      onExit: (to) => afterRun(progress, to),
    });
  } else if (progress.stage === 'cooldown') {
    keepAwake();
    renderCooldown(root, {
      workout,
      progress,
      onBack: () => {
        const last = buildSteps(workout, progress.before.lite, progress.choices).length - 1;
        progress.stage = 'run';
        progress.idx = last;
        progress.statuses[last] = null;
        delete progress.holds[String(last)];
        setProgress(progress);
        showStage(progress, false);
      },
      onFinish: (how) => {
        if (how === 'stopped') {
          progress.stoppedAt = { part: 'cooldown', round: 1, move: null };
        } else progress.cooldownStatus = how;
        endProgress(progress, Date.now());
        setProgress(progress);
        showStage(progress, false);
      },
      onQuit: () => {
        setProgress(null);
        showHome();
      },
    });
  } else {
    releaseAwake();
    stopTimeLine = renderAfter(root, {
      program,
      workout,
      progress,
      weekCount:
        sessionsThisWeek([...(data?.sessions ?? []), ...queuedSessions()], program.week) + 1,
      onChange: () => setProgress(progress),
      onSave: () => saveSession(progress),
    });
  }
}

async function saveSession(progress: Progress): Promise<void> {
  const program = programOf();
  const workout = workoutOf(progress.workoutId);
  if (!program || !workout) {
    setProgress(null);
    showHome();
    return;
  }
  const session = buildPayload(progress, workout, progress.week, newClientId());
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
    data?.sessions.unshift(recordOfPayload(session));
  } else if (outcome === 'offline') {
    setQueue(enqueue(getQueue(), session));
    toast(COPY.savedLocal, 5000);
  } else {
    notice = COPY.saveRefused;
  }
  if (outcome !== 'refused') setDoneToday({ workoutId: workout.id, at: Date.now() });
  setProgress(null);
  showHome();
}

/** Saved sessions plus the ones still waiting to be sent, newest first. */
function listedSessions(): ListedSession[] {
  const edits = new Map(
    getQueue()
      .filter(isNoteEdit)
      .map((e) => [e.target, e.note])
  );
  const saved: ListedSession[] = (data?.sessions ?? []).map((r) => {
    const edited = r.client_id !== null ? edits.get(r.client_id) : undefined;
    return { record: edited === undefined ? r : { ...r, note: edited || null }, unsent: false };
  });
  const waiting: ListedSession[] = queuedSessions().map((p) => ({
    record: recordOfPayload(p),
    unsent: true,
  }));
  return [...waiting, ...saved].sort(
    (a, b) => Date.parse(b.record.done_at) - Date.parse(a.record.done_at)
  );
}

let listScroll = 0;

function showSessions(scroll: number): void {
  leaveWorkout();
  setGear(true);
  renderSessionList(root, {
    items: listedSessions(),
    program: programOf(),
    scrollTo: scroll,
    onBack: showHome,
    onOpen: (item) => {
      listScroll = window.scrollY;
      showSessionDetail(item, () => showSessions(listScroll));
    },
  });
}

function showSessionDetail(item: ListedSession, back: () => void): void {
  window.scrollTo(0, 0);
  renderSessionDetail(root, {
    item,
    program: programOf(),
    tellHref: tellHref(),
    onBack: back,
    onSaveNote: (note) => saveNote(item, note),
  });
}

/** Change a session's note: sent now, or kept on the phone and sent later. */
async function saveNote(item: ListedSession, note: string): Promise<'saved' | 'refused'> {
  const id = item.record.client_id;
  if (id === null) return 'refused';
  const value = note === '' ? null : note;
  const apply = (): void => {
    item.record.note = value;
    const saved = data?.sessions.find((r) => r.client_id === id);
    if (saved) saved.note = value;
  };
  if (item.unsent) {
    // still waiting to be sent: change the waiting copy itself
    setQueue(
      getQueue().map((q) => (isSession(q) && q.client_id === id ? { ...q, note: value } : q))
    );
    apply();
    return 'saved';
  }
  const keep = (): 'saved' => {
    const rest = getQueue().filter((q) => !(isNoteEdit(q) && q.target === id));
    setQueue([...rest, { client_id: `note-${newClientId()}`, target: id, note }]);
    apply();
    toast(COPY.savedLocal, 5000);
    return 'saved';
  };
  try {
    const res = await guestUpdateNote(code, id, note);
    if (res.ok) {
      apply();
      return 'saved';
    }
    return res.reason === 'locked' ? keep() : 'refused';
  } catch {
    return keep();
  }
}

function showReview(week: number): void {
  leaveWorkout();
  const program = programOf();
  if (!program || !data) return;
  setGear(true);
  const items = listedSessions();
  renderReview(root, {
    weeks: weeksToShow(
      data.weeks,
      program,
      items.map((i) => i.record)
    ),
    startWeek: week,
    program,
    items,
    onBack: showHome,
    onOpen: (item, shown) => showSessionDetail(item, () => showReview(shown)),
  });
}

function showProgress(): void {
  leaveWorkout();
  const program = programOf();
  if (!program || !data) return;
  setGear(true);
  const all = listedSessions().map((i) => i.record);
  renderProgress(root, {
    all,
    program,
    weeks: weeksToShow(data.weeks, program, all),
    next: data.next,
    onBack: showHome,
    onWeek: showReview,
  });
}

function showSettings(): void {
  leaveWorkout();
  const program = programOf();
  const first = program?.workouts[0];
  renderSettings(root, {
    planRest: program && first ? restSecondsOf(first, program) : 0,
    version: `${APP_VERSION} · ${BUILD_SHORT}`,
    unsent: getQueue().length,
    onExport: () => {
      if (!data) return;
      const now = Date.now();
      downloadText(
        exportFileName(now),
        buildExport(
          data,
          getQueue(),
          {
            voice: getVoice(),
            beeps: getBeeps(),
            restSeconds: getRestOverride(),
            getReadySeconds: getGetReady(),
          },
          APP_VERSION,
          now
        )
      );
    },
    onChangeCode: () => {
      clearPhone();
      code = '';
      chosenId = null;
      lockedLine = false;
      showUnlock();
    },
    onBack: showHome,
  });
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

/** A workout left open for hours (not on the Before screen): offered back, never silently dropped. */
function leftOpenWorkout(program: Program): { progress: Progress; name: string } | null {
  const progress = getProgress();
  if (!progress || progress.week !== program.week || progress.stage === 'before') return null;
  if (Date.now() - progress.lastActiveAt < STALE_WORKOUT_MS) return null;
  const workout = workoutOf(progress.workoutId);
  return workout ? { progress, name: workout.name } : null;
}

/** "Yes, save it": on to After with the times filled in from when she was last active. */
function saveLeftOpen(progress: Progress): void {
  const workout = workoutOf(progress.workoutId);
  if (!workout) return;
  if (progress.stage === 'run') {
    const steps = buildSteps(workout, progress.before.lite, progress.choices);
    progress.stoppedAt = stoppedAtOf(
      steps,
      progress.idx,
      progress.between,
      progress.rest !== null,
      false
    );
  } else if (progress.stage === 'cooldown') {
    progress.stoppedAt = { part: 'cooldown', round: 1, move: null };
  }
  if (progress.stage !== 'after') {
    endProgress(progress, progress.lastActiveAt);
    progress.endedAt = progress.lastActiveAt;
  }
  setProgress(progress);
  showStage(progress, true);
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
    if (Date.now() - progress.lastActiveAt < STALE_WORKOUT_MS) return showStage(progress, true);
    // left open for hours: Home asks what to do (the Before screen is simply forgotten)
    if (progress.stage === 'before') setProgress(null);
  } else if (progress && progress.week !== program.week) {
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
  precachePictures();
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

/** Ask the offline worker to keep this program's pictures. Best effort. */
function precachePictures(): void {
  const program = programOf();
  if (!program || !('serviceWorker' in navigator)) return;
  const urls = new Set<string>();
  for (const w of program.workouts) {
    for (const m of [...w.warmup, ...w.main, ...w.cooldown]) {
      m.images?.forEach((u) => urls.add(u));
      const id = m.video !== undefined ? youtubeId(m.video) : null;
      if (id !== null && !m.images?.length) urls.add(thumbnailUrl(id));
    }
  }
  if (urls.size === 0) return;
  void navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: 'cache-images', urls: [...urls] }))
    .catch(() => undefined);
}

$<HTMLButtonElement>(document, '#settings-btn').addEventListener('click', () => {
  if (data) showSettings();
});

void boot();
