import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

function setup(net: Net): void {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [] });
}

const openSteps = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('button', { name: '☰ Steps' }).click();
  await expect(page.locator('#steps-sheet')).toBeVisible();
};

test('☰ Steps lists every step by part and round, each marked done, skipped, hurt or not yet', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click(); // Warm one: done
  await page.getByRole('button', { name: 'Skip' }).click(); // Warm two: skipped
  await page.getByRole('button', { name: 'This hurts' }).click(); // Main one r1: hurt
  await openSteps(page);
  await expect(page.locator('#steps-sheet .step-group')).toHaveText([
    'Warm-up',
    'Round 1',
    'Round 2',
  ]);
  const rows = page.locator('#steps-sheet .step-row');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toHaveText('✓Warm one');
  await expect(rows.nth(1)).toHaveText('↷Warm two');
  await expect(rows.nth(2)).toHaveText('⚠Main one');
  await expect(rows.nth(3)).toHaveText('○Main two'); // the one she is on now
  await expect(rows.nth(3)).toHaveAttribute('aria-current', 'step');
  await expect(rows.nth(4)).toHaveText('○Main one');
});

test('the step button is on a move, a hold, a rest and the between screen', async ({
  page,
  net,
}) => {
  const program = makeRoundsProgram();
  for (const w of program.workouts as Record<string, unknown>[]) w.restSeconds = 20;
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.getByRole('button', { name: '☰ Steps' })).toBeVisible();
  await page.locator('#done-btn').click(); // on the hold now
  await expect(page.locator('#timer')).toBeVisible();
  await expect(page.getByRole('button', { name: '☰ Steps' })).toBeVisible();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#rest-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: '☰ Steps' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#between-title')).toBeVisible();
  await expect(page.getByRole('button', { name: '☰ Steps' })).toBeVisible();
});

test('tapping a step jumps there, in any order, and the counters follow', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await openSteps(page);
  await page.locator('#steps-sheet .step-row').nth(4).click(); // Round 2, move 1
  await expect(page.locator('#steps-sheet')).toHaveCount(0);
  await expect(page.locator('#progress-line')).toHaveText('Round 2 of 2 · move 1 of 2');
  await expect(page.locator('#move-name')).toHaveText('Main one');
  await page.locator('#done-btn').click();
  await expect(page.locator('#progress-line')).toHaveText('Round 2 of 2 · move 2 of 2');
  // and back to the first one
  await openSteps(page);
  await page.locator('#steps-sheet .step-row').first().click();
  await expect(page.locator('#progress-line')).toHaveText('Warm-up · 1 of 2');
  // the step done out of order stays marked
  await openSteps(page);
  await expect(page.locator('#steps-sheet .step-row').nth(4)).toHaveText('✓Main one');
});

test('a jump survives a reload and the Close button and a tap outside close the sheet', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await openSteps(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#steps-sheet')).toHaveCount(0);
  await openSteps(page);
  await page.locator('#steps-sheet').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('#steps-sheet')).toHaveCount(0);
  await openSteps(page);
  await page.locator('#steps-sheet .step-row').nth(3).click();
  await page.reload();
  await expect(page.locator('#progress-line')).toHaveText('Round 1 of 2 · move 2 of 2');
});

test('after the last step: "2 skipped — do them now?" and Do them goes to the skipped ones', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click(); // Warm one
  await page.getByRole('button', { name: 'Skip' }).click(); // Warm two: skipped
  await page.locator('#done-btn').click(); // Main one
  await page.getByRole('button', { name: 'Skip' }).click(); // Main two: skipped
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#redo-title')).toHaveText('2 skipped — do them now?');
  await page.getByRole('button', { name: 'Do them' }).click();
  await expect(page.locator('#move-name')).toHaveText('Warm two');
  await page.locator('#done-btn').click(); // done this time
  await expect(page.locator('#move-name')).toHaveText('Main two');
  await expect(page.locator('#progress-line')).toHaveText('Round 1 of 2 · move 2 of 2');
  await page.locator('#done-btn').click();
  // both are done now: on to the cool-down, and nothing is asked twice
  await expect(page.locator('#cooldown')).toBeVisible();
  await page.getByRole('button', { name: 'Done stretching ✓' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const moves = (net.saves[0].p_session as { moves: { name: string; status: string }[] }).moves;
  expect(moves.filter((m) => m.status === 'skipped')).toHaveLength(0);
  expect(moves.filter((m) => m.name === 'Warm two')[0].status).toBe('done');
});

test('Finish on the skipped question goes on, leaving them skipped; hurt ones are not offered', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'This hurts' }).click(); // Warm one: hurt
  await page.getByRole('button', { name: 'Skip' }).click(); // Warm two: skipped
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#redo-title')).toHaveText('1 skipped — do them now?');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#cooldown')).toBeVisible();
  await page.getByRole('button', { name: 'Done stretching ✓' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const moves = (net.saves[0].p_session as { moves: { name: string; status: string }[] }).moves;
  expect(moves.find((m) => m.name === 'Warm two')?.status).toBe('skipped');
  expect(moves.find((m) => m.name === 'Warm one')?.status).toBe('hurt');
});

test('no skipped steps means no question at the end', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  for (let k = 0; k < 2; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#redo-title')).toHaveCount(0);
  await expect(page.locator('#cooldown')).toBeVisible();
});

test('the question comes back after a reload and the log keeps what was jumped to', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  for (let k = 0; k < 5; k++) {
    if (k === 3) await page.getByRole('button', { name: 'Next round' }).click();
    else await page.locator('#done-btn').click();
  }
  await page.locator('#done-btn').click();
  await expect(page.locator('#redo-title')).toBeVisible();
  await page.reload();
  await expect(page.locator('#redo-title')).toHaveText('1 skipped — do them now?');
});

for (const width of [320, 390, 402, 430]) {
  test(`the steps sheet and the question have no sideways scroll at ${width}px, rows 44px`, async ({
    page,
    net,
  }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await startWorkout(page);
    const over = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    expect(await over()).toBeLessThanOrEqual(0); // the bar with the new button
    await openSteps(page);
    expect(await over()).toBeLessThanOrEqual(0);
    for (const b of await page.locator('#steps-sheet button').all()) {
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    for (const b of await page.locator('.runbar button').all()) {
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
