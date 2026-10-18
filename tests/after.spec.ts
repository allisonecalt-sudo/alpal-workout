import {
  CODE,
  expect,
  makeGuest,
  makeProgram,
  openUnlocked,
  PHONE,
  runWorkout,
  test,
} from './fixtures';

test('After shows the three answers, all optional', async ({ page }) => {
  await openUnlocked(page);
  await runWorkout(page);
  await expect(page.getByText('How was it?')).toBeVisible();
  await expect(page.locator('#feel-chips .chip')).toHaveText(['Easy', 'Just right', 'Hard']);
  await expect(page.locator('#check-chips .chip')).toHaveCount(11);
  await expect(page.locator('#check-chips .chip').first()).toHaveText('0');
  await expect(page.locator('#check-chips .chip').last()).toHaveText('10');
  await expect(page.getByText('Anything to tell Allison?')).toBeVisible();
  await expect(page.locator('#note')).toHaveAttribute('dir', 'auto');
  // the check-in label is neutral unless the store supplies its own words
  await expect(page.getByRole('heading', { name: 'Check-in' })).toBeVisible();
});

test('the check-in label can come from the store', async ({ page, net }) => {
  net.guest = makeGuest({ program: makeProgram({ checkLabel: 'Test label today' }) });
  await openUnlocked(page);
  await runWorkout(page);
  await expect(page.getByRole('heading', { name: 'Test label today' })).toBeVisible();
});

test('saving online sends the exact RPC body and returns Home with the dot filled', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#week-words')).toHaveText('1 of 3 this week');
  await page.locator('#start-btn').click();
  await page.locator('#done-btn').click(); // Move one: done
  await page.getByRole('button', { name: 'Skip' }).click(); // Move two: skipped
  await page.getByRole('button', { name: 'This hurts' }).click(); // Move three: hurt
  await page.locator('[data-feel="right"]').click();
  await page.locator('[data-check="3"]').click();
  await page.locator('#note').fill('Test note');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('#week-words')).toHaveText('2 of 3 this week');
  await expect(page.locator('#dots .dot.filled')).toHaveCount(2);
  expect(net.saves).toHaveLength(1);
  const call = net.saves[0];
  expect(call.p_code).toBe(CODE);
  expect(call.p_session).toEqual({
    client_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    done_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
    week: 1,
    workout: 'A',
    moves: [
      { name: 'Move one', part: 'main', round: 1, status: 'done' },
      { name: 'Move two', part: 'main', round: 1, status: 'skipped' },
      { name: 'Move three', part: 'main', round: 1, status: 'hurt' },
    ],
    feel: 'right',
    check_0_10: 3,
    note: 'Test note',
  });
  // nothing waiting on the phone, and the workout is cleared
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('aw.progress'))).toBeNull();
  await expect(page.locator('#past-weeks li')).toHaveText(['Week 1 · 2 of 3']);
});

test('every answer is optional: empty answers are sent as nulls', async ({ page, net }) => {
  await openUnlocked(page);
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#week-words')).toHaveText('2 of 3 this week');
  expect(net.saves[0].p_session).toMatchObject({ feel: null, check_0_10: null, note: null });
});

