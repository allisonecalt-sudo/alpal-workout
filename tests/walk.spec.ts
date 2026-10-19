import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type FakeSession,
} from './fixtures';

const day = (d: number, h = 9): string => new Date(2026, 9, d, h, 0, 0).toISOString();

const WORKOUT_DONE: FakeSession = {
  client_id: 'w1',
  done_at: day(12),
  duration_sec: 1800,
  week: 1,
  workout: 'A',
  feel: null,
  check_0_10: null,
};

const openWalk = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('button', { name: /Log a walk/ }).click();
  await expect(page.getByRole('heading', { name: 'Log a walk' })).toBeVisible();
};

test('Home has a Log a walk row; with no walks there is no walks line', async ({ page }) => {
  await openUnlocked(page);
  await expect(page.getByRole('button', { name: '🚶 Log a walk' })).toBeVisible();
  await expect(page.locator('#walks-line')).toHaveCount(0);
});

test('the walk timer: Start, it counts, Pause freezes it, Resume goes on', async ({ page }) => {
  await openUnlocked(page);
  await openWalk(page);
  await expect(page.locator('#walk-time')).toHaveText('00:00');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#walk-time')).not.toHaveText('00:00', { timeout: 4000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  const frozen = await page.locator('#walk-time').textContent();
  await page.waitForTimeout(2200);
  await expect(page.locator('#walk-time')).toHaveText(frozen as string);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#walk-time')).not.toHaveText(frozen as string, { timeout: 4000 });
});

test('Finish saves a walk session: workout "walk", the walked length, nothing else', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await openWalk(page);
  await page.getByRole('button', { name: 'Start' }).click();
  // pretend it has been 10 minutes
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('aw.walk') as string);
    w.startedAt -= 600_000;
    localStorage.setItem('aw.walk', JSON.stringify(w));
  });
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.saves).toHaveLength(1);
  const s = net.saves[0].p_session as Record<string, unknown>;
  expect(s).toEqual({
    client_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    done_at: expect.any(String),
    started_at: expect.any(String),
    duration_sec: expect.any(Number),
    lite: false,
    readings: {},
    week: 1,
    workout: 'walk',
    moves: [],
    feel: null,
    check_0_10: null,
    note: null,
  });
  expect(s.duration_sec as number).toBeGreaterThanOrEqual(598);
  expect(s.duration_sec as number).toBeLessThanOrEqual(606);
  expect(await page.evaluate(() => localStorage.getItem('aw.walk'))).toBeNull();
});

test('paused time is not walked time', async ({ page, net }) => {
  await openUnlocked(page);
  await openWalk(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('aw.walk') as string);
    w.startedAt -= 900_000; // started 15 min ago
    localStorage.setItem('aw.walk', JSON.stringify(w));
  });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('aw.walk') as string);
    w.pausedAt -= 600_000; // and was paused for the last 10 of them
    localStorage.setItem('aw.walk', JSON.stringify(w));
  });
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { duration_sec: number };
  // 15 minutes of wall clock, 10 of them paused: about 5 minutes walked
  expect(s.duration_sec).toBeGreaterThanOrEqual(298);
  expect(s.duration_sec).toBeLessThanOrEqual(310);
});

test('the chips: I already walked 10 · 20 · 30 · 45 min save a walk at once', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await openWalk(page);
  await expect(page.locator('#walk-chips .chip')).toHaveText([
    '10 min',
    '20 min',
    '30 min',
    '45 min',
  ]);
  await page.locator('#walk-chips .chip', { hasText: '30 min' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.saves).toHaveLength(1);
  const s = net.saves[0].p_session as {
    workout: string;
    duration_sec: number;
    started_at: string;
    done_at: string;
  };
  expect(s.workout).toBe('walk');
  expect(s.duration_sec).toBe(1800);
  expect(Date.parse(s.done_at) - Date.parse(s.started_at)).toBe(1800_000);
});

test('walks do not count toward the week: dots, words, Up next and the weeks list stay as they were', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [WORKOUT_DONE] });
  await openUnlocked(page);
  await expect(page.locator('#week-words')).toHaveText('1 of 3 this week');
  await expect(page.locator('#up-next')).toHaveText('Up next · Workout B');
  await openWalk(page);
  await page.locator('#walk-chips .chip', { hasText: '20 min' }).click();
  await expect(page.locator('#walks-line')).toHaveText('🚶 1 walk this week');
  await expect(page.locator('#week-words')).toHaveText('1 of 3 this week');
  await expect(page.locator('#dots .dot.filled')).toHaveCount(1);
  await expect(page.locator('#up-next')).toHaveText('Up next · Workout B');
  await expect(page.locator('#past-weeks li')).toHaveText(['Week 1 · A ✓ B C']);
  // a second walk: the plural
  await openWalk(page);
  await page.locator('#walk-chips .chip', { hasText: '10 min' }).click();
  await expect(page.locator('#walks-line')).toHaveText('🚶 2 walks this week');
  await expect(page.locator('#done-today')).toHaveCount(0); // a walk is not a workout "Done" card
});

test('a walk shows in Your sessions with the walking badge', async ({ page }) => {
  await openUnlocked(page);
  await openWalk(page);
  await page.locator('#walk-chips .chip', { hasText: '20 min' }).click();
  await page.getByRole('button', { name: /Your sessions/ }).click();
  await expect(page.locator('.session-row .s-badge').first()).toHaveText('🚶');
});

test('a walk logged offline waits on the phone and is sent once online', async ({ page, net }) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await openWalk(page);
  await page.locator('#walk-chips .chip', { hasText: '45 min' }).click();
  await expect(page.locator('#unsent-line')).toHaveText(
    "1 workout not sent yet — it'll send when you're online."
  );
  await expect(page.locator('#walks-line')).toHaveText('🚶 1 walk this week');
  net.online = true;
  await page.reload();
  await expect.poll(() => net.saves.length).toBe(1);
  expect((net.saves[0].p_session as { workout: string }).workout).toBe('walk');
});

test('a walk in progress survives a reload, and Home says one is running', async ({ page }) => {
  await openUnlocked(page);
  await openWalk(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '🚶 A walk is running' })).toBeVisible();
  await page.getByRole('button', { name: /A walk is running/ }).click();
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
  await expect(page.locator('#walk-time')).not.toHaveText('00:00');
});

test('‹ Home leaves a running walk running', async ({ page }) => {
  await openUnlocked(page);
  await openWalk(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: '‹ Home' }).click();
  await expect(page.getByRole('button', { name: /A walk is running/ })).toBeVisible();
});

test('a workout can still be done with a walk running (separate things)', async ({ page }) => {
  await openUnlocked(page);
  await openWalk(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: '‹ Home' }).click();
  await startWorkout(page);
  await expect(page.locator('#move-name')).toBeVisible();
});

for (const width of [320, 390, 402, 430]) {
  test(`the walk screen has no sideways scroll at ${width}px, buttons 44px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await openWalk(page);
    await page.getByRole('button', { name: 'Start' }).click();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button').all()) {
      if (!(await b.isVisible())) continue;
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
