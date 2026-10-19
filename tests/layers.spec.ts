import type { Page } from '@playwright/test';
import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

function setup(net: Net): void {
  const program = makeRoundsProgram();
  const a = (program.workouts as { warmup: Record<string, unknown>[] }[])[0];
  a.warmup[0].name = 'A move with a long name that wraps onto a second line on a narrow screen';
  net.guest = makeGuest({ program, sessions: [] });
}

const headerBottom = async (page: Page): Promise<number> => {
  const b = await page.locator('header.top').boundingBox();
  return (b?.y ?? 0) + (b?.height ?? 0);
};

/** The element is fully below the header and is what a tap at its middle would hit. */
async function expectTappable(page: Page, sel: string): Promise<void> {
  const loc = page.locator(sel).first();
  await expect(loc).toBeVisible();
  const box = await loc.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual((await headerBottom(page)) - 0.5);
  const hit = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + 10, r.top + r.height / 2);
    return top !== null && el.contains(top);
  });
  expect(hit).toBe(true);
}

for (const width of [320, 402, 430]) {
  test(`the Home move sheet starts below the header; its title is tappable at ${width}px`, async ({
    page,
    net,
  }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await page.locator('#parts summary').first().click();
    await page.locator('.move-link').first().click();
    await expectTappable(page, '#sheet-name');
    const sheet = await page.locator('.sheet').boundingBox();
    expect(sheet?.y ?? 0).toBeGreaterThanOrEqual((await headerBottom(page)) - 0.5);
    // and the Note button is still reachable and opens its sheet on top
    await page.locator('#note-btn').click();
    await expect(page.locator('#note-sheet')).toBeVisible();
    await expect(page.locator('#rec-start')).toBeVisible();
    await page.locator('#write-start').click(); // would fail if anything covered the note sheet
    await expect(page.locator('#note-text')).toBeVisible();
  });

  test(`Paused, the Exit sheet and the Steps sheet respect the header at ${width}px`, async ({
    page,
    net,
  }) => {
    setup(net);
    await page.setViewportSize({ width, height: 520 }); // short, so a tall sheet would reach the header
    await openUnlocked(page);
    await startWorkout(page);
    // Paused
    await page.getByRole('button', { name: 'Pause workout' }).click();
    const overlay = await page.locator('#paused-overlay').boundingBox();
    expect(overlay?.y ?? 0).toBeGreaterThanOrEqual((await headerBottom(page)) - 0.5);
    await expectTappable(page, '#paused-overlay h1');
    await page.locator('#note-btn').click();
    await expect(page.locator('#note-sheet')).toBeVisible();
    await page.locator('#note-close').click();
    await page.locator('#resume-btn').click();
    // Steps (a tall list)
    await page.locator('#steps-btn').click();
    await expect(page.locator('#steps-sheet')).toBeVisible();
    const card = await page.locator('#steps-sheet .exit-card').boundingBox();
    expect(card?.y ?? 0).toBeGreaterThanOrEqual((await headerBottom(page)) - 0.5);
    await expectTappable(page, '#steps-sheet .exit-title');
    await page.locator('#steps-close').click();
    // Exit
    await page.locator('#exit-btn').click();
    const exit = await page.locator('#exit-sheet .exit-card').boundingBox();
    expect(exit?.y ?? 0).toBeGreaterThanOrEqual((await headerBottom(page)) - 0.5);
    await expectTappable(page, '#exit-sheet .exit-title');
  });

  test(`the change-code sheet respects the header at ${width}px`, async ({ page, net }) => {
    setup(net);
    await page.setViewportSize({ width, height: 520 });
    await openUnlocked(page);
    await page.locator('#settings-btn').click();
    await page.locator('#change-code').click();
    await expectTappable(page, '#confirm-code .exit-title');
  });
}
