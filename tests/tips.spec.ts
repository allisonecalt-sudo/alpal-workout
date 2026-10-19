import type { Locator, Page } from '@playwright/test';
import {
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

const ALL = [
  'home-week',
  'home-start',
  'note-btn',
  'before-scores',
  'before-check',
  'before-lite',
  'move-first',
  'move-pills',
  'move-feel',
  'move-hurt',
  'move-hold',
  'rest',
  'steps',
  'pause',
  'after',
  'questions',
  'sessions',
  'progress',
];

/** Tips on, with these ids already seen (the first call in a test wins for the whole test). */
async function tipsOn(page: Page, seen: string[] = []): Promise<void> {
  await page.addInitScript((ids: string[]) => {
    if (!sessionStorage.getItem('__tipsinit')) {
      sessionStorage.setItem('__tipsinit', '1');
      localStorage.removeItem('aw.tips');
      localStorage.setItem('aw.tipsSeen', JSON.stringify(ids));
    }
  }, seen);
}

const except = (...ids: string[]): string[] => ALL.filter((i) => !ids.includes(i));

function setup(net: Net, over: Record<string, unknown> = {}): void {
  net.guest = makeGuest({
    program: makeRoundsProgram({ checkLabel: 'Check-in', ...over }),
    sessions: [],
    questions: QUESTIONS.slice(0, 2),
  });
}

const tip = (page: Page): Locator => page.locator('#tip');

/** The bubble is inside the screen and does not cover any primary button. */
async function expectSafe(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const t = document.getElementById('tip')?.getBoundingClientRect();
    if (!t) return 'no tip';
    const vw = document.documentElement.clientWidth;
    if (t.left < 0 || t.right > vw) return `outside the width: ${t.left}..${t.right} of ${vw}`;
    if (t.top < 0 || t.bottom > window.innerHeight + 1) return 'outside the height';
    for (const b of document.querySelectorAll('.btn-main, .btn-start')) {
      if (b.closest('#tip')) continue;
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue;
      if (t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top) {
        return `covers #${b.id}`;
      }
    }
    return 'ok';
  });
  expect(ok).toBe('ok');
}

test('Home: the tips come one at a time, in order, each gone for good after Got it', async ({
  page,
  net,
}) => {
  setup(net);
  await tipsOn(page);
  await openUnlocked(page);
  await expect(tip(page)).toContainText(
    'This is your week. Each dot is one workout; tap here to see your week.'
  );
  await expect(page.locator('#tip')).toHaveCount(1);
  await expectSafe(page);
  await page.locator('#tip-ok').click();
  await expect(tip(page)).toContainText(
    "Tap Start when you're ready, or pick another workout below."
  );
  await expect(page.locator('#tip')).toHaveCount(1);
  await expectSafe(page);
  await page.locator('#tip-ok').click();
  await expect(tip(page)).toContainText(
    "Any time, tap here to send Allison a voice note or a message: what to change, what to add, how it's going."
  );
  await expectSafe(page);
  await page.locator('#tip-ok').click();
  await expect(page.locator('#tip')).toHaveCount(0);
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('aw.tipsSeen') ?? '[]'));
  expect(seen).toEqual(['home-week', 'home-start', 'note-btn']);
  // a reload shows none of them again
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('#tip')).toHaveCount(0);
});

test('a tip is not modal: the page still works while it shows', async ({ page, net }) => {
  setup(net);
  await tipsOn(page, except('home-week'));
  await openUnlocked(page);
  await expect(tip(page)).toBeVisible();
  await page.locator('#week-btn').click(); // goes to the weekly review; the tip moves on
  await expect(page.locator('#tip')).toHaveCount(0);
});

test('Before: the scores, the check row and the lite chip', async ({ page, net }) => {
  setup(net);
  await tipsOn(page, except('before-scores', 'before-check', 'before-lite'));
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await expect(tip(page)).toContainText(
    'A quick check before you start. Tap a number; all optional. 1 = low, 10 = great.'
  );
  await expectSafe(page);
  await page.locator('#tip-ok').click();
  await expect(tip(page)).toContainText('0 = nothing at all, 10 = the most.');
  await expectSafe(page);
  await page.locator('#tip-ok').click();
  await expect(tip(page)).toContainText('On a hard day, do one round less. It still counts.');
  await expectSafe(page);
  await page.locator('#tip-ok').click();
  await expect(page.locator('#tip')).toHaveCount(0);
});

test('the first move screen: move, pills, hurt, steps, pause, never over Done', async ({
  page,
  net,
}) => {
  setup(net);
  await tipsOn(page, except('move-first', 'move-pills', 'move-hurt', 'steps', 'pause'));
  await openUnlocked(page);
  await startWorkout(page);
  const texts = [
    'Do the move, then tap Done. ‹ Back goes back one step; ✕ ends the workout.',
    '▶ Watch how shows a short video. 🔊 Hear how explains the move out loud.',
    "If a move hurts, tap here. It's skipped and Allison will know.",
    'See every step; tap one to jump to it.',
    'Pause the whole workout.',
  ];
  for (const text of texts) {
    await expect(tip(page)).toContainText(text);
    await expect(page.locator('#tip')).toHaveCount(1);
    await expectSafe(page);
    await page.locator('#tip-ok').click();
  }
  await expect(page.locator('#tip')).toHaveCount(0);
});

