import type { Page } from '@playwright/test';
import {
  CODE,
  QUESTIONS,
  expect,
  makeGuest,
  makeHoldProgram,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  withRest,
  type Net,
} from './fixtures';

function setup(net: Net, rest = 0): void {
  const program = makeRoundsProgram();
  if (rest > 0) withRest(program, rest);
  net.guest = makeGuest({
    program,
    sessions: [],
    questions: QUESTIONS.slice(0, 2),
  });
}

const done = (page: Page, n = 1) =>
  (async () => {
    for (let k = 0; k < n; k++) await page.locator('#done-btn').click();
  })();

/** Every screen the spec lists, and how to get to it. */
const SCREENS: { name: string; rest?: number; go: (page: Page, net: Net) => Promise<void> }[] = [
  { name: 'Home', go: async () => undefined },
  {
    name: 'not loaded',
    go: async (page, net) => {
      net.guest = makeGuest({ program: null, questions: QUESTIONS.slice(0, 1) });
      await page.reload();
      await expect(page.locator('#not-loaded')).toBeVisible();
    },
  },
  {
    name: 'Before',
    go: async (page) => {
      await page.locator('#start-btn').click();
      await expect(page.locator('#before-start')).toBeVisible();
    },
  },
  {
    name: 'a move',
    go: async (page) => {
      await startWorkout(page);
      await expect(page.locator('#move-name')).toBeVisible();
    },
  },
  {
    name: 'rest',
    rest: 30,
    go: async (page) => {
      await startWorkout(page);
      await done(page, 3);
      await expect(page.locator('#rest-screen')).toBeVisible();
    },
  },
  {
    name: 'between rounds',
    go: async (page) => {
      await startWorkout(page);
      await done(page, 4);
      await expect(page.locator('#between-title')).toBeVisible();
    },
  },
  {
    name: 'Paused',
    go: async (page) => {
      await startWorkout(page);
      await page.getByRole('button', { name: 'Pause workout' }).click();
      await expect(page.locator('#paused-overlay')).toBeVisible();
    },
  },
  {
    name: 'the Exit sheet',
    go: async (page) => {
      await startWorkout(page);
      await page.locator('#exit-btn').click();
      await expect(page.locator('#exit-sheet')).toBeVisible();
    },
  },
  {
    name: 'cool-down',
    go: async (page) => {
      await startWorkout(page);
      await done(page, 4);
      await page.locator('#next-round-btn').click();
      await done(page, 2);
      await expect(page.locator('#cooldown')).toBeVisible();
    },
  },
  {
    name: 'After',
    go: async (page) => {
      await startWorkout(page);
      await done(page, 4);
      await page.locator('#next-round-btn').click();
      await done(page, 2);
      await page.locator('#cooldown-done').click();
      await expect(page.locator('#after-title')).toBeVisible();
    },
  },
  {
    name: 'questions',
    go: async (page) => {
      await page.locator('#questions-btn').click();
      await expect(page.locator('#q-text')).toBeVisible();
    },
  },
  {
    name: 'sessions',
    go: async (page) => {
      await page.locator('#door-sessions').click();
      await expect(page.locator('h1')).toBeVisible();
    },
  },
  {
    name: 'weekly review',
    go: async (page) => {
      await page.locator('#week-btn').click();
      await expect(page.locator('h1')).toBeVisible();
    },
  },
  {
    name: 'progress',
    go: async (page) => {
      await page.locator('#door-progress').click();
      await expect(page.locator('h1')).toBeVisible();
    },
  },
  {
    name: 'a walk',
    go: async (page) => {
      await page.locator('#walk-btn').click();
      await expect(page.locator('h1')).toBeVisible();
    },
  },
  {
    name: 'settings',
    go: async (page) => {
      await page.locator('#settings-btn').click();
      await expect(page.locator('#about')).toBeVisible();
    },
  },
];

for (const s of SCREENS) {
  test(`the note button is in the top right corner on: ${s.name}`, async ({ page, net }) => {
    setup(net, s.rest ?? 0);
    await openUnlocked(page);
    await expect(page.locator('#greeting')).toBeVisible();
    await s.go(page, net);
    const btn = page.locator('#note-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('🎤 Note to Allison');
    const box = await btn.boundingBox();
    const vp = page.viewportSize();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vp?.width ?? 0);
    expect(box?.y ?? 99).toBeLessThan(80);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    // it opens the sheet, and the sheet is on top of whatever is there
    await btn.click();
    await expect(page.locator('#note-sheet')).toBeVisible();
    await expect(page.locator('#write-start')).toBeVisible();
    await page.locator('#write-start').click(); // would fail if something covered the sheet
    await expect(page.locator('#note-text')).toBeVisible();
  });
}

