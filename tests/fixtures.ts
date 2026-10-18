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

export interface FakeGuest {
  name: string;
  tell_whatsapp: string | null;
  program: FakeProgram | null;
  sessions: { done_at: string; week: number; feel: string | null; check_0_10: number | null }[];
}

export function makeGuest(over: Partial<FakeGuest> = {}): FakeGuest {
  return {
    name: 'Test User',
    tell_whatsapp: PHONE,
    program: makeProgram(),
    sessions: [{ done_at: '2026-10-12T08:00:00Z', week: 1, feel: 'right', check_0_10: 2 }],
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
  /** Every request that reached the stub, to check method and URL. */
  requests: { method: string; url: string; headers: Record<string, string> }[] = [];
  /** What a save answers with; null means the normal answer. */
  saveReply: unknown = null;
}

async function handle(net: Net, req: Request, fulfill: (b: unknown) => Promise<void>) {
  const url = new URL(req.url());
  const body = req.postData() ? JSON.parse(req.postData() as string) : {};
  if (url.pathname.endsWith('/rest/v1/rpc/guest_load')) {
    net.loads.push(body.p_code);
    return fulfill(body.p_code === net.code ? net.guest : null);
  }
  if (url.pathname.endsWith('/rest/v1/rpc/guest_save_session')) {
    net.saves.push(body);
    if (net.saveReply) return fulfill(net.saveReply);
    if (body.p_code !== net.code) return fulfill({ ok: false, reason: 'bad_code' });
    net.stored.add(String(body.p_session.client_id));
    return fulfill({ ok: true });
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
      if (!req.url().includes('supabase.co/rest/v1/rpc/')) {
        net.unexpected.push(`${req.method()} ${req.url()}`);
        return route.abort('failed');
      }
      net.requests.push({ method: req.method(), url: req.url(), headers: req.headers() });
      if (!net.online) return route.abort('failed');
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
    w.__osc = 0;
    w.__spoken = [] as string[];
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
        return {
          type: '',
          frequency: { value: 0 },
          connect: (x: unknown) => x,
          start() {},
          stop() {},
        };
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
        cancel() {},
      },
    });
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
export async function runWorkout(page: Page): Promise<void> {
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.getByRole('heading', { name: 'Done! 🎉' })).toBeVisible();
}
