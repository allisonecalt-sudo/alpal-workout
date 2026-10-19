import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

function setup(net: Net, sessions: Parameters<typeof makeGuest>[0] = {}): void {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [], ...sessions });
}

const HOURS = 3600_000;

/** Make the stored workout look as if it was last touched `hours` ago. */
async function age(page: import('@playwright/test').Page, hours: number): Promise<number> {
  return page.evaluate((ms) => {
    const p = JSON.parse(localStorage.getItem('aw.progress') as string);
    p.lastActiveAt -= ms;
    p.startedAt -= ms;
    p.createdAt -= ms;
    localStorage.setItem('aw.progress', JSON.stringify(p));
    return p.startedAt as number;
  }, hours * HOURS);
}

/** "Mon 9:12" the way the app writes it. */
function dayClock(page: import('@playwright/test').Page, ms: number): Promise<string> {
  return page.evaluate((t) => {
    const d = new Date(t);
    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${day} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, ms);
}

async function leaveOneOpen(page: import('@playwright/test').Page, hours = 4): Promise<number> {
  await startWorkout(page);
  await page.locator('#done-btn').click(); // Warm one done: now on Warm two
  const startedAt = await age(page, hours);
  await page.reload();
  return startedAt;
}

test('a workout left open for hours is offered back on Home, never resumed or deleted silently', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  const startedAt = await leaveOneOpen(page);
  const card = page.locator('#left-open');
  await expect(card).toBeVisible();
  await expect(page.locator('#left-open-text')).toHaveText(
    `You left Workout A open (started ${await dayClock(page, startedAt)}). Did you do it?`
  );
  await expect(card.getByRole('button', { name: 'Yes, save it' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'No, throw it away' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Keep going' })).toBeVisible();
  // it did not jump into the workout, and nothing was thrown away yet
  await expect(page.locator('#move-name')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.progress'))).not.toBeNull();
  // the card stays through a redraw until she answers
  await page.locator('#chips-line .chip').first().click();
  await expect(page.locator('#left-open')).toBeVisible();
});

test('Yes, save it: After with the times prefilled, marked stopped early, and it saves', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  const startedAt = await leaveOneOpen(page);
  await page.getByRole('button', { name: 'Yes, save it' }).click();
  await expect(page.locator('#after-title')).toHaveText('Stopped early · Workout A');
  // the finish time is from when she was last active (about 4 hours ago), not now
  const lastActive = await page.evaluate(
    () => JSON.parse(localStorage.getItem('aw.progress') as string).endedAt as number
  );
  expect(Date.now() - lastActive).toBeGreaterThan(3 * HOURS);
  // the guessed finish is NOT confirmed: Right and Fix are offered
  await expect(page.locator('#time-end')).toHaveText(/^Finished · \d{1,2}:\d{2}\. Right\?$/);
  await expect(page.locator('#time-end-ok')).toBeVisible();
  await expect(page.locator('#time-end-fix')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as {
    started_at: string;
    done_at: string;
    lite: boolean;
    moves: unknown[];
    readings: { stopped_at: unknown };
  };
  expect(Date.parse(s.started_at)).toBe(startedAt);
  expect(Date.parse(s.done_at)).toBeGreaterThanOrEqual(startedAt);
  expect(Date.now() - Date.parse(s.done_at)).toBeGreaterThan(3 * HOURS);
  expect(s.lite).toBe(true);
  expect(s.moves).toEqual([{ name: 'Warm one', part: 'warmup', round: 1, status: 'done' }]);
  expect(s.readings.stopped_at).toEqual({ part: 'warmup', round: 1, move: 'Warm two' });
});

test('No, throw it away: the workout is dropped and Home is normal', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await leaveOneOpen(page);
  await page.getByRole('button', { name: 'No, throw it away' }).click();
  await expect(page.locator('#left-open')).toHaveCount(0);
  await expect(page.locator('#up-next')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aw.progress'))).toBeNull();
  expect(net.saves).toHaveLength(0);
  await page.reload();
  await expect(page.locator('#left-open')).toHaveCount(0);
});

test('Keep going: back in the workout at the same move', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await leaveOneOpen(page);
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.locator('#move-name')).toHaveText('Warm two');
  await expect(page.locator('#progress-line')).toHaveText('Warm-up · 2 of 2');
  // it is fresh again: a reload resumes it instead of asking again
  await page.reload();
  await expect(page.locator('#move-name')).toHaveText('Warm two');
});

test('a workout left open for under 3 hours simply resumes', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await leaveOneOpen(page, 2.9);
  await expect(page.locator('#left-open')).toHaveCount(0);
  await expect(page.locator('#move-name')).toHaveText('Warm two');
});

test('a Before screen left for hours is just forgotten (nothing was started)', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await age(page, 5);
  await page.reload();
  await expect(page.locator('#left-open')).toHaveCount(0);
  await expect(page.locator('#greeting')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aw.progress'))).toBeNull();
});

test('left open on the After screen: Yes goes straight back to After as it was', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.locator('#note').fill('typed before');
  await age(page, 4);
  await page.reload();
  await expect(page.locator('#left-open')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, save it' }).click();
  await expect(page.locator('#after-title')).toBeVisible();
  await expect(page.locator('#note')).toHaveValue('typed before');
});

test('a workout from an earlier program week is dropped, not offered', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('aw.progress') as string);
    p.week = 0;
    localStorage.setItem('aw.progress', JSON.stringify(p));
  });
  await page.reload();
  await expect(page.locator('#left-open')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.progress'))).toBeNull();
});

