import type { Page } from '@playwright/test';
import {
  expect,
  makeGuest,
  makeHoldProgram,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

const feel = (page: Page, which: 'easy' | 'right' | 'hard') =>
  page.locator(`#feel-row [data-feel="${which}"]`);

function setup(net: Net, program: Record<string, unknown> = makeRoundsProgram()): void {
  net.guest = makeGuest({ program, sessions: [] });
}

function cardio(): Record<string, unknown> {
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
      ],
    },
  ];
  return p;
}

test('the row is on every kind of move page: warm-up, hold, main in each round, option move', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  const check = async (name: string): Promise<void> => {
    await expect(page.locator('#move-name')).toHaveText(name);
    await expect(page.locator('#feel-row')).toContainText('How was this one?');
    await expect(page.locator('#feel-row .chip')).toHaveText(['Easy', 'Right', 'Hard']);
    for (const b of await page.locator('#feel-row .chip').all()) {
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  };
  await check('Warm one'); // a warm-up
  await page.locator('#done-btn').click();
  await check('Warm two'); // a hold
  await page.locator('#done-btn').click();
  await check('Main one'); // round 1
  await page.locator('#done-btn').click();
  await check('Main two');
  await page.locator('#done-btn').click();
  await page.locator('#next-round-btn').click();
  await check('Main one'); // round 2
  await page.locator('#done-btn').click();
  await check('Main two');
});

test('a cardio option move has the row too, and the choice screen does not', async ({
  page,
  net,
}) => {
  setup(net, cardio());
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#move-name')).toHaveText('Cardio');
  await expect(page.locator('#feel-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Walk outside' }).click();
  await expect(page.locator('#move-name')).toHaveText('Outdoor walk');
  await expect(page.locator('#feel-row')).toBeVisible();
  await feel(page, 'right').click();
  await page.locator('#done-btn').click();
  await page.locator('#save-btn').click();
  const readings = net.saves[0].p_session.readings as { move_feel: Record<string, unknown> };
  expect(readings.move_feel).toEqual({ 'Outdoor walk': ['right'] });
});

test('tap picks, tap again clears, it never blocks Done, and it is kept on a reload', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await expect(feel(page, 'easy')).toHaveAttribute('aria-pressed', 'false');
  await feel(page, 'hard').click();
  await expect(feel(page, 'hard')).toHaveAttribute('aria-pressed', 'true');
  await feel(page, 'easy').click();
  await expect(feel(page, 'hard')).toHaveAttribute('aria-pressed', 'false');
  await expect(feel(page, 'easy')).toHaveAttribute('aria-pressed', 'true');
  await feel(page, 'easy').click();
  await expect(feel(page, 'easy')).toHaveAttribute('aria-pressed', 'false');
  await feel(page, 'right').click();
  await page.reload();
  await expect(page.locator('#move-name')).toHaveText('Warm one');
  await expect(feel(page, 'right')).toHaveAttribute('aria-pressed', 'true');
  // going back to the move shows what she said
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Back one step' }).click();
  await expect(feel(page, 'right')).toHaveAttribute('aria-pressed', 'true');
  // and Done never needed it
  await page.locator('#done-btn').click();
  await expect(page.locator('#move-name')).toHaveText('Warm two');
  await expect(feel(page, 'right')).toHaveAttribute('aria-pressed', 'false');
});

test('several rounds keep one answer per round, saved as a list; a cleared move is not saved', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click(); // warm-ups, unrated
  await feel(page, 'right').click(); // Main one, round 1
  await page.locator('#done-btn').click();
  await feel(page, 'easy').click(); // Main two, round 1
  await feel(page, 'easy').click(); // ...and cleared again
  await page.locator('#done-btn').click();
  await page.locator('#next-round-btn').click();
  await expect(feel(page, 'right')).toHaveAttribute('aria-pressed', 'false'); // round 2 is its own
  await feel(page, 'hard').click(); // Main one, round 2
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click(); // Main two, round 2, unrated
  // cool-down rows have the row too
  await expect(page.locator('#cooldown')).toBeVisible();
  await page.locator('#cooldown .cd-row summary').first().click();
  await expect(page.locator('#feel-row-0')).toBeVisible();
  await page.locator('#feel-row-0 [data-feel="easy"]').click();
  await page.locator('#cooldown-done').click();
  await page.locator('#save-btn').click();
  await expect(page.locator('#greeting')).toBeVisible();
  const readings = net.saves[0].p_session.readings as { move_feel: Record<string, unknown> };
  expect(readings.move_feel).toEqual({
    'Main one': ['right', 'hard'],
    'Cool one': ['easy'],
  });
});

