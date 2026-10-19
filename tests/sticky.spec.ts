import type { Page } from '@playwright/test';
import {
  QUESTIONS,
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

function manySessions(n: number) {
  return Array.from({ length: n }, (_, k) => ({
    client_id: `bbbbbbbb-${String(k).padStart(4, '0')}`,
    done_at: new Date(Date.UTC(2026, 8, 1 + (k % 28), 8, k % 60)).toISOString(),
    week: 0,
    workout: 'A',
    feel: null,
    check_0_10: null,
  }));
}

function setup(net: Net): void {
  net.guest = makeGuest({
    program: makeRoundsProgram(),
    sessions: manySessions(40),
    questions: QUESTIONS.slice(0, 2),
  });
}

async function toAfter(page: Page): Promise<void> {
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.locator('#next-round-btn').click();
  for (let k = 0; k < 2; k++) await page.locator('#done-btn').click();
  await page.locator('#cooldown-done').click();
  await expect(page.locator('#after-title')).toBeVisible();
}

/** Scrolled to the very bottom, the button is still on screen and it opens the sheet. */
async function expectStuck(page: Page): Promise<void> {
  const scrollable = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  expect(scrollable).toBeGreaterThan(200); // the page really is long
  const box = await page.locator('#note-btn').boundingBox();
  const vp = page.viewportSize();
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(vp?.height ?? 0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vp?.width ?? 0);
  await page.locator('#note-btn').click();
  await expect(page.locator('#note-sheet')).toBeVisible();
  await page.locator('#note-close').click();
}

test('After, scrolled to the bottom: the Note button is still in the corner and works', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await toAfter(page);
  await expectStuck(page);
});

test('the long Sessions list, scrolled to the bottom: same', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#door-sessions').click();
  await expect(page.locator('.session-row').first()).toBeVisible();
  await expectStuck(page);
});

test('the header has the page colour behind it and sits above the content', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#door-sessions').click();
  await expect(page.locator('.session-row').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 600));
  const info = await page.evaluate(() => {
    const top = document.querySelector('header.top') as HTMLElement;
    const cs = getComputedStyle(top);
    const r = top.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 40, r.top + r.height / 2);
    return {
      position: cs.position,
      bg: cs.backgroundColor,
      z: Number(cs.zIndex),
      hitsHeader: hit !== null && top.contains(hit),
    };
  });
  expect(info.position).toBe('sticky');
  expect(info.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(info.z).toBeLessThan(60); // below the open sheet
  expect(info.hitsHeader).toBe(true);
});

test('the first line of every kind of screen starts below the header', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  const clear = async (sel: string): Promise<void> => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const h = await page.locator('header.top').boundingBox();
    const t = await page.locator(sel).first().boundingBox();
    expect(t?.y ?? 0).toBeGreaterThanOrEqual((h?.y ?? 0) + (h?.height ?? 0) - 1);
  };
  await clear('#greeting');
  await page.locator('#door-sessions').click();
  await clear('#sessions-title');
  await page.locator('#sessions-back').click();
  await page.locator('#start-btn').click();
  await clear('.before h1');
  await page.locator('#before-start').click();
  await clear('#progress-line');
});

for (const width of [320, 390, 402, 430]) {
  test(`no sideways scroll at ${width}px with the sticky header`, async ({ page, net }) => {
    setup(net);
    await page.setViewportSize({ width, height: 800 });
    await openUnlocked(page);
    await page.locator('#door-sessions').click();
    await expect(page.locator('.session-row').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 500));
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    const box = await page.locator('#note-btn').boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  });
}