test('the note button is not on the unlock screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#code-input')).toBeVisible();
  await expect(page.locator('#note-btn')).toBeHidden();
});

test('the sheet opens over Paused and over the Exit sheet, and closes back to them', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#exit-btn').click();
  await page.locator('#note-btn').click();
  await expect(page.locator('#note-sheet')).toBeVisible();
  const top = await page.evaluate(() => {
    const el = document.getElementById('rec-start');
    const r = el?.getBoundingClientRect();
    const hit = document.elementFromPoint(
      (r?.left ?? 0) + (r?.width ?? 0) / 2,
      (r?.top ?? 0) + (r?.height ?? 0) / 2
    );
    return hit?.closest('#note-sheet') !== null;
  });
  expect(top).toBe(true);
  await page.locator('#note-close').click();
  await expect(page.locator('#note-sheet')).toHaveCount(0);
  await expect(page.locator('#exit-sheet')).toBeVisible();
});

test('the sheet: title, line, a big record button, write instead, and its parts', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#note-btn').click();
  const sheet = page.locator('#note-sheet');
  await expect(sheet.getByRole('heading', { name: 'Note to Allison' })).toBeVisible();
  await expect(sheet).toContainText(
    "Tell her anything: what to add, what to change, how it's going."
  );
  await expect(page.locator('#rec-start')).toHaveText('🎤 Record a voice note');
  await expect(page.locator('#write-start')).toHaveText('✎ Write instead');
  await expect(page.locator('#notes-door')).toHaveText('Your notes ›');
  // a tap on the backdrop closes it when nothing would be lost
  await page.mouse.click(5, 5);
  await expect(page.locator('#note-sheet')).toHaveCount(0);
});

test('record, stop, play, send: the exact request, with the code in the body only', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-time')).toBeVisible();
  await expect(page.locator('.rec-dot')).toBeVisible();
  await expect(page.locator('#rec-stop')).toHaveText('■ Stop');
  // the backdrop does not throw a recording away
  await page.mouse.click(5, 5);
  await expect(page.locator('#note-sheet')).toBeVisible();
  await page.locator('#rec-stop').click();
  await expect(page.locator('#rec-play')).toContainText('▶ Play');
  await expect(page.locator('#rec-again')).toBeVisible();
  await page.locator('#rec-play').click();
  await expect(page.locator('#rec-play')).toContainText('⏸ Pause');
  await page.locator('#rec-play').click();
  await expect(page.locator('#rec-play')).toContainText('▶ Play');
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toHaveText('Sent ✓ Allison will get it.');
  expect(net.messages).toHaveLength(1);
  const { url, body } = net.messages[0];
  expect(url).not.toContain(CODE);
  expect(body.p_code).toBe(CODE);
  const msg = body.p_msg;
  expect(msg.kind).toBe('voice');
  expect(msg.mime).toBe('audio/webm');
  expect(typeof msg.client_id).toBe('string');
  expect(Number(msg.duration_sec)).toBeGreaterThanOrEqual(1);
  expect(String(msg.audio_b64)).toMatch(/^[A-Za-z0-9+/]+=*$/);
  expect(Buffer.from(String(msg.audio_b64), 'base64')).toEqual(Buffer.from([1, 2, 3, 4, 5, 6]));
  expect(msg.text).toBeUndefined();
  // the microphone was released
  const mic = await page.evaluate(
    () => (window as unknown as { __mic: { opened: number; stopped: number } }).__mic
  );
  expect(mic.opened).toBe(1);
  expect(mic.stopped).toBe(1);
  // the sheet closes by itself after about two seconds
  await expect(page.locator('#note-sheet')).toHaveCount(0, { timeout: 5000 });
});

test('on an iPhone-style recorder the note goes as audio/mp4', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.evaluate(() => {
    (window as unknown as { __mic: { mp4: boolean } }).__mic.mp4 = true;
  });
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await page.locator('#rec-stop').click();
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toBeVisible();
  expect(net.messages[0].body.p_msg.mime).toBe('audio/mp4');
});

