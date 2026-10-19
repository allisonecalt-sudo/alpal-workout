// Test helpers. Every request to the store is stubbed here; anything else that is not the
// local server is aborted and fails the test, so nothing can reach the network.
import { expect, test as base, type Page, type Request } from '@playwright/test';

export const CODE = 'A0B11C2D';
export const PHONE = '+1 555 010 0000';

export interface FakeProgram {
  week: number;
  label: string;
  minutes: number;
  sessionsPerWeek: number;
  restSeconds: number;
  moves: { name: string; how: string[]; reps?: string; seconds?: number }[];
  checkLabel?: string;
}

export function makeProgram(over: Partial<FakeProgram> = {}): FakeProgram {
  return {
    week: 1,
    label: 'Week 1',
    minutes: 8,
    sessionsPerWeek: 3,
    restSeconds: 0,
    moves: [
      { name: 'Move one', how: ['Line one', 'Line two'], reps: '8 times' },
      { name: 'Move two', how: ['Hold steady'], seconds: 30 },
      { name: 'Move three', how: ['Go slowly'], reps: '5 each side' },
    ],
    ...over,
  };
}

export interface FakeQuestion {
  id: string;
  section: string;
  text: string;
}

export const QUESTIONS: FakeQuestion[] = [
  { id: 'q1', section: 'Section one', text: 'Question one?' },
  { id: 'q2', section: 'Section one', text: 'Question two?' },
  { id: 'q3', section: 'Section two', text: 'Question three?' },
];

type FakeMove = {
  name: string;
  how: string[];
  reps?: string;
  seconds?: number;
  video?: string;
  why?: string;
  tips?: string[];
  watchOut?: string[];
};

/** Several workouts with rounds. A: 2 warm-up, 2 main x 2 rounds, 1 cool-down. */
export function makeRoundsProgram(over: Record<string, unknown> = {}): Record<string, unknown> {
  const main = (n: string): FakeMove[] => [
    { name: n + ' one', how: ['Steady'], reps: '8 times' },
    { name: n + ' two', how: ['Hold it'], reps: '5 each side' },
  ];
  return {
    week: 1,
    label: 'Week 1',
    sessionsPerWeek: 3,
    restSeconds: 0,
    workouts: [
      {
        id: 'A',
        name: 'Workout A',
        minutes: 30,
        warmup: [
          {
            name: 'Warm one',
            how: ['Easy start'],
            reps: '5 times',
            video: 'https://youtu.be/abcdefghijk',
            why: 'A reason',
            tips: ['Tip one', 'Tip two'],
            watchOut: ['Careful one'],
          },
          { name: 'Warm two', how: ['Loosen up'], seconds: 20 },
        ],
        main: main('Main'),
        rounds: 2,
        cooldown: [{ name: 'Cool one', how: ['Slow down'], reps: '3 times' }],
      },
      { id: 'B', name: 'Workout B', minutes: 25, main: main('Bee'), rounds: 1 },
      { id: 'C', name: 'Workout C', minutes: 20, main: main('Sea'), rounds: 3 },
    ],
    ...over,
  };
}

/** One workout with a hold (6 s) and a rep move, one round: quick to run end to end. */
export function makeHoldProgram(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    week: 1,
    label: 'Week 1',
    sessionsPerWeek: 3,
    restSeconds: 0,
    workouts: [
      {
        id: 'A',
        name: 'Workout A',
        minutes: 10,
        main: [
          { name: 'Hold one', how: ['Steady'], seconds: 6 },
          { name: 'Move two', how: ['Easy'], reps: '5 times' },
        ],
        rounds: 1,
      },
    ],
    ...over,
  };
}

/** Give every workout in a program a rest between main moves. */
export function withRest(
  program: Record<string, unknown>,
  seconds: number
): Record<string, unknown> {
  for (const w of program.workouts as Record<string, unknown>[]) w.restSeconds = seconds;
  return program;
}

export interface FakeSession {
  client_id?: string;
  done_at: string;
  started_at?: string | null;
  duration_sec?: number | null;
  lite?: boolean;
  readings?: Record<string, unknown>;
  moves?: { name: string; part: string; round: number; status: string; option?: string }[];
  note?: string | null;
  week: number;
  workout?: string | null;
  feel: string | null;
  check_0_10: number | null;
}

