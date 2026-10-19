import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  test,
  type FakeSession,
  type Net,
} from './fixtures';

const day = (d: number, h = 9): string => new Date(2026, 9, d, h, 0, 0).toISOString();

const MOVES = ['Warm one', 'Main one', 'Cool one'];
const WORKOUTS = [
  { id: 'A', name: 'Workout A', moves: MOVES },
  { id: 'B', name: 'Workout B', moves: ['Bee one'] },
];
const WEEKS = [
  { week: 1, label: 'Week 1', active: false, workouts: WORKOUTS },
  { week: 2, label: 'Week 2', active: false, workouts: WORKOUTS },
  { week: 3, label: 'Week 3', active: true, workouts: WORKOUTS },
];

const mv = (round: number) => ({ name: 'Main one', part: 'main', round, status: 'done' });

function sess(k: number, week: number, over: Partial<FakeSession> = {}): FakeSession {
  return {
    client_id: `s${k}`,
    done_at: day(12 + k),
    duration_sec: 30 * 60,
    week,
    workout: ['A', 'B', 'C'][k % 3],
    feel: null,
    check_0_10: null,
    ...over,
  };
}

function setup(
  net: Net,
  sessions: FakeSession[],
  extra: { weeks?: unknown[]; next?: unknown; checkLabel?: string | null } = {}
): void {
  const p = makeRoundsProgram({ week: 3 });
  if (extra.checkLabel !== null) p.checkLabel = extra.checkLabel ?? 'Test check';
  net.guest = makeGuest({
    program: p,
    sessions,
    weeks: extra.weeks ?? WEEKS,
    next: extra.next,
  });
}

const open = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('button', { name: /Progress/ }).click();
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
};

test('with no sessions: one calm sentence and one way back, no numbers, no chart', async ({
  page,
  net,
}) => {
  setup(net, []);
  await openUnlocked(page);
  await open(page);
  await expect(page.locator('#progress-empty')).toContainText(
    'Nothing to show yet. Your first workout starts this page.'
  );
  await expect(page.locator('#headline')).toHaveCount(0);
  await expect(page.locator('#weeks-grid')).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
});

test('with 1 session: numbers only, since-date, no chart and no "full weeks" verdict', async ({
  page,
  net,
}) => {
  setup(net, [sess(0, 3, { check_0_10: 1, readings: { holds: { 'Hold one': [18] } } })]);
  await openUnlocked(page);
  await open(page);
  await expect(page.locator('#headline')).toHaveText('1 workout so far');
  await expect(page.locator('#headline-basis')).toHaveText('since Oct 12');
  await expect(page.locator('#grew li')).toHaveText(['Hold one: 18 s so far']);
  await expect(page.locator('#check-words')).toHaveText('Test check 0 on 0 of 1 · latest 1');
  await expect(page.locator('#check-dots')).toHaveCount(0);
  await expect(page.locator('#body-avg')).toHaveCount(0);
  await expect(page.locator('.progress')).not.toContainText(/streak|missed|overdue|behind/i);
});

test('with 4 sessions: the headline, the since-date, and the weeks grid with letters and numbers', async ({
  page,
  net,
}) => {
  setup(net, [sess(0, 1), sess(1, 1), sess(2, 1), sess(3, 2)]);
  await openUnlocked(page);
  await open(page);
  await expect(page.locator('#headline')).toHaveText('1 full week');
  await expect(page.locator('#headline-basis')).toHaveText('since Oct 12 · 4 workouts');
  await expect(page.locator('.progress-headline, #progress-headline')).toContainText(
    'A full week is 3 workouts.'
  );
  const wk = page.locator('.wk');
  await expect(wk).toHaveCount(3);
  await expect(wk.nth(0)).toHaveClass(/full/);
  await expect(wk.nth(0).locator('.wk-v')).toHaveText('✓');
  await expect(wk.nth(0)).toHaveAttribute('aria-label', 'Week 1: 3 of 3');
  await expect(wk.nth(1)).toHaveClass(/partial/);
  await expect(wk.nth(1).locator('.wk-v')).toHaveText('1'); // the count inside
  await expect(wk.nth(2)).toHaveClass(/none/);
  await expect(wk.nth(2).locator('.wk-v')).toHaveText('–');
  await expect(wk.nth(2).locator('.wk-now')).toHaveText('now');
  await expect(wk.nth(2)).toHaveClass(/now/);
  // no chart at all under 5 points
  await expect(page.locator('svg')).toHaveCount(0);
});

