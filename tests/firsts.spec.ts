import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type FakeSession,
} from './fixtures';

const earlier = (names: string[], status = 'done'): FakeSession => ({
  client_id: 'old-1',
  done_at: new Date(2026, 9, 12, 9, 0).toISOString(),
  week: 0,
  workout: 'A',
  feel: null,
  check_0_10: null,
  moves: names.map((name) => ({ name, part: 'warmup', round: 1, status })),
});

async function doWarmupsAndSave(page: import('@playwright/test').Page, n = 2): Promise<void> {
  await startWorkout(page);
  for (let k = 0; k < n; k++) await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#done-today')).toBeVisible();
}

test('the Done card lists moves done for the first time ever', async ({ page, net }) => {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [earlier(['Warm one'])] });
  await openUnlocked(page);
  await doWarmupsAndSave(page);
  await expect(page.locator('#firsts')).toHaveText('Firsts: Warm two');
  await expect(page.locator('#done-today')).toContainText('Done ✓ · Workout A');
});

test('with no history every move done is a first; each name once', async ({ page, net }) => {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [] });
  await openUnlocked(page);
  await doWarmupsAndSave(page);
  await expect(page.locator('#firsts')).toHaveText('Firsts: Warm one, Warm two');
});

test('nothing new means no Firsts line', async ({ page, net }) => {
  net.guest = makeGuest({
    program: makeRoundsProgram(),
    sessions: [earlier(['Warm one', 'Warm two'])],
  });
  await openUnlocked(page);
  await doWarmupsAndSave(page);
  await expect(page.locator('#firsts')).toHaveCount(0);
});

test('a move only skipped or hurt before is a first when done now', async ({ page, net }) => {
  net.guest = makeGuest({
    program: makeRoundsProgram(),
    sessions: [earlier(['Warm one', 'Warm two'], 'skipped')],
  });
  await openUnlocked(page);
  await doWarmupsAndSave(page);
  await expect(page.locator('#firsts')).toHaveText('Firsts: Warm one, Warm two');
});

test('a move skipped now is not a first', async ({ page, net }) => {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [] });
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click(); // Warm one: done
  await page.getByRole('button', { name: 'Skip' }).click(); // Warm two: skipped
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#firsts')).toHaveText('Firsts: Warm one');
});

test('a long list shows five and says how many more', async ({ page, net }) => {
  const program = makeRoundsProgram();
  const a = (program.workouts as Record<string, unknown>[])[0];
  a.warmup = Array.from({ length: 7 }, (_, k) => ({
    name: `Warm ${k + 1}`,
    how: ['x'],
    reps: '5 times',
  }));
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await doWarmupsAndSave(page, 7);
  await expect(page.locator('#firsts')).toHaveText(
    'Firsts: Warm 1, Warm 2, Warm 3, Warm 4, Warm 5 and 2 more'
  );
});

test('a session saved while offline still shows its Firsts, and they survive a reload', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [] });
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#firsts')).toHaveText('Firsts: Warm one');
  await page.reload();
  await expect(page.locator('#firsts')).toHaveText('Firsts: Warm one');
});

test('the Firsts line wraps long names at 320px without sideways scroll', async ({ page, net }) => {
  const program = makeRoundsProgram();
  (program.workouts as { warmup: { name: string }[] }[])[0].warmup[0].name = 'N'.repeat(80);
  net.guest = makeGuest({ program, sessions: [] });
  await page.setViewportSize({ width: 320, height: 640 });
  await openUnlocked(page);
  await doWarmupsAndSave(page);
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(over).toBeLessThanOrEqual(0);
});
