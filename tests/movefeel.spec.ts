import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

type W = { warmup: Record<string, unknown>[]; main: Record<string, unknown>[] };

function setup(net: Net, flag: (w: W) => void): void {
  const program = makeRoundsProgram();
  flag((program.workouts as W[])[0]);
  net.guest = makeGuest({ program, sessions: [] });
}

test('a new move carries a "New this week" badge and a stepped one "Stepped up"', async ({
  page,
  net,
}) => {
  setup(net, (w) => {
    w.warmup[0].new = true;
    w.warmup[1].stepped = true;
  });
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#badge-new')).toHaveText('New this week');
  await expect(page.locator('#badge-stepped')).toHaveCount(0);
  await page.locator('#done-btn').click();
  // (the move feel question for the new move comes first)
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#badge-stepped')).toHaveText('Stepped up');
  await expect(page.locator('#badge-new')).toHaveCount(0);
});

test('a plain move has no badge', async ({ page, net }) => {
  setup(net, () => undefined);
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#move-name')).toBeVisible();
  await expect(page.locator('.badge')).toHaveCount(0);
});

test('the Before screen names the new moves, and says nothing when there are none', async ({
  page,
  net,
}) => {
  setup(net, (w) => {
    w.warmup[0].new = true;
    w.main[1].new = true;
    w.main[0].stepped = true; // stepped moves are not "new this week"
  });
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await expect(page.locator('#before-new')).toHaveText('new this week: Warm one, Main two');
});

test('no new moves: no meta line', async ({ page, net }) => {
  setup(net, () => undefined);
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await expect(page.locator('#before-start')).toBeVisible();
  await expect(page.locator('#before-new')).toHaveCount(0);
});

test('after the LAST round of a flagged move: Easy · Just right · Hard, saved by move name', async ({
  page,
  net,
}) => {
  setup(net, (w) => (w.main[0].new = true)); // Main one: 2 rounds
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click(); // warm-ups
  await page.locator('#done-btn').click(); // Main one, round 1: not the last round
  await expect(page.locator('#move-feel')).toHaveCount(0);
  await expect(page.locator('#move-name')).toHaveText('Main two');
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.locator('#done-btn').click(); // Main one, round 2: the last
  await expect(page.locator('#move-feel-title')).toHaveText('How was Main one?');
  await expect(page.locator('#move-feel .chip')).toHaveText(['Easy', 'Just right', 'Hard']);
  await page.locator('#move-feel [data-feel="hard"]').click();
  await expect(page.locator('#move-name')).toHaveText('Main two');
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Done stretching ✓' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { move_feel: Record<string, string> } };
  expect(s.readings.move_feel).toEqual({ 'Main one': 'hard' });
});

test('a warm-up move flagged stepped asks once, after its only round', async ({ page, net }) => {
  setup(net, (w) => (w.warmup[0].stepped = true));
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await expect(page.locator('#move-feel-title')).toHaveText('How was Warm one?');
  await page.locator('#move-feel [data-feel="easy"]').click();
  await expect(page.locator('#move-name')).toHaveText('Warm two');
});

test('Skip leaves nothing saved; skipped and hurt moves are not asked about', async ({
  page,
  net,
}) => {
  setup(net, (w) => {
    w.warmup[0].new = true;
    w.warmup[1].new = true;
  });
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'This hurts' }).click(); // Warm one: hurt: no question
  await expect(page.locator('#move-feel')).toHaveCount(0);
  await page.locator('#done-btn').click(); // Warm two (a hold): done, so it asks
  await expect(page.locator('#move-feel-title')).toHaveText('How was Warm two?');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page
    .getByRole('button', { name: 'Finish now' })
    .click({ timeout: 100 })
    .catch(() => undefined);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: Record<string, unknown> };
  expect(s.readings.move_feel).toBeUndefined();
});

test('the question comes back after a reload, and Back goes to the move', async ({ page, net }) => {
  setup(net, (w) => (w.warmup[0].new = true));
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await expect(page.locator('#move-feel')).toBeVisible();
  await page.reload();
  await expect(page.locator('#move-feel-title')).toHaveText('How was Warm one?');
  await page.getByRole('button', { name: 'Back one step' }).click();
  await expect(page.locator('#move-name')).toHaveText('Warm one');
  await expect(page.locator('#move-feel')).toHaveCount(0);
});

test('a flagged last move of the workout still asks before the cool-down', async ({
  page,
  net,
}) => {
  setup(net, (w) => (w.main[1].stepped = true));
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click(); // Main two, the last step and the last round
  await expect(page.locator('#move-feel-title')).toHaveText('How was Main two?');
  await page.locator('#move-feel [data-feel="right"]').click();
  await expect(page.locator('#cooldown')).toBeVisible();
});

for (const width of [320, 390, 402, 430]) {
  test(`badges and the feel question have no sideways scroll at ${width}px, chips 44px`, async ({
    page,
    net,
  }) => {
    setup(net, (w) => {
      w.warmup[0].new = true;
      w.warmup[0].stepped = true;
      w.warmup[0].name = 'N'.repeat(60);
    });
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await startWorkout(page);
    const over = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    expect(await over()).toBeLessThanOrEqual(0);
    await page.locator('#done-btn').click();
    await expect(page.locator('#move-feel')).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(0);
    for (const b of await page.locator('#move-feel button, #move-feel-skip').all()) {
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