// ---- the Done card ----

test('after a save, Home shows "Done ✓ · Workout A · 1 of 3 this week" until midnight', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#done-today')).toHaveCount(0);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  const card = page.locator('#done-today');
  await expect(card).toHaveText('Done ✓ · Workout A · 1 of 3 this week');
  // it sits above Up next
  const doneY = (await card.boundingBox())?.y ?? 0;
  const nextY = (await page.locator('#up-next').boundingBox())?.y ?? 0;
  expect(doneY).toBeLessThan(nextY);
  // and stays through a reload on the same day
  await page.reload();
  // (the stubbed store does not keep the saved session, so only the start of the line is checked)
  await expect(page.locator('#done-today')).toContainText('Done ✓ · Workout A · ');
});

test('the Done card is gone the next day', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  await page.evaluate(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    y.setHours(23, 59, 0, 0);
    localStorage.setItem('aw.done', JSON.stringify({ workoutId: 'A', at: y.getTime() }));
  });
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#done-today')).toHaveCount(0);
  // a minute after midnight today: shown
  await page.evaluate(() => {
    const t = new Date();
    t.setHours(0, 1, 0, 0);
    localStorage.setItem('aw.done', JSON.stringify({ workoutId: 'A', at: t.getTime() }));
  });
  await page.reload();
  await expect(page.locator('#done-today')).toBeVisible();
});

test('the Done card also shows when the save is waiting for a connection', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#unsent-line')).toBeVisible();
  await expect(page.locator('#done-today')).toHaveText('Done ✓ · Workout A · 1 of 3 this week');
});

test('a refused save shows no Done card', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.saveReply = { ok: false, reason: 'too big' };
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#done-today')).toHaveCount(0);
});

for (const width of [320, 390, 402, 430]) {
  test(`the left-open and Done cards have no sideways scroll at ${width}px, buttons 44px`, async ({
    page,
    net,
  }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await page.evaluate(() => {
      localStorage.setItem('aw.done', JSON.stringify({ workoutId: 'A', at: Date.now() }));
    });
    await leaveOneOpen(page);
    await expect(page.locator('#left-open')).toBeVisible();
    await expect(page.locator('#done-today')).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const b of await page.locator('#left-open button').all()) {
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}

test('the guessed finish is pinned: it does not follow the clock, even after minutes pass or a reload', async ({
  page,
  net,
}) => {
  setup(net);
  await page.clock.install({ time: new Date() });
  await openUnlocked(page);
  await leaveOneOpen(page);
  await page.getByRole('button', { name: 'Yes, save it' }).click();
  const line = page.locator('#time-end');
  await expect(line).toHaveText(/^Finished · \d{1,2}:\d{2}\. Right\?$/);
  const first = await line.textContent();
  await page.clock.fastForward(6 * 60_000);
  await expect(line).toHaveText(first as string);
  await page.reload();
  await expect(page.locator('#time-end')).toHaveText(first as string);
});
