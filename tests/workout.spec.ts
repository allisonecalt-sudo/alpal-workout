import { expect, makeGuest, makeProgram, openUnlocked, test } from './fixtures';

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
  await page.locator('#start-btn').click();
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
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#progress-line')).toHaveText('Move 2 of 3');
  await expect(page.locator('#move-name')).toHaveText('Move two');
  await expect(page.locator('#timer')).toHaveText('30 s');
  await expect(page.locator('#reps')).toHaveCount(0);
});

test('Skip and This hurts record the move and move on, with a gentle line', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#toast')).toHaveText('Got it, skipped.');
  await expect(page.locator('#progress-line')).toHaveText('Move 2 of 3');
  await page.getByRole('button', { name: 'This hurts' }).click();
  await expect(page.locator('#toast')).toHaveText('Got it, skipped.');
  await expect(page.locator('#progress-line')).toHaveText('Move 3 of 3');
  expect((await progress(page)).statuses).toEqual(['skipped', 'hurt']);
  await page.locator('#done-btn').click();
  await expect(page.getByRole('heading', { name: 'Done! 🎉' })).toBeVisible();
});

test('the timer counts down from the wall clock, with Start and Pause', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click();
  const btn = page.locator('#timer-btn');
  await expect(btn).toHaveText('Start');
  await btn.click();
  await expect(btn).toHaveText('Pause');
  await expect(page.locator('#timer')).not.toHaveText('30 s', { timeout: 3000 });
  await btn.click();
  await expect(btn).toHaveText('Start');
  const frozen = await page.locator('#timer').textContent();
  await page.waitForTimeout(1300);
  await expect(page.locator('#timer')).toHaveText(frozen as string);
});

test('a reload mid-timer keeps the move and the time', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer-btn')).toHaveText('Pause'); // the tap has been handled
  // pretend 10 seconds have already gone by on the wall clock
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('aw.progress') as string);
    p.timer.startedAt -= 10_000;
    localStorage.setItem('aw.progress', JSON.stringify(p));
  });
  await page.reload();
  await expect(page.locator('#progress-line')).toHaveText('Move 2 of 3');
  await expect(page.locator('#move-name')).toHaveText('Move two');
  await expect(page.locator('#timer')).toHaveText(/^(19|20) s$/);
  // still running after the reload
  await expect(page.locator('#timer-btn')).toHaveText('Pause');
});

test('a paused timer stays put across a reload', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer-btn')).toHaveText('Pause');
  await page.waitForTimeout(1200);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer-btn')).toHaveText('Start');
  const frozen = await page.locator('#timer').textContent();
  await page.reload();
  await expect(page.locator('#timer')).toHaveText(frozen as string);
  await expect(page.locator('#timer-btn')).toHaveText('Start');
});

test('a timer that ends beeps once and stops at zero', async ({ page, net }) => {
  net.guest = makeGuest({
    program: makeProgram({
      moves: [
        { name: 'Move one', how: ['Line one'], seconds: 2 },
        { name: 'Move two', how: ['Line one'], reps: '3 times' },
      ],
    }),
  });
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await expect(page.locator('#timer')).toHaveText('2 s');
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer')).toHaveText('0 s', { timeout: 6000 });
  await expect(page.locator('#timer-btn')).toBeDisabled();
  // one soft double beep (two tones), and it does not repeat
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as unknown as { __osc: number }).__osc)).toBe(2);
});

test('a timer that ran out while the page was closed ends quietly', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer-btn')).toHaveText('Pause');
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('aw.progress') as string);
    p.timer.startedAt -= 120_000;
    localStorage.setItem('aw.progress', JSON.stringify(p));
  });
  await page.reload();
  await expect(page.locator('#timer')).toHaveText('0 s');
  expect(await page.evaluate(() => (window as unknown as { __osc: number }).__osc)).toBe(0);
});

test('a reload keeps the move she is on', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click();
  await page.reload();
  await expect(page.locator('#progress-line')).toHaveText('Move 2 of 3');
  await page.locator('#done-btn').click();
  await page.reload();
  await expect(page.locator('#progress-line')).toHaveText('Move 3 of 3');
});

test('voice is OFF on first open: nothing speaks, and the toggle shows it off', async ({
  page,
}) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await expect(page.locator('#voice-btn')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('aw.voice'))).toBeNull();
});

test('turning voice on reads each move after that, and the choice is remembered', async ({
  page,
}) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  const toggle = page.locator('#voice-btn');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#done-btn').click();
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken).toEqual(['Move two. Hold steady']);
  expect(await page.evaluate(() => localStorage.getItem('aw.voice'))).toBe('on');
  await page.reload();
  await expect(page.locator('#voice-btn')).toHaveAttribute('aria-pressed', 'true');
  // turning it off again stops it and is remembered too
  await page.locator('#voice-btn').click();
  await expect(page.locator('#voice-btn')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#done-btn').click();
  const after = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(after).toEqual([]); // (a reload starts the page's own list afresh)
  expect(await page.evaluate(() => localStorage.getItem('aw.voice'))).toBe('off');
});

test('the screen is kept awake while the workout runs', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __locks: number }).__locks))
    .toBeGreaterThan(0);
});

test('workout buttons are at least 44px tall and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click();
  for (const b of await page.locator('button').all()) {
    const box = await b.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(over).toBeLessThanOrEqual(0);
});