test('a week square opens that week’s review', async ({ page, net }) => {
  setup(net, [sess(0, 1), sess(1, 1), sess(2, 1), sess(3, 2)]);
  await openUnlocked(page);
  await open(page);
  await page.locator('.wk').nth(1).click();
  await expect(page.locator('#review-title')).toHaveText('Week 2 · 1 of 3');
});

test('what grew: first to latest hold with its own since-date, and rounds from the first week', async ({
  page,
  net,
}) => {
  setup(net, [
    sess(0, 1, { readings: { holds: { 'Hold one': [18, 15] } }, moves: [mv(1), mv(2)] }),
    sess(1, 2, {
      readings: { holds: { 'Hold one': [24], 'Hold two': [10] } },
      moves: [mv(1), mv(2)],
    }),
    sess(2, 3, { readings: { holds: { 'Hold one': [30, 25] } }, moves: [mv(1), mv(2), mv(3)] }),
  ]);
  await openUnlocked(page);
  await open(page);
  const grew = page.locator('#grew li');
  await expect(grew.nth(0)).toHaveText('Hold one: 18 s → 30 s · since Oct 12');
  await expect(grew.nth(1)).toHaveText('Hold two: 10 s so far');
  await expect(grew.nth(2)).toHaveText('Rounds in a session: 2 (week 1) → 3 (this week)');
});

test('body check in words at 4 points, dots only from 5, with "lower is better" said plainly', async ({
  page,
  net,
}) => {
  const four = [0, 2, 0, 1].map((v, k) => sess(k, 3, { check_0_10: v }));
  setup(net, four);
  await openUnlocked(page);
  await open(page);
  await expect(page.locator('#check-words')).toHaveText('Test check 0 on 2 of 4 · latest 1');
  await expect(page.locator('#check-dots')).toHaveCount(0);
  await page.getByRole('button', { name: '‹ Home' }).click();
  // a fifth point: the dots appear
  const five = [0, 2, 0, 1, 3].map((v, k) => sess(k, 3, { check_0_10: v }));
  net.guest = makeGuest({
    program: makeRoundsProgram({ week: 3, checkLabel: 'Test check' }),
    sessions: five,
    weeks: WEEKS,
  });
  await page.reload();
  await open(page);
  await expect(page.locator('#check-dots circle')).toHaveCount(5);
  await expect(page.locator('#body-check')).toContainText('Lower is better');
  await expect(page.locator('#check-words')).toHaveText('Test check 0 on 2 of 5 · latest 3');
});

test('the dots sit on a fixed 0 to 10 scale: a 10 is at the top, a 0 on the baseline', async ({
  page,
  net,
}) => {
  setup(
    net,
    [0, 10, 0, 10, 5].map((v, k) => sess(k, 3, { check_0_10: v }))
  );
  await openUnlocked(page);
  await open(page);
  const ys = await page
    .locator('#check-dots circle')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('cy'))));
  expect(ys[0]).toBeGreaterThan(ys[4]); // 0 is lower on the page than 5
  expect(ys[4]).toBeGreaterThan(ys[1]); // 5 is lower than 10
  expect(ys[0] - ys[1]).toBeCloseTo((ys[0] - ys[4]) * 2, 0); // linear: 5 is halfway
});

test('body and mood before to after as an average, from 3 sessions that have both', async ({
  page,
  net,
}) => {
  const pair = (k: number, b: number, a: number) =>
    sess(k, 3, {
      readings: {
        before: { body: b, mood: b + 1, check: null },
        after: { body: a, mood: a + 1 },
      },
    });
  setup(net, [pair(0, 4, 6), pair(1, 5, 5)]);
  await openUnlocked(page);
  await open(page);
  await expect(page.locator('#body-avg')).toHaveCount(0);
  await page.getByRole('button', { name: '‹ Home' }).click();
  net.guest = makeGuest({
    program: makeRoundsProgram({ week: 3, checkLabel: 'Test check' }),
    sessions: [pair(0, 4, 6), pair(1, 5, 5), pair(2, 6, 7)],
    weeks: WEEKS,
  });
  await page.reload();
  await open(page);
  await expect(page.locator('#body-avg')).toHaveText(
    'Body: 5.0 before → 6.0 after (average of 3 sessions)'
  );
  await expect(page.locator('#mood-avg')).toHaveText(
    'Mood: 6.0 before → 7.0 after (average of 3 sessions)'
  );
});

