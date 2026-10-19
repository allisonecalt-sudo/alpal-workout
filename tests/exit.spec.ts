import {
  CODE,
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

async function openSheet(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Exit' }).click();
  await expect(page.getByRole('heading', { name: 'Stop here?' })).toBeVisible();
}

test('Exit is on a move, a hold, a rest, the between screen and the cool-down, and opens "Stop here?"', async ({
  page,
  net,
}) => {
  setup(net, withRest(makeRoundsProgram(), 20));
  await openUnlocked(page);
  await startWorkout(page);
  const checkHere = async (): Promise<void> => {
    await openSheet(page);
    await expect(page.getByRole('button', { name: 'Log what I did' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quit without saving' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep going' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep going' }).click();
    await expect(page.locator('#exit-sheet')).toHaveCount(0);
  };
  // a move (warm-up one has reps), then a hold (warm-up two is timed)
  await checkHere();
  await page.locator('#done-btn').click();
  await expect(page.locator('#timer')).toBeVisible();
  await checkHere();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click(); // main one: now resting before main two
  await expect(page.locator('#rest-screen')).toBeVisible();
  await checkHere();
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await page.locator('#done-btn').click(); // end of round 1: between screen
  await expect(page.locator('#between-title')).toBeVisible();
  await checkHere();
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#cooldown')).toBeVisible();
  await checkHere();
});

test('Keep going changes nothing: same move, same progress', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await expect(page.locator('#progress-line')).toHaveText('Warm-up · 2 of 2');
  await openSheet(page);
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.locator('#progress-line')).toHaveText('Warm-up · 2 of 2');
  // a tap outside the card also closes it
  await openSheet(page);
  await page.locator('#exit-sheet').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#exit-sheet')).toHaveCount(0);
  expect(net.saves).toHaveLength(0);
});

test('Log what I did goes to After, marked lite, with where she stopped', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click(); // Warm one
  await page.getByRole('button', { name: 'Skip' }).click(); // Warm two
  await page.locator('#done-btn').click(); // Main one, round 1
  // now on Main two, round 1
  await expect(page.locator('#move-name')).toHaveText('Main two');
  await openSheet(page);
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await expect(page.locator('#after-title')).toHaveText('Stopped early · Workout A');
  await expect(page.locator('#after-summary')).toHaveText('0 of 2 rounds');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.saves).toHaveLength(1);
  expect(net.saves[0].p_code).toBe(CODE);
  const s = net.saves[0].p_session as Record<string, unknown>;
  expect(s.lite).toBe(true);
  expect(s.workout).toBe('A');
  expect((s.readings as Record<string, unknown>).stopped_at).toEqual({
    part: 'main',
    round: 1,
    move: 'Main two',
  });
  // only what she reached is logged
  expect(s.moves).toEqual([
    { name: 'Warm one', part: 'warmup', round: 1, status: 'done' },
    { name: 'Warm two', part: 'warmup', round: 1, status: 'skipped' },
    { name: 'Main one', part: 'main', round: 1, status: 'done' },
  ]);
});

test('Exit from the between screen and the cool-down records where she was', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#between-title')).toBeVisible();
  await openSheet(page);
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { stopped_at: unknown }; lite: boolean };
  expect(s.readings.stopped_at).toEqual({ part: 'main', round: 1, move: 'Main two' });
  expect(s.lite).toBe(true);
});

test('Exit in the cool-down: stopped_at is the cool-down', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  // Warm one, Warm two, then 4 main moves with a between screen after the 2nd
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  for (let k = 0; k < 2; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#cooldown')).toBeVisible();
  await openSheet(page);
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { stopped_at: unknown }; lite: boolean };
  expect(s.readings.stopped_at).toEqual({ part: 'cooldown', round: 1, move: null });
  expect(s.lite).toBe(true);
});

test('Quit without saving goes Home and the workout is dropped', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await openSheet(page);
  await page.getByRole('button', { name: 'Quit without saving' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aw.progress'))).toBeNull();
  expect(net.saves).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.done'))).toBeNull();
  // and a reload does not bring it back
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#up-next')).toBeVisible();
});

test('the Exit button is at least 44px and sits in the bar at every width', async ({
  page,
  net,
}) => {
  setup(net);
  for (const width of [320, 390, 402, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    if ((await page.locator('#start-btn').count()) > 0) await startWorkout(page);
    const box = await page.locator('#exit-btn').boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
  }
});
