import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

const VIDEO = 'https://youtu.be/abcdefghijk';

function setup(net: Net): void {
  const program = makeRoundsProgram();
  const a = (program.workouts as Record<string, unknown>[])[0];
  a.rounds = 1;
  a.warmup = [];
  a.main = [{ name: 'Main one', how: ['Steady'], reps: '8 times' }];
  a.cooldown = [
    {
      name: 'Stretch one — left',
      how: ['Hold gently'],
      reps: '30 s',
      video: VIDEO,
      why: 'A reason',
    },
    { name: 'Stretch one — right', how: ['Hold gently'], reps: '30 s' },
    { name: 'Stretch two', how: ['Slow breaths'], seconds: 60 },
    { name: 'Stretch three', how: ['Easy'], reps: '30 s each side' },
  ];
  net.guest = makeGuest({ program, sessions: [] });
}

async function toCooldown(page: import('@playwright/test').Page): Promise<void> {
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await expect(page.locator('#cooldown')).toBeVisible();
}

test('every cool-down move is on one page; left and right fold into one each-side row', async ({
  page,
  net,
}) => {
  setup(net);
  await toCooldown(page);
  const rows = page.locator('#cooldown-list .cd-row');
  await expect(rows).toHaveCount(3); // four moves, one left/right pair folded
  await expect(rows.nth(0)).toContainText('Stretch one');
  await expect(rows.nth(0)).toContainText('each side');
  await expect(rows.nth(0)).not.toContainText('left');
  await expect(rows.nth(1)).toContainText('Stretch two');
  await expect(rows.nth(1)).toContainText('60 s');
  await expect(rows.nth(2)).toContainText('Stretch three');
  await expect(rows.nth(2).locator('.mv-amt')).toHaveText('30 s each side'); // not said twice
  await expect(page.locator('#progress-line')).toHaveText('Cool-down');
});

test('a rough length in minutes', async ({ page, net }) => {
  setup(net);
  await toCooldown(page);
  // 30 + 30 + 60 + 30 seconds = 2.5 minutes
  await expect(page.locator('#cooldown-minutes')).toHaveText(/^~[23] min$/);
});

test('each row opens its how-to and video', async ({ page, net }) => {
  setup(net);
  await toCooldown(page);
  const row = page.locator('#cooldown-list .cd-row').first();
  await expect(row.locator('#how-0')).toBeHidden();
  await row.locator(':scope > summary').click();
  await expect(row.locator('#how-0 li')).toHaveText(['Hold gently']);
  await expect(page.locator('iframe')).toHaveCount(0);
  await row.locator('#video-btn-0').click();
  await expect(row.locator('iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1&rel=0&modestbranding=1'
  );
  await row.locator('#more-0 summary').click();
  await expect(row.getByText('A reason')).toBeVisible();
  // other rows have no video
  await expect(page.locator('#video-btn-1')).toHaveCount(0);
});

test('Done stretching goes to After, and the cool-down moves are logged as done', async ({
  page,
  net,
}) => {
  setup(net);
  await toCooldown(page);
  await page.getByRole('button', { name: 'Done stretching ✓' }).click();
  await expect(page.locator('#after-title')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const moves = (
    net.saves[0].p_session as { moves: { name: string; part: string; status: string }[] }
  ).moves;
  expect(moves.filter((m) => m.part === 'cooldown').map((m) => `${m.name}:${m.status}`)).toEqual([
    'Stretch one — left:done',
    'Stretch one — right:done',
    'Stretch two:done',
    'Stretch three:done',
  ]);
});

test('Skip goes to After, the cool-down is logged as skipped and counted', async ({
  page,
  net,
}) => {
  setup(net);
  await toCooldown(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#after-title')).toBeVisible();
  await expect(page.locator('#after-skipped')).toHaveText('4 moves skipped');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const moves = (net.saves[0].p_session as { moves: { part: string; status: string }[] }).moves;
  expect(moves.filter((m) => m.part === 'cooldown').every((m) => m.status === 'skipped')).toBe(
    true
  );
});

test('a workout with no cool-down goes straight to After', async ({ page, net }) => {
  const program = makeRoundsProgram();
  const a = (program.workouts as Record<string, unknown>[])[0];
  a.cooldown = [];
  a.warmup = [];
  a.rounds = 1;
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#after-title')).toBeVisible();
  await expect(page.locator('#cooldown')).toHaveCount(0);
});

test('a reload on the cool-down list comes back to it', async ({ page, net }) => {
  setup(net);
  await toCooldown(page);
  await page.reload();
  await expect(page.locator('#cooldown')).toBeVisible();
});

for (const width of [320, 390, 402, 430]) {
  test(`the cool-down list has no sideways scroll at ${width}px, every button 44px, with a row open`, async ({
    page,
    net,
  }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    await toCooldown(page);
    await page.locator('#cooldown-list .cd-row').first().locator(':scope > summary').click();
    await page.locator('#video-btn-0').click();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button, summary').all()) {
      if (!(await b.isVisible())) continue;
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