test('tapping a chip twice clears it', async ({ page, net }) => {
  await openUnlocked(page);
  await runWorkout(page);
  await page.locator('[data-feel="hard"]').click();
  await expect(page.locator('[data-feel="hard"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-feel="easy"]').click();
  await expect(page.locator('[data-feel="hard"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-feel="easy"]').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#week-words')).toBeVisible();
  expect(net.saves[0].p_session).toMatchObject({ feel: null });
});

test('offline: the session is kept on the phone, then sent once on the next open', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible(); // loaded while online
  net.online = false;
  await runWorkout(page);
  await page.locator('[data-feel="easy"]').click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('#toast')).toHaveText(
    "Saved on your phone. It'll send when you're online."
  );
  await expect(page.locator('#week-words')).toHaveText('2 of 3 this week'); // dot filled at once
  expect(net.saves).toHaveLength(0);
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') as string));
  expect(queued).toHaveLength(1);
  const clientId = queued[0].client_id as string;

  // still offline on the next open: it stays queued, nothing is lost
  await page.reload();
  await expect(page.locator('#week-words')).toHaveText('2 of 3 this week'); // last good copy + the queued one
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') as string))
  ).toHaveLength(1);

  // back online: the next open sends it, once
  net.online = true;
  await page.reload();
  await expect.poll(() => net.saves.length).toBe(1);
  expect(net.saves[0].p_code).toBe(CODE);
  expect(net.saves[0].p_session).toMatchObject({ client_id: clientId, feel: 'easy' });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();

  // and never again
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  await page.waitForTimeout(500);
  expect(net.saves).toHaveLength(1);
  expect(net.stored.size).toBe(1);
});

test('a refused save (ok:false) is not queued: a message and the Tell button instead', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.saveReply = { ok: false, reason: 'limit' };
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#notice')).toContainText("Couldn't save this one. Tell Allison.");
  await expect(page.locator('#notice-tell')).toHaveAttribute(
    'href',
    `https://wa.me/${PHONE.replace(/\D/g, '')}?text=About%20my%20workout%20app%3A%20`
  );
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
  expect(net.saves).toHaveLength(1);
  // the message is shown once
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#notice')).toHaveCount(0);
  expect(net.saves).toHaveLength(1);
});

test('a queued session the store later refuses is dropped, with the same message', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#unsent-line')).toBeVisible();
  net.online = true;
  net.saveReply = { ok: false, reason: 'bad_code' };
  await page.reload();
  await expect(page.locator('#notice')).toContainText("Couldn't save this one. Tell Allison.");
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
  expect(net.saves).toHaveLength(1);
});

test('while anything is unsent, Home says so quietly, in the singular and the plural', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  net.online = false;
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#unsent-line')).toHaveText(
    "1 workout not sent yet — it'll send when you're online."
  );
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#unsent-line')).toHaveText(
    "2 workouts not sent yet — it'll send when you're online."
  );
  net.online = true;
  await page.reload();
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(net.saves).toHaveLength(2);
});

test('the store is only ever called with POST, and the code is never in a URL', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#week-words')).toBeVisible();
  expect(net.requests.length).toBeGreaterThanOrEqual(2);
  for (const r of net.requests) {
    expect(r.method).toBe('POST');
    expect(r.url).not.toContain(CODE);
    expect(r.url).not.toContain('?');
  }
  expect(net.requests.map((r) => new URL(r.url).pathname)).toEqual([
    '/rest/v1/rpc/guest_load',
    '/rest/v1/rpc/guest_save_session',
  ]);
  // the default schema sends no profile header
  for (const r of net.requests) {
    expect(r.headers['content-profile']).toBeUndefined();
    expect(r.headers['accept-profile']).toBeUndefined();
    expect(r.headers['apikey']).toBeTruthy();
  }
});

test('a reload on the After screen does not lose the finished workout', async ({ page }) => {
  await openUnlocked(page);
  await runWorkout(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Done! 🎉' })).toBeVisible();
});

test('a note is sent as plain text, whatever it contains', async ({ page, net }) => {
  await openUnlocked(page);
  await runWorkout(page);
  await page.locator('#note').fill('<b>hi</b> & "quotes"');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#week-words')).toBeVisible();
  expect(net.saves[0].p_session.note).toBe('<b>hi</b> & "quotes"');
});

test('coming back online sends the queue without reopening the app', async ({ page, net }) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#unsent-line')).toBeVisible();
  expect(net.saves).toHaveLength(0);
  // the phone gets a connection back: the browser fires "online"
  net.online = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => net.saves.length).toBe(1);
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
  // and a second "online" event does not send it again
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(400);
  expect(net.saves).toHaveLength(1);
});
