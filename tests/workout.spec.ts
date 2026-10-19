import { expect, makeGuest, makeProgram, openUnlocked, test, startWorkout } from './fixtures';

interface Stored {
  idx: number;
  statuses: string[];
  timer: { durationMs: number; startedAt: number | null; usedMs: number } | null;
  startedAt: number;
}

async function progress(page: import('@playwright/test').Page): Promise<Stored> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('aw.progress') as string));
}

test('Start opens move 1 with its name, how-to lines, reps and progress line', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#progress-line')).toHaveText('Move 1 of 3');
  await expect(page.locator('#move-name')).toHaveText('Move one');
  await expect(page.locator('#how li')).toHaveText(['Line one', 'Line two']);
  await expect(page.locator('#reps')).toHaveText('8 times');
  await expect(page.locator('#timer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Done ›' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'This hurts' })).toBeVisible();
});

test('Done goes to the next move; a timed move shows a timer', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await expect(page.locator('#progress-line')).toHaveText('Move 2 of 3');
  await expect(page.locator('#move-name')).toHaveText('Move two');
  await expect(page.locator('#timer')).toHaveText('30 s');
  await expect(page.locator('#reps')).toHaveCount(0);
});

test('Skip and This hurts record the move and move on, with a gentle line', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#toast')).toHaveText('Got it, skipped.');
  await expect(page.locator('#progress-line')).toHaveText('Move 2 of 3');
  await page.getByRole('button', { name: 'This hurts' }).click();
  await expect(page.locator('#toast')).toHaveText('Got it, skipped.');
  await expect(page.locator('#progress-line')).toHaveText('Move 3 of 3');
  expect((await progress(page)).statuses).toEqual(['skipped', 'hurt']);
  await page.locator('#done-btn').click();
  await expect(page.locator('#redo-title')).toHaveText('1 skipped — do them now?');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#after-title')).toBeVisible();
});

test('a reload keeps the move she is on', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.reload();
  await expect(page.locator('#progress-line')).toHaveText('Move 2 of 3');
  await page.locator('#done-btn').click();
  await page.reload();
  await expect(page.locator('#progress-line')).toHaveText('Move 3 of 3');
});

test('no automatic voice: no toggle, and the browser is never asked to speak', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#voice-btn')).toHaveCount(0);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  const calls = await page.evaluate(() => {
    const w = window as unknown as { __spoken: string[]; __cancels: number };
    return { spoken: w.__spoken, cancels: w.__cancels };
  });
  expect(calls.spoken).toEqual([]);
  expect(calls.cancels).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.voice'))).toBeNull();
});

test('the screen is kept awake while the workout runs', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __locks: number }).__locks))
    .toBeGreaterThan(0);
});

test('workout buttons are at least 44px tall and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  for (const b of await page.locator('button').all()) {
    if (!(await b.isVisible())) continue;
    const box = await b.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(over).toBeLessThanOrEqual(0);
});