test('a round skipped over keeps its place: [null, "hard"]', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click(); // Main one round 1, unrated
  await page.locator('#done-btn').click();
  await page.locator('#next-round-btn').click();
  await feel(page, 'hard').click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#cooldown-done').click();
  await page.locator('#save-btn').click();
  const readings = net.saves[0].p_session.readings as { move_feel: Record<string, unknown> };
  expect(readings.move_feel).toEqual({ 'Main one': [null, 'hard'] });
});

test('nothing rated: no move_feel at all', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.locator('#next-round-btn').click();
  for (let k = 0; k < 2; k++) await page.locator('#done-btn').click();
  await page.locator('#cooldown-done').click();
  await page.locator('#save-btn').click();
  const readings = net.saves[0].p_session.readings as Record<string, unknown>;
  expect(readings.move_feel).toBeUndefined();
});

test('the old after-the-last-round question is gone', async ({ page, net }) => {
  const program = makeRoundsProgram();
  const a = (program.workouts as { warmup: Record<string, unknown>[] }[])[0];
  a.warmup[0].new = true;
  a.warmup[0].stepped = true;
  setup(net, program);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await expect(page.locator('#move-feel')).toHaveCount(0);
  await expect(page.locator('#move-name')).toHaveText('Warm two');
});

test('a hold move can be rated while it is on screen', async ({ page, net }) => {
  setup(net, makeHoldProgram());
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#timer-btn')).toBeVisible();
  await feel(page, 'hard').click();
  await expect(feel(page, 'hard')).toHaveAttribute('aria-pressed', 'true');
});

test('the Session detail shows them per move, by round', async ({ page, net }) => {
  net.guest = makeGuest({
    program: makeRoundsProgram(),
    sessions: [
      {
        done_at: '2026-10-12T08:00:00Z',
        week: 1,
        workout: 'A',
        feel: null,
        check_0_10: null,
        readings: {
          move_feel: {
            'Main one': ['right', 'hard'],
            'Warm one': ['easy'],
            'Main two': [null, 'hard'],
          },
        },
        moves: [{ name: 'Warm one', part: 'warmup', round: 1, status: 'done' }],
      },
    ],
  });
  await openUnlocked(page);
  await page.locator('#door-sessions').click();
  await page
    .locator('#session-list button, #session-list [role="button"], #session-list li')
    .first()
    .click();
  await expect(page.locator('#detail-feels')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How each move felt' })).toBeVisible();
  await expect(page.locator('#detail-feels li')).toHaveText([
    'Main one: round 1 Just right · round 2 Hard',
    'Warm one: Easy',
    'Main two: round 2 Hard',
  ]);
});

for (const width of [320, 390, 402, 430]) {
  test(`no sideways scroll at ${width}px with the feel row`, async ({ page, net }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await startWorkout(page);
    await feel(page, 'right').click();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    const row = await page.locator('#feel-row').boundingBox();
    expect((row?.x ?? 0) + (row?.width ?? 0)).toBeLessThanOrEqual(width);
  });
}

test('a first-time tip points at the row', async ({ page, net }) => {
  setup(net);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__tipsinit')) {
      sessionStorage.setItem('__tipsinit', '1');
      localStorage.removeItem('aw.tips');
      localStorage.setItem(
        'aw.tipsSeen',
        JSON.stringify([
          'home-week',
          'home-start',
          'note-btn',
          'before-scores',
          'before-check',
          'before-lite',
          'move-first',
          'move-pills',
          'move-hurt',
          'steps',
          'pause',
        ])
      );
    }
  });
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#tip')).toContainText(
    'Tell Allison how each move felt. It helps her adjust your plan.'
  );
  await page.locator('#tip-ok').click();
  await expect(page.locator('#tip')).toHaveCount(0);
});