test('a hold: its tip shows before Start, and nothing shows during the countdown', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({ program: makeHoldProgram(), sessions: [] });
  await tipsOn(page, except('move-hold'));
  await openUnlocked(page);
  await startWorkout(page);
  await expect(tip(page)).toContainText(
    'Tap Start: you get 3 seconds to get ready, then it counts down. Stop any time; it still counts.'
  );
  await expectSafe(page);
  await page.locator('#tip-ok').click();
  await expect(page.locator('#tip')).toHaveCount(0);
});

test('a hold that is counting down never gets a tip', async ({ page, net }) => {
  net.guest = makeGuest({ program: makeHoldProgram(), sessions: [] });
  await tipsOn(page, except('move-hold'));
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#timer-btn')).toBeVisible();
  // press Start before the tip's delay: the countdown runs and stays free of bubbles
  await page.locator('#timer-btn').click();
  await expect(page.locator('#get-ready')).toBeVisible();
  for (let k = 0; k < 6; k++) {
    await expect(page.locator('#tip')).toHaveCount(0);
    await page.waitForTimeout(250);
  }
});

test('Rest, After, Questions, Sessions and Progress each get theirs on the first visit', async ({
  page,
  net,
}) => {
  const program = makeRoundsProgram({ checkLabel: 'Check-in' });
  withRest(program, 30);
  net.guest = makeGuest({ program, sessions: [], questions: QUESTIONS.slice(0, 1) });
  await tipsOn(page, except('rest', 'questions', 'sessions', 'progress', 'after'));
  await openUnlocked(page);
  await page.locator('#questions-btn').click();
  await expect(tip(page)).toContainText(
    'One question at a time, whenever you like. Type, or tap the 🎤 on your keyboard to talk.'
  );
  await expectSafe(page);
  await page.locator('#tip-ok').click();
  await page.locator('#q-done').click();
  await page.locator('#door-sessions').click();
  await expect(tip(page)).toContainText("Everything you've done, newest first.");
  await page.locator('#tip-ok').click();
  await page.locator('#sessions-back').click();
  await page.locator('#door-progress').click();
  await expect(tip(page)).toContainText('How your weeks are going. It grows as you go.');
  await page.locator('#tip-ok').click();
  await page.locator('#progress-back').click();
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#rest-screen')).toBeVisible();
  await expect(tip(page)).toContainText("A short rest. Skip it whenever you're ready.");
  await page.locator('#tip-ok').click();
  await page.locator('#exit-btn').click();
  await page.locator('#exit-log').click();
  await expect(page.locator('#after-title')).toBeVisible();
  await expect(tip(page)).toContainText('How did it go? Tap what fits (all optional), then Save.');
  await expectSafe(page);
});

test('no tip while a sheet is open or a recording runs; it comes back after', async ({
  page,
  net,
}) => {
  setup(net);
  await tipsOn(page, except('home-week'));
  await openUnlocked(page);
  await expect(tip(page)).toBeVisible();
  await page.locator('#note-btn').click();
  await expect(page.locator('#tip')).toHaveCount(0);
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-time')).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.locator('#tip')).toHaveCount(0);
  await page.locator('#note-close').click(); // stops, asks
  await page.locator('#confirm-discard').click();
  await expect(tip(page)).toBeVisible();
});

test('Settings: Hide tips, Show tips, and Show tips again', async ({ page, net }) => {
  setup(net);
  await tipsOn(page, except('home-week'));
  await openUnlocked(page);
  await expect(tip(page)).toBeVisible();
  await page.locator('#settings-btn').click();
  await expect(page.locator('#tip')).toHaveCount(0);
  await expect(page.locator('#set-tips')).toHaveText('Hide tips');
  await page.locator('#set-tips').click();
  await expect(page.locator('#set-tips')).toHaveText('Show tips');
  await page.getByRole('button', { name: '‹ Home' }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('#tip')).toHaveCount(0); // hidden for good
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('#tip')).toHaveCount(0);
  // Show tips again: everything is new once more
  await page.locator('#settings-btn').click();
  await page.locator('#tips-again').click();
  await expect(page.locator('#set-tips')).toHaveText('Hide tips');
  expect(await page.evaluate(() => localStorage.getItem('aw.tipsSeen'))).toBeNull();
  // the Note button's tip is due on any screen (it lives in the header): then Home's own
  await expect(tip(page)).toContainText('Any time, tap here to send Allison a voice note');
  await page.locator('#tip-ok').click();
  await page.getByRole('button', { name: '‹ Home' }).click();
  await expect(tip(page)).toContainText('This is your week.');
});

for (const width of [320, 390, 430]) {
  test(`no sideways scroll at ${width}px with a tip showing (Home, Before, a move)`, async ({
    page,
    net,
  }) => {
    setup(net);
    await page.setViewportSize({ width, height: 800 });
    await tipsOn(page, except('home-week', 'before-scores', 'move-first'));
    await openUnlocked(page);
    const over = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    await expect(tip(page)).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(0);
    await expectSafe(page);
    await page.locator('#tip-ok').click();
    await page.locator('#start-btn').click();
    await expect(tip(page)).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(0);
    await expectSafe(page);
    await page.locator('#tip-ok').click();
    await page.locator('#before-start').click();
    await expect(tip(page)).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(0);
    await expectSafe(page);
  });
}