test('Coming next week: what changes by name, or "Same moves as this week"', async ({
  page,
  net,
}) => {
  const mvs = (names: string[]) => names.map((n) => ({ name: n, how: ['x'], reps: '5 times' }));
  const nextData = (names: string[]) => ({
    label: 'Week 4',
    sessionsPerWeek: 3,
    workouts: [
      { id: 'A', name: 'Workout A', minutes: 20, main: mvs(names), rounds: 1 },
      { id: 'B', name: 'Workout B', minutes: 20, main: mvs(['Bee one']), rounds: 1 },
    ],
  });
  setup(net, [sess(0, 3)], { next: nextData(['Warm one', 'Main one', 'Cool one']) });
  await openUnlocked(page);
  await open(page);
  await expect(page.getByRole('heading', { name: 'Coming next week' })).toBeVisible();
  await expect(page.locator('#coming-next')).toHaveText('Same moves as this week');
  await page.getByRole('button', { name: '‹ Home' }).click();
  net.guest = makeGuest({
    program: makeRoundsProgram({ week: 3, checkLabel: 'Test check' }),
    sessions: [sess(0, 3)],
    weeks: WEEKS,
    next: nextData(['Warm one', 'Main one', 'New move']),
  });
  await page.reload();
  await open(page);
  await expect(page.locator('#coming-next')).toHaveText('Added: New move · Removed: Cool one');
});

test('no next week from the store: no "Coming next week" at all', async ({ page, net }) => {
  setup(net, [sess(0, 3)], { next: null });
  await openUnlocked(page);
  await open(page);
  await expect(page.getByRole('heading', { name: 'Coming next week' })).toHaveCount(0);
});

test('Past weeks: a fold per week with its workouts and moves, archived, never deleted', async ({
  page,
  net,
}) => {
  setup(net, [sess(0, 3)]);
  await openUnlocked(page);
  await open(page);
  const folds = page.locator('.past-week');
  await expect(folds).toHaveCount(2); // weeks 1 and 2; the open week is not "past"
  await expect(folds.nth(0).locator('summary')).toHaveText('Week 2'); // newest first
  await expect(folds.nth(0).locator('.pw-name')).toHaveText(['Workout A', 'Workout B']);
  await expect(page.getByText('Warm one').first()).toBeHidden(); // closed until opened
  await folds.nth(1).locator('summary').click();
  await expect(folds.nth(1).locator('li')).toHaveText([...MOVES, 'Bee one']);
});

test('words come first: every card has a plain line; the numbers match the review', async ({
  page,
  net,
}) => {
  setup(net, [sess(0, 3), sess(1, 3), sess(2, 3)]);
  await openUnlocked(page);
  await open(page);
  await expect(page.locator('#headline')).toHaveText('1 full week');
  await page.locator('.wk').last().click();
  // one number, one home: the same count on the review
  await expect(page.locator('#review-title')).toHaveText('Week 3 · 3 of 3');
});

test('a week with a walk: the walk is not a workout in any count', async ({ page, net }) => {
  setup(net, [sess(0, 3), sess(1, 3, { workout: 'walk' })]);
  await openUnlocked(page);
  await open(page);
  await expect(page.locator('#headline')).toHaveText('1 workout so far');
});

for (const width of [320, 390, 402, 430]) {
  test(`Progress has no sideways scroll at ${width}px, every control 44px, with all cards`, async ({
    page,
    net,
  }) => {
    const sessions = [0, 1, 2, 3, 4, 5].map((k) =>
      sess(k, 1 + (k % 3), {
        check_0_10: k % 3,
        readings: {
          holds: { ['H'.repeat(50)]: [10 + k] },
          before: { body: 4, mood: 5, check: null },
          after: { body: 6, mood: 7 },
        },
        moves: [mv(1), mv(2)],
      })
    );
    setup(net, sessions, {
      next: {
        label: 'Week 4',
        sessionsPerWeek: 3,
        workouts: [
          {
            id: 'A',
            name: 'Workout A',
            minutes: 20,
            main: [{ name: 'M'.repeat(60), how: ['x'], reps: '5 times' }],
            rounds: 1,
          },
        ],
      },
    });
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await open(page);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button, summary').all()) {
      if (!(await b.isVisible())) continue;
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