test('Record again starts over and releases the first microphone', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await page.locator('#rec-stop').click();
  await page.locator('#rec-again').click();
  await expect(page.locator('#rec-time')).toBeVisible();
  await page.locator('#rec-stop').click();
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toBeVisible();
  expect(net.messages).toHaveLength(1);
  const mic = await page.evaluate(
    () => (window as unknown as { __mic: { opened: number; stopped: number } }).__mic
  );
  expect(mic.opened).toBe(2);
  expect(mic.stopped).toBe(2);
});

test('closing the sheet in the middle of a recording lets the microphone go', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-time')).toBeVisible();
  await page.locator('#note-close').click();
  await expect(page.locator('#note-sheet')).toHaveCount(0);
  const mic = await page.evaluate(
    () => (window as unknown as { __mic: { opened: number; stopped: number } }).__mic
  );
  expect(mic.stopped).toBe(mic.opened);
  expect(net.messages).toHaveLength(0);
});

test('a recording stops by itself at 3:00 and says so', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-time')).toBeVisible();
  await page.evaluate(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 181_000;
  });
  await expect(page.locator('#note-limit')).toHaveText(
    "That's the 3-minute limit. Send this one and record another if you like."
  );
  await expect(page.locator('#rec-play')).toContainText('3:0');
  await expect(page.locator('#note-send')).toBeVisible();
  await expect(page.locator('#rec-again')).toBeVisible();
});

test('write instead: a textarea of 16px or more, auto direction, and the exact request', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#note-btn').click();
  await page.locator('#write-start').click();
  const area = page.locator('#note-text');
  await expect(area).toHaveAttribute('dir', 'auto');
  const size = await area.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
  await expect(page.locator('#note-send')).toBeDisabled();
  await area.fill('  Please add a lighter stretch.  ');
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toHaveText('Sent ✓ Allison will get it.');
  expect(net.messages).toHaveLength(1);
  expect(net.messages[0].url).not.toContain(CODE);
  expect(net.messages[0].body.p_msg).toMatchObject({
    kind: 'text',
    text: 'Please add a lighter stretch.',
  });
  expect(net.messages[0].body.p_msg.audio_b64).toBeUndefined();
});

test('the microphone refused: the message, and Write instead still works', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.evaluate(() => {
    (window as unknown as { __mic: { deny: boolean } }).__mic.deny = true;
  });
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await expect(page.locator('#mic-denied')).toHaveText(
    "Your phone didn't let the app use the microphone. You can write instead, or allow it: Settings → Apps → Safari → Microphone."
  );
  await page.locator('#write-start').click();
  await page.locator('#note-text').fill('Typed instead');
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toBeVisible();
  expect(net.messages).toHaveLength(1);
});

test('a phone with no microphone at all gets the same message', async ({ page, net }) => {
  setup(net);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });
  await openUnlocked(page);
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await expect(page.locator('#mic-denied')).toBeVisible();
});

async function queued(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('alpal');
        open.onerror = () => resolve(-1);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('notes')) return resolve(0);
          const req = db.transaction('notes').objectStore('notes').count();
          req.onsuccess = () => resolve(req.result);
        };
      })
  );
}

async function sendWritten(page: Page, text: string): Promise<void> {
  await page.locator('#note-btn').click();
  await page.locator('#write-start').click();
  await page.locator('#note-text').fill(text);
  await page.locator('#note-send').click();
}

test('offline: the note waits in IndexedDB, Home says so, and it is sent once when online', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await page.locator('#rec-stop').click();
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toHaveText(
    "Saved on your phone. It'll send when you're online."
  );
  expect(await queued(page)).toBe(1);
  expect(net.messages).toHaveLength(0);
  await expect(page.locator('#note-sheet')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('#unsent-line')).toHaveText(
    "1 note not sent yet — it'll send when you're online."
  );
  // nothing in localStorage holds the audio
  const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(ls).not.toContain('audio_b64');
  // back online
  net.online = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => net.messages.length).toBe(1);
  await expect.poll(() => queued(page)).toBe(0);
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(net.messages[0].body.p_msg.kind).toBe('voice');
  // a second online does not send it again
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(300);
  expect(net.messages).toHaveLength(1);
});

test('a waiting note is sent when the app is opened again', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await sendWritten(page, 'Sent from the train');
  await expect(page.locator('#note-done')).toBeVisible();
  expect(await queued(page)).toBe(1);
  net.online = true;
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  await expect.poll(() => net.messages.length).toBe(1);
  await expect.poll(() => queued(page)).toBe(0);
  expect(net.messages[0].body.p_msg.text).toBe('Sent from the train');
});

