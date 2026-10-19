import {
  CODE,
  expect,
  makeGuest,
  makeProgram,
  openUnlocked,
  PHONE,
  runWorkout,
  test,
  startWorkout,
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

test('saving online sends the exact RPC body, every field, and returns Home with the dot filled', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({ program: makeProgram({ checkLabel: 'Test check' }) });
  await openUnlocked(page);
  await expect(page.locator('#week-words')).toHaveText('1 of 3 this week');
  await page.locator('#start-btn').click();
  await page.locator('#before-body [data-value="6"]').click();
  await page.locator('#before-mood [data-value="7"]').click();
  await page.locator('#before-check [data-value="1"]').click();
  await page.locator('#time-start-fix').click();
  await page.locator('#time-start-input').fill('07:30');
  await page.locator('#time-start-ok').click();
  await page.locator('#before-start').click();
  await page.locator('#done-btn').click(); // Move one: done
  await page.getByRole('button', { name: 'Skip' }).click(); // Move two: skipped
  await page.getByRole('button', { name: 'This hurts' }).click(); // Move three: hurt
  await expect(page.locator('#redo-title')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.locator('#after-body [data-value="5"]').click();
  await page.locator('#after-mood [data-value="8"]').click();
  await page.locator('[data-feel="right"]').click();
  await page.locator('#check-chips [data-value="3"]').click();
  await page.locator('#time-end-fix').click();
  await page.locator('#time-end-input').fill('08:10');
  await page.locator('#time-end-ok').click();
  await page.locator('#note').fill('Test note');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('#week-words')).toHaveText('2 of 3 this week');
  await expect(page.locator('#dots .dot.filled')).toHaveCount(2);
  expect(net.saves).toHaveLength(1);
  const call = net.saves[0];
  expect(call.p_code).toBe(CODE);
  const at = (h: number, m: number): Promise<string> =>
    page.evaluate(
      ([hh, mm]) => {
        const d = new Date();
        d.setHours(hh, mm, 0, 0);
        return d.toISOString();
      },
      [h, m]
    );
  expect(call.p_session).toEqual({
    client_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    done_at: await at(8, 10),
    started_at: await at(7, 30),
    duration_sec: 40 * 60,
    lite: false,
    readings: { before: { body: 6, mood: 7, check: 1 }, after: { body: 5, mood: 8 } },
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

test('After: the title, the summary line and the skipped count', async ({ page, net }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#redo-title')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#after-title')).toHaveText('Nice. Week 1 done.');
  await expect(page.locator('#after-summary')).toHaveText('1 round · 2 of 3 this week');
  await expect(page.locator('#after-skipped')).toHaveText('2 moves skipped');
  void net;
});

test('After: one skipped move is singular, none shows no line', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#redo-title')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#after-skipped')).toHaveText('1 move skipped');
  await page.reload();
  await expect(page.locator('#after-skipped')).toHaveText('1 move skipped');
});

test('After: no skipped moves means no line', async ({ page }) => {
  await openUnlocked(page);
  await runWorkout(page);
  await expect(page.locator('#after-skipped')).toHaveCount(0);
});

test('After: the time line and the About-minutes line', async ({ page }) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#time-start-fix').click();
  await page.locator('#time-start-input').fill('07:30');
  await page.locator('#time-start-ok').click();
  await page.locator('#before-start').click();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await expect(page.locator('#time-end')).toHaveText(/^Finished · \d{1,2}:\d{2}\. Right\?$/);
  await page.locator('#time-end-fix').click();
  await page.locator('#time-end-input').fill('08:01');
  await expect(page.locator('#time-end')).toHaveText('Finished · 8:01. Right?');
  await expect(page.locator('#after-duration')).toHaveText('About 31 min');
  await page.locator('#time-end-ok').click();
  await expect(page.locator('#time-end')).toHaveText('Finished 8:01 ✓');
  await expect(page.locator('#time-warn')).toHaveText('');
  // the chips
  await page.locator('#time-end-fix').click();
  for (const m of ['5 min ago', '10 min ago', '15 min ago']) {
    await expect(page.getByRole('button', { name: m, exact: true })).toBeVisible();
  }
});

test('After: a finish before the start gets a gentle warning, and it clears when fixed', async ({
  page,
}) => {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#time-start-fix').click();
  await page.locator('#time-start-input').fill('09:00');
  await page.locator('#time-start-ok').click();
  await page.locator('#before-start').click();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.locator('#time-end-fix').click();
  await page.locator('#time-end-input').fill('08:00');
  await expect(page.locator('#time-warn')).toHaveText("That's before you started. Check the time.");
  await page.locator('#time-end-input').fill('09:30');
  await expect(page.locator('#time-warn')).toHaveText('');
  await expect(page.locator('#after-duration')).toHaveText('About 30 min');
});

test('After: body, mood, the check, feel and the note survive a reload', async ({ page, net }) => {
  net.guest = makeGuest({ program: makeProgram({ checkLabel: 'Test check' }) });
  await openUnlocked(page);
  await runWorkout(page);
  await page.locator('#after-body [data-value="4"]').click();
  await page.locator('#after-mood [data-value="9"]').click();
  await page.locator('#check-chips [data-value="0"]').click();
  await page.locator('[data-feel="hard"]').click();
  await page.locator('#note').fill('A note I typed, 123');
  await page.locator('#time-end-ok').click();
  await page.reload();
  await expect(page.locator('#after-title')).toBeVisible();
  await expect(page.locator('#note')).toHaveValue('A note I typed, 123');
  await expect(page.locator('#after-body [aria-pressed="true"]')).toHaveText('4');
  await expect(page.locator('#after-mood [aria-pressed="true"]')).toHaveText('9');
  await expect(page.locator('#check-chips [aria-pressed="true"]')).toHaveText('0');
  await expect(page.locator('[data-feel="hard"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#time-end')).toHaveText(/^Finished \d{1,2}:\d{2} ✓$/);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.saves[0].p_session).toMatchObject({
    feel: 'hard',
    check_0_10: 0,
    note: 'A note I typed, 123',
    readings: { after: { body: 4, mood: 9 } },
  });
});

test('After: a second tap clears body and mood, and nothing is sent for them', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await runWorkout(page);
  await page.locator('#after-body [data-value="4"]').click();
  await page.locator('#after-body [data-value="4"]').click();
  await expect(page.locator('#after-body [aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(
    (net.saves[0].p_session as { readings: Record<string, unknown> }).readings.after
  ).toBeUndefined();
});

for (const width of [320, 390, 402, 430]) {
  test(`After has no sideways scroll at ${width}px, and every button is 44px`, async ({
    page,
    net,
  }) => {
    net.guest = makeGuest({ program: makeProgram({ checkLabel: 'Test check' }) });
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await runWorkout(page);
    await page.locator('#time-end-fix').click(); // the longest version
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button').all()) {
      if (!(await b.isVisible())) continue;
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}

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
  await expect(page.locator('#after-title')).toBeVisible();
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

test('After: an unconfirmed finish time never drifts: fixed when After appeared, kept through a reload', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 9, 19, 9, 4, 30) });
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await expect(page.locator('#time-end')).toHaveText('Finished · 9:04. Right?');
  await page.clock.fastForward(5 * 60_000);
  await expect(page.locator('#time-end')).toHaveText('Finished · 9:04. Right?');
  await page.reload();
  await expect(page.locator('#time-end')).toHaveText('Finished · 9:04. Right?');
  // Right confirms it, and it stays
  await page.locator('#time-end-ok').click();
  await expect(page.locator('#time-end')).toHaveText('Finished 9:04 ✓');
});

test('After: hurt moves count in the skipped line, and say so', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'This hurts' }).click();
  // the skipped one is offered again first (round 2 asks); the hurt one is not
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#after-skipped')).toHaveText('2 moves skipped (1 because it hurt)');
});

test('After: only a hurt move is still "1 move skipped (1 because it hurt)"', async ({ page }) => {
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'This hurts' }).click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#after-skipped')).toHaveText('1 move skipped (1 because it hurt)');
});