export interface FakeGuest {
  name: string;
  tell_whatsapp: string | null;
  program: FakeProgram | Record<string, unknown> | null;
  sessions: FakeSession[];
  questions: FakeQuestion[];
  answered: number;
  /** Every program week as the store lists it. */
  weeks?: unknown[];
  /** The week after the active one (its program data). */
  next?: unknown;
  /** Her last notes to Allison, as the store lists them. */
  messages?: unknown[];
}

export function makeGuest(over: Partial<FakeGuest> = {}): FakeGuest {
  return {
    name: 'Test User',
    tell_whatsapp: PHONE,
    program: makeProgram(),
    sessions: [{ done_at: '2026-10-12T08:00:00Z', week: 1, feel: 'right', check_0_10: 2 }],
    questions: [],
    answered: 0,
    ...over,
  };
}

export interface SaveCall {
  p_code: string;
  p_session: Record<string, unknown>;
}

export class Net {
  guest: FakeGuest | null = makeGuest();
  /** The code the fake store accepts. */
  code = CODE;
  online = true;
  loads: string[] = [];
  saves: SaveCall[] = [];
  /** client_ids the fake store already holds (it ignores repeats, like the real one). */
  stored = new Set<string>();
  unexpected: string[] = [];
  /** Answers that reached the stub. */
  answers: { p_code: string; p_answer: Record<string, unknown> }[] = [];
  /** What an answer replies with; null means the normal answer. */
  answerReply: unknown = null;
  /** Video player pages that were requested (the stub answers them with an empty page). */
  frames: string[] = [];
  /** Note edits that reached the stub. */
  notes: { p_code: string; p_client_id: string; p_note: string }[] = [];
  /** What a note edit replies with; null means the normal answer. */
  noteReply: unknown = null;
  /** Video preview pictures that were requested. */
  thumbs: string[] = [];
  /** Make a save answer slowly (milliseconds). */
  saveDelayMs = 0;
  /** Make answer requests fail as if offline, while sessions still work. */
  failAnswers = false;
  /** When set, guest_load answers with this instead (e.g. the throttle's locked reply). */
  loadReply: unknown = undefined;
  /** Every request that reached the stub, to check method and URL. */
  requests: { method: string; url: string; headers: Record<string, string> }[] = [];
  /** What a save answers with; null means the normal answer. */
  saveReply: unknown = null;
  /** Notes to Allison that reached the stub (the whole request body). */
  messages: { url: string; body: { p_code: string; p_msg: Record<string, unknown> } }[] = [];
  /** What a note save replies with; null means the normal answer. */
  messageReply: unknown = null;
  /** Spoken-explanation requests that reached the stub. */
  audioCalls: { url: string; body: { p_code: string; p_name: string } }[] = [];
  /** What the store says about a move's audio, by move name (default: it has some). */
  audioMode: Record<string, 'ok' | 'missing' | 'locked'> = {};
  /** Make a spoken-explanation request answer slowly (milliseconds). */
  audioDelayMs = 0;
}

async function handle(net: Net, req: Request, fulfill: (b: unknown) => Promise<void>) {
  const url = new URL(req.url());
  const body = req.postData() ? JSON.parse(req.postData() as string) : {};
  if (url.pathname.endsWith('/rest/v1/rpc/guest_load')) {
    net.loads.push(body.p_code);
    if (net.loadReply !== undefined) return fulfill(net.loadReply);
    return fulfill(body.p_code === net.code ? net.guest : null);
  }
  if (url.pathname.endsWith('/rest/v1/rpc/guest_save_session')) {
    net.saves.push(body);
    if (net.saveDelayMs) await new Promise((r) => setTimeout(r, net.saveDelayMs));
    if (net.saveReply) return fulfill(net.saveReply);
    if (body.p_code !== net.code) return fulfill({ ok: false, reason: 'bad_code' });
    net.stored.add(String(body.p_session.client_id));
    return fulfill({ ok: true });
  }
  if (url.pathname.endsWith('/rest/v1/rpc/guest_update_note')) {
    net.notes.push(body);
    if (net.noteReply) return fulfill(net.noteReply);
    return fulfill(body.p_code === net.code ? { ok: true } : { ok: false, reason: 'bad code' });
  }
  if (url.pathname.endsWith('/rest/v1/rpc/guest_get_audio')) {
    net.audioCalls.push({ url: req.url(), body });
    if (net.audioDelayMs) await new Promise((r) => setTimeout(r, net.audioDelayMs));
    const mode = net.audioMode[body.p_name] ?? 'ok';
    if (mode === 'missing') return fulfill({ missing: true });
    if (mode === 'locked') return fulfill({ locked: true });
    return fulfill({
      mime: 'audio/mpeg',
      b64: Buffer.from('fake mp3 ' + body.p_name).toString('base64'),
    });
  }
  if (url.pathname.endsWith('/rest/v1/rpc/guest_save_message')) {
    net.messages.push({ url: req.url(), body });
    if (net.messageReply) return fulfill(net.messageReply);
    return fulfill(body.p_code === net.code ? { ok: true } : { ok: false, reason: 'bad code' });
  }
  if (url.pathname.endsWith('/rest/v1/rpc/guest_save_answer')) {
    net.answers.push(body);
    if (net.answerReply) return fulfill(net.answerReply);
    return fulfill(body.p_code === net.code ? { ok: true } : { ok: false, reason: 'bad code' });
  }
  net.unexpected.push(`${req.method()} ${req.url()}`);
  return fulfill(null);
}

