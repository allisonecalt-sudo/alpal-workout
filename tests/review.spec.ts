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

const WORKOUTS = [
  { id: 'A', name: 'Workout A', moves: ['Warm one', 'Main one', 'Cool one'] },
  { id: 'B', name: 'Workout B', moves: ['Bee one'] },
];
const WEEKS = [
  { week: 1, label: 'Week 1', active: false, workouts: WORKOUTS },
  { week: 2, label: 'Week 2', active: true, workouts: WORKOUTS },
  { week: 3, label: 'Week 3', active: false, workouts: WORKOUTS },
];

function sess(k: number, week: number, over: Partial<FakeSession> = {}): FakeSession {
  return {
    client_id: `s${k}`,
    done_at: day(1 + k),
    duration_sec: 30 * 60,
    week,
    workout: ['A', 'B', 'C'][k % 3],
    feel: null,
    check_0_10: null,
    ...over,
  };
}

function setup(net: Net, sessions: FakeSession[], weeks: unknown[] = WEEKS): void {
  net.guest = makeGuest({
    program: makeRoundsProgram({ week: 2, checkLabel: 'Test check' }),
    sessions,
    weeks,
  });
}

const openReview = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('button', { name: 'Weekly review' }).click();
  await expect(page.locator('#review-title')).toBeVisible();
};

test('tapping the week dots opens the review of this week; an open week is never judged', async ({
  page,
  net,
}) => {
  setup(net, [sess(0, 1), sess(1, 1), sess(2, 1), sess(3, 2)]);
  await openUnlocked(page);
  await openReview(page);
  await expect(page.locator('#review-title')).toHaveText('Week 2 · 1 of 3');
  await expect(page.locator('#review-status')).toHaveText('Week still open');
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.review')).not.toContainText(/missed|behind|overdue|failed/i);
});

test('paging with ‹ › goes week by week and stops at the ends', async ({ page, net }) => {
  setup(net, [sess(0, 1), sess(1, 1), sess(2, 1), sess(3, 2)]);
  await openUnlocked(page);
  await openReview(page);
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.locator('#review-title')).toHaveText('Week 1 · 3 of 3');
  await expect(page.locator('.session-row')).toHaveCount(3);
  await expect(page.locator('#review-status')).toHaveCount(0); // a finished week: just its numbers
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next week' }).click();
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.locator('#review-title')).toHaveText('Week 3 · 0 of 3');
  await expect(page.locator('#review-status')).toHaveText('Not started yet');
  await expect(page.getByRole('button', { name: 'Next week' })).toBeDisabled();
});

test('a finished week with no workouts says so calmly', async ({ page, net }) => {
  setup(net, [sess(0, 2)]);
  await openUnlocked(page);
  await openReview(page);
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.locator('#review-title')).toHaveText('Week 1 · 0 of 3');
  await expect(page.locator('#review-status')).toHaveText('No workouts that week.');
});

test('the totals in words: total time, longest hold, and the check as "0 on 2 of 3 · highest 2"', async ({
  page,
  net,
}) => {
  setup(net, [
    sess(0, 1, { check_0_10: 0, readings: { holds: { 'Hold one': [18, 20] } } }),
    sess(1, 1, { check_0_10: 2, readings: { holds: { 'Hold one': [30] } } }),
    sess(2, 1, { check_0_10: 0, duration_sec: 45 * 60 }),
  ]);
  await openUnlocked(page);
  await openReview(page);
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.locator('#review-time')).toHaveText('Total time 1 h 45 min');
  await expect(page.locator('#review-hold')).toHaveText('Longest hold 30 s (Hold one)');
  await expect(page.locator('#review-check')).toHaveText('Test check 0 on 2 of 3 · highest 2');
});

test('no usual line before 4 full weeks', async ({ page, net }) => {
  setup(net, [0, 1, 2].map((k) => sess(k, 1)).concat([sess(3, 2)]));
  await openUnlocked(page);
  await openReview(page);
  await expect(page.locator('#review-usual')).toHaveCount(0);
});

test('from 4 full weeks on: "Your usual: 3 a week · this week: 2"', async ({ page, net }) => {
  const weeks = [1, 2, 3, 4, 5].map((w) => ({
    week: w,
    label: `Week ${w}`,
    active: w === 5,
    workouts: WORKOUTS,
  }));
  const sessions: FakeSession[] = [];
  let k = 0;
  for (const w of [1, 2, 3, 4]) for (let i = 0; i < 3; i++) sessions.push(sess(k++, w));
  sessions.push(sess(k++, 5), sess(k++, 5));
  net.guest = makeGuest({
    program: makeRoundsProgram({ week: 5, checkLabel: 'Test check' }),
    sessions,
    weeks,
  });
  await openUnlocked(page);
  await openReview(page);
  await expect(page.locator('#review-title')).toHaveText('Week 5 · 2 of 3');
  await expect(page.locator('#review-usual')).toHaveText('Your usual: 3 a week · this week: 2');
  await expect(page.locator('#review-status')).toHaveText('Week still open');
});

test('walks are listed but never counted in the week', async ({ page, net }) => {
  setup(net, [sess(0, 2), sess(1, 2, { workout: 'walk', duration_sec: 20 * 60 })]);
  await openUnlocked(page);
  await openReview(page);
  await expect(page.locator('#review-title')).toHaveText('Week 2 · 1 of 3');
  await expect(page.locator('.session-row')).toHaveCount(2);
});

test('a session opens from the review and Back returns to the same week', async ({ page, net }) => {
  setup(net, [sess(0, 1), sess(1, 1), sess(2, 1)]);
  await openUnlocked(page);
  await openReview(page);
  await page.getByRole('button', { name: 'Previous week' }).click();
  await page.locator('.session-row').first().click();
  await expect(page.locator('#detail-title')).toBeVisible();
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(page.locator('#review-title')).toHaveText('Week 1 · 3 of 3');
});

test('without a weeks list from the store, the review still works from what is known', async ({
  page,
  net,
}) => {
  setup(net, [sess(0, 1), sess(1, 2)], []);
  await openUnlocked(page);
  await openReview(page);
  await expect(page.locator('#review-title')).toHaveText('Week 2 · 1 of 3');
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.locator('#review-title')).toHaveText('Week 1 · 1 of 3');
});

for (const width of [320, 390, 402, 430]) {
  test(`the review has no sideways scroll at ${width}px, controls 44px`, async ({ page, net }) => {
    setup(net, [
      sess(0, 2, { check_0_10: 0, readings: { holds: { ['H'.repeat(60)]: [30] } } }),
      sess(1, 2),
    ]);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await openReview(page);
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
