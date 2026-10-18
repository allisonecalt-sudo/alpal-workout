import { CODE, expect, makeGuest, openUnlocked, QUESTIONS, runWorkout, test } from './fixtures';

const LOCKED = { locked: true };

test('unlock while throttled: its own message, not "wrong code", and nothing saved', async ({
  page,
  net,
}) => {
  net.loadReply = LOCKED;
  await page.goto('/');
  await page.locator('#code-input').fill(CODE);
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#unlock-error')).toHaveText(
    'Too many tries just now. Wait 15 minutes and try again.'
  );
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBeNull();
  // the same screen still works once the throttle is off
  net.loadReply = undefined;
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
});

test('boot with a saved code while throttled: keeps the code, shows Try again', async ({
  page,
  net,
}) => {
  net.loadReply = LOCKED;
  await openUnlocked(page);
  await expect(page.locator('#cant-open')).toHaveText(
    "Can't open right now. Try again in a few minutes."
  );
  await expect(page.locator('#code-input')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBe(CODE);
  net.loadReply = undefined;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#greeting')).toHaveText('Hi Test User 👋');
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBe(CODE);
});

test('throttled boot does not fall back to the cached copy or clear anything', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible(); // a good copy is cached now
  net.loadReply = LOCKED;
  await page.reload();
  await expect(page.locator('#cant-open')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBe(CODE);
  expect(await page.evaluate(() => localStorage.getItem('aw.cache'))).not.toBeNull();
});

test('only a real null clears the saved code', async ({ page, net }) => {
  net.loadReply = null;
  await openUnlocked(page);
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  await expect(page.locator('#unlock-error')).toHaveText(
    "That code didn't work. Check it with Allison."
  );
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBeNull();
});

test('a save answered ok:false "locked" stays queued and is retried; other reasons are dropped', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.saveReply = { ok: false, reason: 'locked' };
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#toast')).toContainText('Saved on your phone');
  await expect(page.locator('#notice')).toHaveCount(0);
  await expect(page.locator('#unsent-line')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') as string))
  ).toHaveLength(1);

  // still locked on the next open: still queued, and not dropped
  await page.reload();
  await expect.poll(() => net.saves.length).toBe(2);
  await expect(page.locator('#unsent-line')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') as string))
  ).toHaveLength(1);

  // the throttle lifts: it goes through, once
  net.saveReply = null;
  await page.reload();
  await expect.poll(() => net.saves.length).toBe(3);
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();

  // a different ok:false reason is dropped with the message
  net.saveReply = { ok: false, reason: 'too big' };
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#notice')).toContainText("Couldn't save this one. Tell Allison.");
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
});

test('an answer answered ok:false "locked" stays queued and is retried', async ({ page, net }) => {
  net.guest = makeGuest({ questions: QUESTIONS.slice(0, 2), answered: 0 });
  await openUnlocked(page);
  await expect(page.locator('#questions-card')).toBeVisible();
  net.answerReply = { ok: false, reason: 'locked' };
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.locator('#q-answer').fill('Held answer');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#toast')).toContainText('Saved on your phone');
  await expect(page.locator('#q-text')).toHaveText('Question two?'); // moved on
  await page.getByRole('button', { name: 'Done for now' }).click();
  await expect(page.locator('#unsent-line')).toHaveText(
    "1 answer not sent yet — it'll send when you're online."
  );
  net.answerReply = null;
  await page.reload();
  await expect.poll(() => net.answers.length).toBe(2); // the held one was tried again
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
});
