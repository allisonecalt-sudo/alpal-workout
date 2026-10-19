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

const back = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Back one step' }).click();

test('Back goes one move at a time, and the counters go back too', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  const line = page.locator('#progress-line');
  await expect(line).toHaveText('Warm-up · 1 of 2');
  await page.locator('#done-btn').click();
  await expect(line).toHaveText('Warm-up · 2 of 2');
  await back(page);
  await expect(line).toHaveText('Warm-up · 1 of 2');
  await expect(page.locator('#move-name')).toHaveText('Warm one');
});

test('Back crosses a part boundary: the first main move goes back to the last warm-up move', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#progress-line')).toHaveText('Round 1 of 2 · move 1 of 2');
  await back(page);
  await expect(page.locator('#progress-line')).toHaveText('Warm-up · 2 of 2');
  await expect(page.locator('#move-name')).toHaveText('Warm two');
});

test("Back crosses a round boundary, and from the between screen goes to the round's last move", async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#between-title')).toBeVisible();
  await back(page); // from the between screen
  await expect(page.locator('#progress-line')).toHaveText('Round 1 of 2 · move 2 of 2');
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  await expect(page.locator('#progress-line')).toHaveText('Round 2 of 2 · move 1 of 2');
  await back(page); // from round 2 move 1 to round 1's last move
  await expect(page.locator('#progress-line')).toHaveText('Round 1 of 2 · move 2 of 2');
  await expect(page.locator('#move-name')).toHaveText('Main two');
});

test('Back from the first step goes to the Before screen, answers kept', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await page.locator('#before-body [data-value="6"]').click();
  await page.locator('#before-start').click();
  await expect(page.locator('#progress-line')).toHaveText('Warm-up · 1 of 2');
  await back(page);
  await expect(page.locator('#before-start')).toBeVisible();
  await expect(page.locator('#before-body [data-value="6"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('Back from the cool-down goes to the last main move', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  for (let k = 0; k < 2; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#cooldown')).toBeVisible();
  await back(page);
  await expect(page.locator('#progress-line')).toHaveText('Round 2 of 2 · move 2 of 2');
  await expect(page.locator('#move-name')).toHaveText('Main two');
});

test('Back from a rest is the move she just finished', async ({ page, net }) => {
  setup(net, withRest(makeRoundsProgram(), 30));
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click(); // main one done: rest
  await expect(page.locator('#rest-screen')).toBeVisible();
  await back(page);
  await expect(page.locator('#rest-screen')).toHaveCount(0);
  await expect(page.locator('#move-name')).toHaveText('Main one');
  await expect(page.locator('#progress-line')).toHaveText('Round 1 of 2 · move 1 of 2');
});

test('going back and forward again logs each move once, with the last answer', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click(); // warm one: done
  await page.getByRole('button', { name: 'Skip' }).click(); // warm two: skipped
  await back(page); // undo that skip
  await page.locator('#done-btn').click(); // warm two: done this time
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Finish now' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const moves = (net.saves[0].p_session as { moves: { name: string; status: string }[] }).moves;
  expect(moves.map((m) => `${m.name}:${m.status}`)).toEqual([
    'Warm one:done',
    'Warm two:done',
    'Main one:done',
    'Main two:done',
  ]);
});

test('the Back button is at least 44px tall', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  const box = await page.getByRole('button', { name: 'Back one step' }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