test('too big: the sheet says so and keeps nothing', async ({ page, net }) => {
  setup(net);
  net.messageReply = { ok: false, reason: 'too big' };
  await openUnlocked(page);
  await sendWritten(page, 'A very long one');
  await expect(page.locator('#note-error')).toHaveText(
    "Couldn't send this one. Try a shorter note."
  );
  await expect(page.locator('#note-sheet')).toBeVisible();
  expect(await queued(page)).toBe(0);
  expect(net.messages).toHaveLength(1);
});

test('too big, found when a waiting note is retried: the message, and it is dropped', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await sendWritten(page, 'Will be refused');
  await expect(page.locator('#note-done')).toBeVisible();
  expect(await queued(page)).toBe(1);
  net.messageReply = { ok: false, reason: 'too big' };
  net.online = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#toast')).toHaveText("Couldn't send this one. Try a shorter note.");
  await expect.poll(() => queued(page)).toBe(0);
  expect(net.messages).toHaveLength(1);
  await expect(page.locator('#unsent-line')).toHaveCount(0);
});

for (const reason of ['too many', 'bad input']) {
  test(`${reason}: the same message, and it is not kept`, async ({ page, net }) => {
    setup(net);
    net.messageReply = { ok: false, reason };
    await openUnlocked(page);
    await sendWritten(page, 'Hello');
    await expect(page.locator('#note-error')).toContainText("Couldn't send this one.");
    expect(await queued(page)).toBe(0);
  });
}

test('locked (the throttle) keeps the note, and a retry that is still locked keeps it', async ({
  page,
  net,
}) => {
  setup(net);
  net.messageReply = { ok: false, reason: 'locked' };
  await openUnlocked(page);
  await sendWritten(page, 'Held back');
  await expect(page.locator('#note-done')).toHaveText(
    "Saved on your phone. It'll send when you're online."
  );
  expect(await queued(page)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => net.messages.length).toBe(2);
  expect(await queued(page)).toBe(1);
  // the throttle lifts: now it goes
  net.messageReply = null;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => queued(page)).toBe(0);
});

test('Your notes: read ticks, Sent, and Not sent yet, newest first', async ({ page, net }) => {
  setup(net);
  net.guest = makeGuest({
    program: makeRoundsProgram(),
    sessions: [],
    messages: [
      {
        client_id: 'aaaaaaaa-0001',
        kind: 'voice',
        created_at: '2026-10-19T08:00:00Z',
        duration_sec: 72,
        text: null,
        read: true,
      },
      {
        client_id: 'aaaaaaaa-0002',
        kind: 'text',
        created_at: '2026-10-19T09:30:00Z',
        text: 'Add a gentler warm-up\nand more',
        duration_sec: null,
        read: false,
      },
    ],
  });
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await sendWritten(page, 'Waiting note');
  await expect(page.locator('#note-done')).toBeVisible();
  await expect(page.locator('#note-sheet')).toHaveCount(0, { timeout: 5000 });
  await page.locator('#note-btn').click();
  await page.locator('#notes-door').click();
  const rows = page.locator('#notes-list .note-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('✎ Waiting note');
  await expect(rows.nth(0)).toContainText('Not sent yet');
  await expect(rows.nth(1)).toContainText('✎ Add a gentler warm-up');
  await expect(rows.nth(1)).not.toContainText('and more');
  await expect(rows.nth(1)).toContainText('Sent');
  await expect(rows.nth(1)).not.toContainText('got it');
  await expect(rows.nth(2)).toContainText('🎤 1:12');
  await expect(rows.nth(2)).toContainText('Allison got it ✓');
  await expect(rows.nth(2)).toContainText('Oct 19');
  await page.locator('#note-back').click();
  await expect(page.locator('#rec-start')).toBeVisible();
  // the same list is a section in Settings
  await page.locator('#note-close').click();
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-notes .note-row')).toHaveCount(3);
});

test('Your notes with nothing yet says so', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#settings-btn').click();
  await expect(page.locator('#notes-empty')).toHaveText('No notes yet.');
});

test('a note just sent shows in the list as Sent', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await sendWritten(page, 'Just sent');
  await expect(page.locator('#note-done')).toBeVisible();
  await expect(page.locator('#note-sheet')).toHaveCount(0, { timeout: 5000 });
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-notes .note-row')).toContainText('Just sent');
  await expect(page.locator('#settings-notes .note-row')).toContainText('Sent');
});

