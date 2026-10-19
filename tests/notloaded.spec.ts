import { QUESTIONS, expect, makeGuest, openUnlocked, test } from './fixtures';

test('before Week 1: the soft line, the questions card, and the note button', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({ program: null, sessions: [], questions: QUESTIONS.slice(0, 3) });
  await openUnlocked(page);
  await expect(page.locator('#not-loaded')).toHaveText('Your workouts will show up here soon.');
  await expect(page.locator('#questions-card')).toBeVisible();
  await expect(page.locator('#questions-left')).toHaveText('3 left · answer whenever you like');
  await expect(page.locator('#note-btn')).toBeVisible();
  // the card works exactly as on Home: answer one, come back
  await page.locator('#questions-btn').click();
  await expect(page.locator('#q-text')).toHaveText('Question one?');
  await page.locator('#q-answer').fill('My answer');
  await page.locator('#q-save').click();
  await expect(page.locator('#q-text')).toHaveText('Question two?');
  expect(net.answers).toHaveLength(1);
  await page.locator('#q-done').click();
  await expect(page.locator('#not-loaded')).toBeVisible();
  await expect(page.locator('#questions-left')).toHaveText('2 left · answer whenever you like');
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
});

test('before Week 1 with no questions left: no card', async ({ page, net }) => {
  net.guest = makeGuest({ program: null, sessions: [], questions: [] });
  await openUnlocked(page);
  await expect(page.locator('#not-loaded')).toHaveText('Your workouts will show up here soon.');
  await expect(page.locator('#questions-card')).toHaveCount(0);
});

for (const width of [320, 390, 430]) {
  test(`no sideways scroll at ${width}px before Week 1`, async ({ page, net }) => {
    net.guest = makeGuest({ program: null, sessions: [], questions: QUESTIONS });
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await expect(page.locator('#questions-card')).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
  });
}