export async function installNet(page: Page, net: Net): Promise<void> {
  await page.route(
    (u) => u.hostname !== 'localhost' && u.hostname !== '127.0.0.1',
    async (route) => {
      const req = route.request();
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
      };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (new URL(req.url()).hostname === 'i.ytimg.com') {
        net.thumbs.push(req.url());
        // a 1x1 picture
        return route.fulfill({
          status: 200,
          contentType: 'image/gif',
          body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
        });
      }
      if (new URL(req.url()).hostname === 'www.youtube-nocookie.com') {
        net.frames.push(req.url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' });
      }
      if (!req.url().includes('supabase.co/rest/v1/rpc/')) {
        net.unexpected.push(`${req.method()} ${req.url()}`);
        return route.abort('failed');
      }
      net.requests.push({ method: req.method(), url: req.url(), headers: req.headers() });
      if (!net.online) return route.abort('failed');
      if (net.failAnswers && req.url().includes('guest_save_answer')) return route.abort('failed');
      await handle(net, req, (b) =>
        route.fulfill({
          status: 200,
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify(b),
        })
      );
    }
  );
}

/** Stand-ins for audio, voice and keep-awake, with counters the tests can read. */
export async function installDevices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    // first-time tips are off by default so they never get in the way; tips.spec.ts turns them on
    try {
      if (!sessionStorage.getItem('__tipsdefault')) {
        sessionStorage.setItem('__tipsdefault', '1');
        localStorage.setItem('aw.tips', 'off');
      }
    } catch {
      /* no storage */
    }
    w.__osc = 0;
    w.__tones = [] as number[];
    w.__spoken = [] as string[];
    w.__cancels = 0;
    w.__locks = 0;
    w.__persist = 0;
    Object.defineProperty(StorageManager.prototype, 'persist', {
      configurable: true,
      value: async () => {
        (w.__persist as number)++;
        return true;
      },
    });
    class FakeCtx {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume() {}
      createOscillator() {
        (w.__osc as number)++;
        const osc = {
          type: '',
          frequency: { value: 0 },
          connect: (x: unknown) => x,
          start() {
            (w.__tones as number[]).push(osc.frequency.value);
          },
          stop() {},
        };
        return osc;
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect: (x: unknown) => x,
        };
      }
    }
    w.AudioContext = FakeCtx;
    w.SpeechSynthesisUtterance = function (this: { text: string }, t: string) {
      this.text = t;
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u: { text: string }) => (w.__spoken as string[]).push(u.text),
        cancel: () => (w.__cancels as number)++,
      },
    });
    // a microphone that can record (the headless browsers have none)
    const mic = {
      opened: 0,
      stopped: 0,
      mp4: false,
      deny: false,
      recorders: 0,
      empty: false,
      // While a gate is up, getUserMedia waits for the test to let it through (no timers).
      gate: null as Promise<void> | null,
      open: () => {},
      hold() {
        mic.gate = new Promise<void>((resolve) => {
          mic.open = () => {
            mic.gate = null;
            resolve();
          };
        });
      },
    };
    w.__mic = mic;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (mic.gate) await mic.gate;
          if (mic.deny) throw new DOMException('denied', 'NotAllowedError');
          mic.opened++;
          return { getTracks: () => [{ stop: () => mic.stopped++ }] };
        },
      },
    });
    class FakeRecorder {
      static isTypeSupported(t: string) {
        return t === 'audio/webm' || (mic.mp4 && t === 'audio/mp4');
      }
      state = 'inactive';
      mimeType: string;
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_s: unknown, o?: { mimeType?: string }) {
        this.mimeType = o?.mimeType ?? 'audio/webm';
        mic.recorders++;
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        setTimeout(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array(mic.empty ? [] : [1, 2, 3, 4, 5, 6])]),
          });
          this.onstop?.();
        }, 0);
      }
    }
    w.MediaRecorder = FakeRecorder;
    // audio playback: the headless browsers cannot decode our fake bytes, so play/pause are faked
    const audio = {
      plays: [] as string[],
      el: null as HTMLMediaElement | null,
      pauses: 0,
      rejectReal: false,
    };
    w.__audio = audio;
    const proto = HTMLMediaElement.prototype;
    const define = (name: string, desc: PropertyDescriptor) =>
      Object.defineProperty(proto, name, { configurable: true, ...desc });
    define('paused', {
      get: function (this: { __on?: boolean }) {
        return !this.__on;
      },
    });
    define('duration', { get: () => 38 });
    define('currentTime', {
      get: function (this: { __t?: number }) {
        return this.__t ?? 0;
      },
      set: function (this: { __t?: number }, v: number) {
        this.__t = v;
      },
    });
    define('play', {
      value: function (this: HTMLMediaElement & { __on?: boolean }) {
        if (audio.rejectReal && this.src.startsWith('blob:')) {
          audio.rejectReal = false; // a phone that wants one more tap
          return Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
        }
        this.__on = true;
        audio.el = this;
        audio.plays.push(this.src);
        this.dispatchEvent(new Event('loadedmetadata'));
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      },
    });
    define('pause', {
      value: function (this: HTMLMediaElement & { __on?: boolean }) {
        if (!this.__on) return;
        this.__on = false;
        audio.pauses++;
        this.dispatchEvent(new Event('pause'));
      },
    });
    // like a real element, a new src stops what was playing
    const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
    if (srcDesc?.get && srcDesc.set) {
      define('src', {
        get: function (this: HTMLMediaElement) {
          return (srcDesc.get as () => string).call(this);
        },
        set: function (this: HTMLMediaElement & { __on?: boolean }, v: string) {
          this.__on = false;
          (srcDesc.set as (v: string) => void).call(this, v);
        },
      });
    }
    define('load', { value: function () {} });
    w.__advance = (sec: number) => {
      const el = audio.el as (HTMLMediaElement & { __t?: number }) | null;
      if (!el) return;
      el.__t = Math.min(38, (el.__t ?? 0) + sec);
      el.dispatchEvent(new Event('timeupdate'));
      if (el.__t >= 38) el.dispatchEvent(new Event('ended'));
    };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          (w.__locks as number)++;
          return { addEventListener() {}, release: async () => {} };
        },
      },
    });
  });
}

export const test = base.extend<{ net: Net }>({
  net: [
    async ({ page }, use) => {
      const net = new Net();
      await installNet(page, net);
      await installDevices(page);
      await use(net);
      expect(net.unexpected, 'a request left the app other than the two store functions').toEqual(
        []
      );
    },
    { auto: true },
  ],
});

export { expect };

/** Open the app already unlocked. */
export async function openUnlocked(page: Page): Promise<void> {
  await page.addInitScript((code) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem('aw.code', code);
      sessionStorage.setItem('__seeded', '1');
    }
  }, CODE);
  await page.goto('/');
}

/** Home, tap Start, go through all three moves with Done. */
export async function startWorkout(page: Page): Promise<void> {
  await page.locator('#start-btn').click();
  await page.locator('#before-start').click();
}

export async function runWorkout(page: Page): Promise<void> {
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#after-title')).toBeVisible();
}

/** Stop a recording after a believable moment (a note under half a second counts as a slip). */
export async function stopRecording(page: Page): Promise<void> {
  await page.waitForTimeout(650);
  await page.locator('#rec-stop').click();
}