test('using a different code clears the waiting notes from the phone', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await sendWritten(page, 'Belongs to the old code');
  await expect(page.locator('#note-done')).toBeVisible();
  expect(await queued(page)).toBe(1);
  await expect(page.locator('#note-sheet')).toHaveCount(0, { timeout: 5000 });
  await page.locator('#settings-btn').click();
  await page.locator('#change-code').click();
  await page.locator('#confirm-yes').click();
  await expect(page.locator('#code-input')).toBeVisible();
  await expect.poll(() => queued(page)).toBe(0);
  await expect(page.locator('#note-btn')).toBeHidden();
});

for (const width of [320, 390, 402, 430]) {
  test(`no sideways scroll at ${width}px: the header, the sheet and the notes list`, async ({
    page,
    net,
  }) => {
    setup(net);
    net.guest = makeGuest({
      program: makeRoundsProgram(),
      sessions: [],
      messages: [
        {
          client_id: 'aaaaaaaa-0003',
          kind: 'text',
          created_at: '2026-10-19T09:30:00Z',
          text: 'Averyveryverylongwordwithoutanyspacesatalltotestwrapping '.repeat(3),
          duration_sec: null,
          read: false,
        },
      ],
    });
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await expect(page.locator('#greeting')).toBeVisible();
    const over = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    const inside = (): Promise<boolean> =>
      page.evaluate(() => {
        const card = document.querySelector('.note-card')?.getBoundingClientRect();
        return !!card && card.left >= 0 && card.right <= window.innerWidth;
      });
    expect(await over()).toBeLessThanOrEqual(0);
    await page.locator('#note-btn').click();
    expect(await over()).toBeLessThanOrEqual(0);
    expect(await inside()).toBe(true);
    await page.locator('#rec-start').click(); // recording
    await expect(page.locator('#rec-time')).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(0);
    expect(await inside()).toBe(true);
    await page.locator('#rec-stop').click(); // review
    await expect(page.locator('#rec-play')).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(0);
    expect(await inside()).toBe(true);
    await page.locator('#note-close').click();
    await page.locator('#note-btn').click();
    await page.locator('#notes-door').click(); // the list
    await expect(page.locator('#notes-list')).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(0);
    expect(await inside()).toBe(true);
    await page.locator('#note-back').click();
    await page.locator('#write-start').click(); // write
    expect(await over()).toBeLessThanOrEqual(0);
    await page.locator('#note-close').click();
    await page.locator('#settings-btn').click(); // the list in Settings
    expect(await over()).toBeLessThanOrEqual(0);
  });
}

type Mic = { opened: number; stopped: number; recorders: number; delay: number };
const micState = (page: Page): Promise<Mic> =>
  page.evaluate(() => (window as unknown as { __mic: Mic }).__mic);

test('a double tap on Record opens the microphone once', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.evaluate(() => {
    (window as unknown as { __mic: Mic }).__mic.delay = 300;
  });
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').dblclick();
  await expect(page.locator('#rec-time')).toBeVisible();
  await page.waitForTimeout(500);
  const mic = await micState(page);
  expect(mic.opened).toBe(1);
  expect(mic.recorders).toBe(1);
  await page.locator('#note-close').click();
  expect((await micState(page)).stopped).toBe(1);
});

test('Close while the microphone request is still waiting leaves nothing open', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.evaluate(() => {
    (window as unknown as { __mic: Mic }).__mic.delay = 500;
  });
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await page.locator('#note-close').click(); // the request has not been answered yet
  await expect(page.locator('#note-sheet')).toHaveCount(0);
  await page.waitForTimeout(1000);
  const mic = await micState(page);
  expect(mic.opened).toBe(1);
  expect(mic.stopped).toBe(mic.opened); // 0 tracks left open
  await expect(page.locator('#note-sheet')).toHaveCount(0); // and it did not come back
});

test('the beeps are back after a recording ends: stopped, closed, or closed while asking', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({ program: makeHoldProgram(), sessions: [] });
  await openUnlocked(page);
  // record, stop, close; then close in the middle of a recording; then close while asking
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await page.locator('#rec-stop').click();
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toBeVisible();
  await expect(page.locator('#note-sheet')).toHaveCount(0, { timeout: 5000 });
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-time')).toBeVisible();
  await page.locator('#note-close').click();
  await page.evaluate(() => {
    (window as unknown as { __mic: Mic }).__mic.delay = 300;
  });
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await page.locator('#note-close').click();
  await page.waitForTimeout(600);
  // a hold counts down with beeps again
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __tones: number[] }).__tones.length), {
      timeout: 12000,
    })
    .toBeGreaterThan(0);
});
