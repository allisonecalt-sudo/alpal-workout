import { expect, makeGuest, makeProgram, openUnlocked, PHONE, test } from './fixtures';

test("Home shows the name, the week dots, today's card and the quiet line", async ({ page }) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toHaveText('Hi Test User 👋');
  await expect(page.locator('#dots .dot')).toHaveCount(3);
  await expect(page.locator('#dots .dot.filled')).toHaveCount(1);
  await expect(page.locator('#week-words')).toHaveText('1 of 3 this week');
  await expect(page.locator('#up-next')).toHaveText('Up next · Week 1');
  await expect(page.locator('#parts summary')).toHaveText(['Main · 3 moves']);
  await expect(page.locator('#parts .move-list li')).toHaveCount(3);
  await expect(page.locator('#parts .move-list li').nth(0)).toContainText('Move one');
  await expect(page.locator('#parts .move-list li').nth(0)).toContainText('8 times');
  await expect(page.locator('#parts .move-list li').nth(1)).toContainText('30 s');
  await expect(page.locator('#minutes')).toHaveText('About 8 min');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.locator('#quiet-line')).toHaveText(
    'This app is yours. Tell Allison anything you want changed — suggestions welcome.'
  );
  await expect(page.locator('#past-weeks li')).toHaveText(['Week 1 · 1 of 3']);
  await expect(page.locator('#app-version')).toContainText('v1.3.1');
});

test('past weeks are listed newest first', async ({ page, net }) => {
  net.guest = makeGuest({
    program: makeProgram({ week: 2, label: 'Week 2' }),
    sessions: [
      { done_at: '2026-10-19T08:00:00Z', week: 2, feel: null, check_0_10: null },
      { done_at: '2026-10-12T08:00:00Z', week: 1, feel: 'easy', check_0_10: 0 },
      { done_at: '2026-10-13T08:00:00Z', week: 1, feel: 'easy', check_0_10: 0 },
    ],
  });
  await openUnlocked(page);
  await expect(page.locator('#past-weeks li')).toHaveText(['Week 2 · 1 of 3', 'Week 1 · 2 of 3']);
  await expect(page.locator('#week-words')).toHaveText('1 of 3 this week');
});

test('no sessions yet is a quiet line, not a scolding', async ({ page, net }) => {
  net.guest = makeGuest({ sessions: [] });
  await openUnlocked(page);
  await expect(page.locator('#week-words')).toHaveText('0 of 3 this week');
  await expect(page.locator('#dots .dot.filled')).toHaveCount(0);
  await expect(page.locator('#past-weeks')).toHaveText('Nothing here yet');
});

test('the Tell Allison link is exact and comes from the store', async ({ page }) => {
  await openUnlocked(page);
  const tell = page.locator('#tell');
  await expect(tell).toHaveText('💬 Tell Allison');
  const digits = PHONE.replace(/\D/g, '');
  await expect(tell).toHaveAttribute(
    'href',
    `https://wa.me/${digits}?text=About%20my%20workout%20app%3A%20`
  );
});

test('with no number in the store the Tell Allison button is hidden', async ({ page, net }) => {
  net.guest = makeGuest({ tell_whatsapp: null });
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#tell')).toBeHidden();
});

test('no program in the store fails loud, with the Tell button', async ({ page, net }) => {
  net.guest = makeGuest({ program: null });
  await openUnlocked(page);
  await expect(page.locator('#not-loaded')).toHaveText(
    "Your workout isn't loaded yet. Tell Allison."
  );
  await expect(page.locator('#tell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
});

test('a malformed program also fails loud and never invents a workout', async ({ page, net }) => {
  net.guest = makeGuest({
    program: makeProgram({ moves: [{ name: 'Move one', how: ['x'] }] }),
  });
  await openUnlocked(page);
  await expect(page.locator('#not-loaded')).toBeVisible();
  await expect(page.locator('#parts')).toHaveCount(0);
});

test('the store being unreachable with nothing saved fails loud', async ({ page, net }) => {
  net.online = false;
  await openUnlocked(page);
  await expect(page.locator('#not-loaded')).toBeVisible();
});

for (const width of [320, 390, 430]) {
  test(`no sideways scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await expect(page.locator('#greeting')).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
  });
}

test('every button on Home is at least 44px tall', async ({ page }) => {
  await openUnlocked(page);
  await expect(page.locator('#start-btn')).toBeVisible();
  for (const b of await page.locator('button, #tell').all()) {
    if (!(await b.isVisible())) continue;
    const box = await b.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('page markup is English, left to right', async ({ page }) => {
  await openUnlocked(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBeNull();
});

test('a name from the store is shown as text, never as markup', async ({ page, net }) => {
  net.guest = makeGuest({ name: '<b>Test</b> User' });
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toHaveText('Hi <b>Test</b> User 👋');
  await expect(page.locator('#greeting b')).toHaveCount(0);
});
