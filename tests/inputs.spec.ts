import { expect, openUnlocked, startWorkout, test } from './fixtures';

// iOS zooms in on any input under 16 px, and a field under 44 px tall is hard to hit.
async function measure(
  page: import('@playwright/test').Page,
  sel: string
): Promise<{ font: number; height: number }> {
  const loc = page.locator(sel);
  await expect(loc).toBeVisible();
  const font = await loc.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const height = (await loc.boundingBox())?.height ?? 0;
  return { font, height };
}

test('the Before screen time picker is 16 px or more and 44 px or taller', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#time-start-fix').click();
  const m = await measure(page, '#time-start-input');
  expect(m.font).toBeGreaterThanOrEqual(16);
  expect(m.height).toBeGreaterThanOrEqual(44);
});

test('the After screen time picker is 16 px or more and 44 px or taller', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.locator('#time-end-fix').click();
  const m = await measure(page, '#time-end-input');
  expect(m.font).toBeGreaterThanOrEqual(16);
  expect(m.height).toBeGreaterThanOrEqual(44);
  const note = await measure(page, '#note');
  expect(note.font).toBeGreaterThanOrEqual(16);
});

test('the code field is 16 px or more and 44 px tall too', async ({ page }) => {
  await page.goto('/');
  const code = await measure(page, '#code-input');
  expect(code.font).toBeGreaterThanOrEqual(16);
  expect(code.height).toBeGreaterThanOrEqual(44);
});

test('the time picker fits at 320 px without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#time-start-fix').click();
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(over).toBeLessThanOrEqual(0);
});
