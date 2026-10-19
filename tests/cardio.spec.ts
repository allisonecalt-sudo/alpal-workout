import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

function cardioProgram(): Record<string, unknown> {
  const p = makeRoundsProgram();
  const a = (p.workouts as Record<string, unknown>[])[0];
  a.warmup = [];
  a.cooldown = [];
  a.rounds = 1;
  a.main = [
    {
      name: 'Cardio',
      how: ['Pick one for today'],
      options: [
        {
          label: 'Walk outside',
          moves: [{ name: 'Outdoor walk', how: ['Easy pace'], reps: '20 minutes' }],
        },
        {
          label: 'Indoor cardio',
          moves: [
            { name: 'Indoor one', how: ['Steady'], seconds: 3 },
            { name: 'Indoor two', how: ['Easy'], reps: '10 times' },
            { name: 'Indoor three', how: ['Slow'], seconds: 3 },
          ],
        },
      ],
    },
    { name: 'Strength', how: ['Steady'], reps: '5 times' },
  ];
  return p;
}

function setup(net: Net): void {
  net.guest = makeGuest({ program: cardioProgram(), sessions: [] });
}

test('the cardio step shows the choice and Skip cardio today, and no Done button', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#move-name')).toHaveText('Cardio');
  await expect(page.locator('#progress-line')).toHaveText('Move 1 of 2');
  await expect(page.getByRole('button', { name: 'Walk outside' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Indoor cardio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip cardio today' })).toBeVisible();
  await expect(page.locator('#done-btn')).toHaveCount(0);
});

test('Home lists the choice in words', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#parts summary').first().click();
  await expect(page.locator('#parts .move-link').first()).toContainText(
    'Walk outside or Indoor cardio'
  );
});

test('picking walk outside runs its move in place, and the log says which option', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Walk outside' }).click();
  await expect(page.locator('#move-name')).toHaveText('Outdoor walk');
  await expect(page.locator('#progress-line')).toHaveText('Move 1 of 2 · Walk outside 1 of 1');
  await page.locator('#done-btn').click();
  await expect(page.locator('#move-name')).toHaveText('Strength');
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const moves = (net.saves[0].p_session as { moves: unknown[] }).moves;
  expect(moves).toEqual([
    { name: 'Outdoor walk', part: 'main', round: 1, status: 'done', option: 'Walk outside' },
    { name: 'Strength', part: 'main', round: 1, status: 'done' },
  ]);
});

test('indoor cardio: timed moves go on by themselves with a get-ready; reps moves wait for Done', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Indoor cardio' }).click();
  await expect(page.locator('#move-name')).toHaveText('Indoor one');
  await expect(page.locator('#progress-line')).toHaveText('Move 1 of 2 · Indoor cardio 1 of 3');
  // no tap needed: the get-ready starts at once, then the hold, then it moves on
  await expect(page.locator('#get-ready')).toBeVisible();
  await expect(page.locator('#move-name')).toHaveText('Indoor two', { timeout: 14_000 });
  await expect(page.locator('#reps')).toHaveText('10 times');
  await page.waitForTimeout(500);
  await expect(page.locator('#move-name')).toHaveText('Indoor two'); // a reps move waits
  await page.locator('#done-btn').click();
  await expect(page.locator('#move-name')).toHaveText('Indoor three');
  await expect(page.locator('#get-ready')).toBeVisible();
  await expect(page.locator('#move-name')).toHaveText('Strength', { timeout: 14_000 });
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as {
    moves: { name: string; status: string; option?: string }[];
    readings: { holds: Record<string, number[]> };
  };
  expect(s.moves.map((m) => `${m.name}:${m.status}:${m.option ?? ''}`)).toEqual([
    'Indoor one:done:Indoor cardio',
    'Indoor two:done:Indoor cardio',
    'Indoor three:done:Indoor cardio',
    'Strength:done:',
  ]);
  expect(s.readings.holds).toEqual({ 'Indoor one': [3], 'Indoor three': [3] });
});

test('Skip cardio today moves on, is logged as skipped, and is not offered again at the end', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Skip cardio today' }).click();
  await expect(page.locator('#move-name')).toHaveText('Strength');
  await page.locator('#done-btn').click();
  await expect(page.locator('#redo-title')).toHaveCount(0);
  await expect(page.locator('#after-title')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const moves = (net.saves[0].p_session as { moves: { name: string; status: string }[] }).moves;
  expect(moves).toEqual([
    { name: 'Cardio', part: 'main', round: 1, status: 'skipped' },
    { name: 'Strength', part: 'main', round: 1, status: 'done' },
  ]);
});

test('the last choice is remembered and marked next time', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('.last-time')).toHaveCount(0); // nothing remembered yet
  await page.getByRole('button', { name: 'Indoor cardio' }).click();
  expect(await page.evaluate(() => localStorage.getItem('aw.cardio'))).toBe('Indoor cardio');
  // start over: quit this workout and begin another
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Quit without saving' }).click();
  await startWorkout(page);
  await expect(page.getByRole('button', { name: /Indoor cardio/ })).toContainText('last time');
  await expect(page.getByRole('button', { name: /Walk outside/ })).not.toContainText('last time');
  // it is remembered across a reload too
  await page.reload();
  await expect(page.locator('.last-time')).toHaveCount(1);
});

test('the choice survives a reload: the option stays, and the choice screen comes back if not made', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Skip cardio today' })).toBeVisible();
  await page.getByRole('button', { name: 'Walk outside' }).click();
  await page.reload();
  await expect(page.locator('#move-name')).toHaveText('Outdoor walk');
  await expect(page.locator('#progress-line')).toHaveText('Move 1 of 2 · Walk outside 1 of 1');
});

test('Back from the move after the option goes to the option’s last move', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Walk outside' }).click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#move-name')).toHaveText('Strength');
  await page.getByRole('button', { name: 'Back one step' }).click();
  await expect(page.locator('#move-name')).toHaveText('Outdoor walk');
});

test('the steps list shows the chosen option’s moves', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Indoor cardio' }).click();
  await page.getByRole('button', { name: '☰ Steps' }).click();
  await expect(page.locator('#steps-sheet .step-row')).toHaveText([
    '○Indoor one · Indoor cardio',
    '○Indoor two · Indoor cardio',
    '○Indoor three · Indoor cardio',
    '○Strength',
  ]);
});

for (const width of [320, 390, 402, 430]) {
  test(`the cardio choice has no sideways scroll at ${width}px, buttons 44px`, async ({
    page,
    net,
  }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await startWorkout(page);
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
