import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  withRest,
  type Net,
} from './fixtures';

function setup(net: Net, program: Record<string, unknown> = makeRoundsProgram()): void {
  net.guest = makeGuest({ program, sessions: [] });
}

const pause = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Pause workout' }).click();

test('Pause opens a full-screen "Paused" with Resume and Exit', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await pause(page);
  const overlay = page.locator('#paused-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: /Exit/ })).toBeVisible();
  // it covers the screen
  const box = await overlay.boundingBox();
  const vp = page.viewportSize();
  expect(box?.width).toBe(vp?.width);
  expect(box?.height).toBe(vp?.height);
  await overlay.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#paused-overlay')).toHaveCount(0);
  await expect(page.locator('#progress-line')).toHaveText('Warm-up · 1 of 2');
});

test('Exit from Paused opens the Stop here? sheet', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await pause(page);
  await page.locator('#paused-overlay').getByRole('button', { name: /Exit/ }).click();
  await expect(page.getByRole('heading', { name: 'Stop here?' })).toBeVisible();
});

test('every timer freezes while paused: a rest does not run down', async ({ page, net }) => {
  setup(net, withRest(makeRoundsProgram(), 30));
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#rest-screen')).toBeVisible();
  await pause(page);
  const frozen = await page.locator('#rest-count').textContent();
  await page.waitForTimeout(2300);
  await expect(page.locator('#rest-count')).toHaveText(frozen as string);
  await page.getByRole('button', { name: 'Resume' }).click();
  // running again after Resume
  await expect(page.locator('#rest-count')).not.toHaveText(frozen as string, { timeout: 3000 });
});

test('a hold freezes while paused and goes on from where it was', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click(); // warm two is the timed one (20 s)
  await page.locator('#timer-btn').click();
  await expect(page.locator('#get-ready')).toBeVisible();
  await expect(page.locator('#timer-btn')).toBeVisible({ timeout: 6000 }); // the hold itself: Stop
  await expect(page.locator('#timer-btn')).toHaveText('Stop');
  await page.waitForTimeout(1200);
  await pause(page);
  const frozen = await page.locator('#timer').textContent();
  await page.waitForTimeout(2300);
  await expect(page.locator('#timer')).toHaveText(frozen as string);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#timer')).not.toHaveText(frozen as string, { timeout: 3000 });
});

test('paused time is taken out of duration_sec', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  // the workout started 10 minutes ago
  await page.locator('#time-start-fix').click();
  await page.getByRole('button', { name: '10 min ago', exact: true }).click();
  await page.locator('#before-start').click();
  await pause(page);
  // pretend the pause has lasted 6 minutes
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('aw.progress') as string);
    p.pausedAt -= 6 * 60_000;
    localStorage.setItem('aw.progress', JSON.stringify(p));
  });
  await page.reload(); // a reload while paused stays paused
  await expect(page.locator('#paused-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.locator('#time-end-ok').click(); // finished now
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { duration_sec: number; started_at: string; done_at: string };
  const wall = (Date.parse(s.done_at) - Date.parse(s.started_at)) / 1000;
  expect(wall).toBeGreaterThanOrEqual(10 * 60 - 60);
  // about 10 minutes of wall clock, minus the 6 paused: about 4 minutes
  expect(s.duration_sec).toBeGreaterThanOrEqual(4 * 60 - 70);
  expect(s.duration_sec).toBeLessThanOrEqual(4 * 60 + 70);
  expect(wall - s.duration_sec).toBeGreaterThanOrEqual(6 * 60 - 2);
});

test('ending while still paused does not leave the pause counting', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await pause(page);
  await page.locator('#paused-overlay').getByRole('button', { name: /Exit/ }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await expect(page.locator('#after-title')).toBeVisible();
  await expect(page.locator('#paused-overlay')).toHaveCount(0);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('aw.progress') as string));
  expect(p.pausedAt).toBeNull();
});

test('Pause is at least 44px, on every workout screen', async ({ page, net }) => {
  setup(net, withRest(makeRoundsProgram(), 30));
  await openUnlocked(page);
  await startWorkout(page);
  const check = async (): Promise<void> => {
    const box = await page.getByRole('button', { name: 'Pause workout' }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  };
  await check();
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#rest-screen')).toBeVisible();
  await check();
});
