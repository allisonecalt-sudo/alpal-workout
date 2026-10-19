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
