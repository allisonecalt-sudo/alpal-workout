import { expect, makeGuest, makeRoundsProgram, openUnlocked, test, type Net } from './fixtures';

const LINES = ['Safety line one', 'Safety line two'];

function withSafety(net: Net, week = 1, lines: string[] = LINES): void {
  net.guest = makeGuest({ program: makeRoundsProgram({ week, safety: lines }), sessions: [] });
}

test('open the first time she sees it, with the lines, above Up next', async ({ page, net }) => {
  withSafety(net);
  await openUnlocked(page);
  const card = page.locator('#safety');
  await expect(card.locator('summary')).toHaveText('Before you start');
  await expect(card).toHaveJSProperty('open', true);
  await expect(card.locator('li')).toHaveText(LINES);
  const safetyY = (await card.boundingBox())?.y ?? 0;
  const upNextY = (await page.locator('#up-next').boundingBox())?.y ?? 0;
  expect(safetyY).toBeLessThan(upNextY);
});

test('closed after a reload, and it opens with a tap', async ({ page, net }) => {
  withSafety(net);
  await openUnlocked(page);
  await expect(page.locator('#safety')).toHaveJSProperty('open', true);
  await page.reload();
  const card = page.locator('#safety');
  await expect(card.locator('summary')).toBeVisible();
  await expect(card).toHaveJSProperty('open', false);
  await expect(page.getByText('Safety line one')).toBeHidden();
  await card.locator('summary').click();
  await expect(page.getByText('Safety line one')).toBeVisible();
});

test('it stays open for the rest of the visit (a chip tap does not shut it)', async ({
  page,
  net,
}) => {
  withSafety(net);
  await openUnlocked(page);
  await page.locator('#chips-line .chip').first().click();
  await expect(page.locator('#safety')).toHaveJSProperty('open', true);
});

test('remembered per program week: a new week opens it again', async ({ page, net }) => {
  withSafety(net, 1);
  await openUnlocked(page);
  await expect(page.locator('#safety')).toHaveJSProperty('open', true);
  await page.reload();
  await expect(page.locator('#safety')).toHaveJSProperty('open', false);
  net.guest = makeGuest({ program: makeRoundsProgram({ week: 2, safety: LINES }), sessions: [] });
  await page.reload();
  await expect(page.locator('#safety')).toHaveJSProperty('open', true);
});

test('absent means no card', async ({ page, net }) => {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [] });
  await openUnlocked(page);
  await expect(page.locator('#up-next')).toBeVisible();
  await expect(page.locator('#safety')).toHaveCount(0);
  net.guest = makeGuest({ program: makeRoundsProgram({ safety: [] }), sessions: [] });
  await page.reload();
  await expect(page.locator('#safety')).toHaveCount(0);
});

test('lines are shown as text, never as markup', async ({ page, net }) => {
  withSafety(net, 1, ['<b>bold</b> line']);
  await openUnlocked(page);
  await expect(page.locator('#safety li')).toHaveText('<b>bold</b> line');
  await expect(page.locator('#safety b')).toHaveCount(0);
});

test('no sideways scroll at 320px, even with a very long word', async ({ page, net }) => {
  withSafety(net, 1, [...LINES, 'w'.repeat(150)]);
  await page.setViewportSize({ width: 320, height: 640 });
  await openUnlocked(page);
  await expect(page.locator('#safety')).toHaveJSProperty('open', true);
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(over).toBeLessThanOrEqual(0);
  const box = await page.locator('#safety summary').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('closed by hand stays closed through redraws for the rest of the visit', async ({
  page,
  net,
}) => {
  withSafety(net);
  await openUnlocked(page);
  const card = page.locator('#safety');
  await expect(card).toHaveJSProperty('open', true);
  await card.locator('summary').click(); // she closes it
  await expect(card).toHaveJSProperty('open', false);
  // a redraw (a chip tap draws Home again) must not reopen it
  await page.locator('#chips-line .chip').first().click();
  await expect(page.locator('#safety')).toHaveJSProperty('open', false);
  await page.locator('#chips-line .chip').first().click();
  await expect(page.locator('#safety')).toHaveJSProperty('open', false);
});

test('opened by hand stays open through redraws, even after the first time', async ({
  page,
  net,
}) => {
  withSafety(net);
  await openUnlocked(page);
  await expect(page.locator('#safety')).toHaveJSProperty('open', true); // first visit drawn
  await page.reload(); // second visit: closed
  const closed = page.locator('#safety');
  await expect(closed).toHaveJSProperty('open', false);
  await closed.locator('summary').click(); // she opens it
  await expect(closed).toHaveJSProperty('open', true);
  await page.locator('#chips-line .chip').first().click();
  await expect(page.locator('#safety')).toHaveJSProperty('open', true);
});
