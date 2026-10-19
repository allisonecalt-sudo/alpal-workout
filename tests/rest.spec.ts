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

function setup(net: Net, rest: number | null): void {
  const program = makeRoundsProgram();
  if (rest !== null) withRest(program, rest);
  net.guest = makeGuest({ program, sessions: [] });
}

test('a rest appears between main moves: ring, count, what is next, Skip rest', async ({
  page,
  net,
}) => {
  setup(net, 30);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  // no rest after the warm-up moves: straight to the first main move
  await expect(page.locator('#move-name')).toHaveText('Main one');
  await page.locator('#done-btn').click();
  const rest = page.locator('#rest-screen');
  await expect(rest).toBeVisible();
  await expect(page.locator('#rest-ring')).toHaveCount(1);
  await expect(page.locator('#rest-count')).toHaveText(/^(29|30)$/);
  await expect(page.locator('#rest-next')).toHaveText('Next · Main two · 5 each side');
  await expect(page.getByRole('button', { name: 'Skip rest' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back one step' })).toBeVisible();
  await expect(page.locator('#rest-count')).not.toHaveText(/^(29|30)$/, { timeout: 4000 });
});

test('Skip rest goes straight on to the next move', async ({ page, net }) => {
  setup(net, 30);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await expect(page.locator('#rest-screen')).toHaveCount(0);
  await expect(page.locator('#move-name')).toHaveText('Main two');
  await expect(page.locator('#progress-line')).toHaveText('Round 1 of 2 · move 2 of 2');
});

test('a rest ends on its own and the next move appears', async ({ page, net }) => {
  setup(net, 2);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#rest-screen')).toBeVisible();
  await expect(page.locator('#move-name')).toHaveText('Main two', { timeout: 6000 });
});

test('no rest after the last move of a round, nor after the last move of the workout', async ({
  page,
  net,
}) => {
  setup(net, 2);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await page.locator('#done-btn').click(); // last move of round 1
  await expect(page.locator('#rest-screen')).toHaveCount(0);
  await expect(page.locator('#between-title')).toBeVisible();
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await page.locator('#done-btn').click(); // the last main move
  await expect(page.locator('#rest-screen')).toHaveCount(0);
  await expect(page.locator('#cooldown')).toBeVisible();
});

test('no restSeconds in the data means no rest', async ({ page, net }) => {
  setup(net, null);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#rest-screen')).toHaveCount(0);
  await expect(page.locator('#move-name')).toHaveText('Main two');
});

test('a reload during a rest keeps it, and a rest that ran out while closed is over', async ({
  page,
  net,
}) => {
  setup(net, 30);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#rest-screen')).toBeVisible();
  await page.reload();
  await expect(page.locator('#rest-screen')).toBeVisible();
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('aw.progress') as string);
    p.rest.startedAt -= 120_000;
    localStorage.setItem('aw.progress', JSON.stringify(p));
  });
  await page.reload();
  await expect(page.locator('#rest-screen')).toHaveCount(0);
  await expect(page.locator('#move-name')).toHaveText('Main two');
});

for (const width of [320, 390, 402, 430]) {
  test(`the rest screen has no sideways scroll at ${width}px`, async ({ page, net }) => {
    setup(net, 30);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await startWorkout(page);
    for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
    await expect(page.locator('#rest-screen')).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button').all()) {
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
