import { expect, makeGuest, makeRoundsProgram, openUnlocked, test, type Net } from './fixtures';

function setup(net: Net, over: Record<string, unknown> = {}): void {
  net.guest = makeGuest({ program: makeRoundsProgram(over), sessions: [] });
}

async function openBefore(page: import('@playwright/test').Page): Promise<void> {
  await openUnlocked(page);
  await page.locator('#start-btn').click();
  await expect(page.locator('#before-start')).toBeVisible();
}

const pressed = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(`${sel} [aria-pressed="true"]`);

test('Start on Home opens the Before screen, with every chip blank', async ({ page, net }) => {
  setup(net, { checkLabel: 'Test check' });
  await openBefore(page);
  await expect(page.getByRole('heading', { name: 'Workout A' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Body today' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mood' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Test check' })).toBeVisible();
  await expect(page.locator('#before-body .chip')).toHaveCount(10); // 1 to 10
  await expect(page.locator('#before-mood .chip')).toHaveCount(10);
  await expect(page.locator('#before-check .chip')).toHaveCount(11); // 0 to 10
  await expect(page.locator('#before-body .chip').first()).toHaveText('1');
  await expect(page.locator('#before-check .chip').first()).toHaveText('0');
  for (const id of ['#before-body', '#before-mood', '#before-check']) {
    await expect(pressed(page, id)).toHaveCount(0);
  }
  await expect(page.locator('#lite-chip')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('the check row is hidden when the data has no check label', async ({ page, net }) => {
  setup(net);
  await openBefore(page);
  await expect(page.locator('#before-check')).toHaveCount(0);
  await expect(page.locator('#before-body')).toBeVisible();
});

test('a tap picks a chip, another tap moves it, a second tap clears it', async ({ page, net }) => {
  setup(net);
  await openBefore(page);
  const body = page.locator('#before-body');
  await body.locator('[data-value="7"]').click();
  await expect(pressed(page, '#before-body')).toHaveText('7');
  await body.locator('[data-value="4"]').click();
  await expect(pressed(page, '#before-body')).toHaveText('4');
  await body.locator('[data-value="4"]').click();
  await expect(pressed(page, '#before-body')).toHaveCount(0);
});

test('the Lite chip: its words, suggested (never switched on) when body is 3 or less', async ({
  page,
  net,
}) => {
  setup(net);
  await openBefore(page);
  const lite = page.locator('#lite-chip');
  await expect(lite).toHaveText('Hard day? Lite — one round less, still counts');
  await expect(lite).not.toHaveClass(/suggested/);
  await page.locator('#before-body [data-value="4"]').click();
  await expect(lite).not.toHaveClass(/suggested/);
  await page.locator('#before-body [data-value="3"]').click();
  await expect(lite).toHaveClass(/suggested/);
  await expect(lite).toHaveAttribute('aria-pressed', 'false'); // never on by itself
  await page.locator('#before-body [data-value="1"]').click();
  await expect(lite).toHaveAttribute('aria-pressed', 'false');
  // turning it on is hers
  await lite.click();
  await expect(lite).toHaveAttribute('aria-pressed', 'true');
  await expect(lite).not.toHaveClass(/suggested/);
  await lite.click();
  await expect(lite).toHaveAttribute('aria-pressed', 'false');
});

test('Lite runs one round less, and the session is marked lite', async ({ page, net }) => {
  setup(net); // Workout A has 2 rounds
  await openBefore(page);
  await page.locator('#lite-chip').click();
  await page.locator('#before-start').click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  // one round only: the plain "Main" line, and no between screen after it
  await expect(page.locator('#progress-line')).toHaveText('Main · 1 of 2');
  await page.locator('#done-btn').click();
  await expect(page.locator('#progress-line')).toHaveText('Main · 2 of 2');
  await page.locator('#done-btn').click();
  await expect(page.locator('#between-title')).toHaveCount(0);
  await expect(page.locator('#cooldown')).toBeVisible();
  await page.getByRole('button', { name: 'Done stretching ✓' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { lite: boolean; moves: { part: string; round: number }[] };
  expect(s.lite).toBe(true);
  expect(s.moves.filter((m) => m.part === 'main').map((m) => m.round)).toEqual([1, 1]);
});

test('Lite never goes under one round', async ({ page, net }) => {
  const program = makeRoundsProgram();
  (program.workouts as { id: string; rounds: number }[]).find((w) => w.id === 'B')!.rounds = 1;
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await page.locator('#chips-line .chip', { hasText: 'B' }).click();
  await page.locator('#start-btn').click();
  // one round already: nothing to take away, so the chip is not offered
  await expect(page.locator('#lite-chip')).toHaveCount(0);
});

test('the time line: Starting, Right, Fix with a time picker, and 5 · 10 · 15 min ago', async ({
  page,
  net,
}) => {
  setup(net);
  await openBefore(page);
  const line = page.locator('#time-start');
  await expect(line).toHaveText(/^Starting · \d{1,2}:\d{2}\. Right\?$/);
  await page.locator('#time-start-ok').click();
  await expect(line).toHaveText(/^Started \d{1,2}:\d{2} ✓$/);
  // fix it by hand
  await page.locator('#time-start-fix').click();
  await page.locator('#time-start-input').fill('07:30');
  await expect(page.locator('#time-start')).toHaveText('Starting · 7:30. Right?');
  await page.locator('#time-start-ok').click();
  await expect(page.locator('#time-start')).toHaveText('Started 7:30 ✓');
  // or a chip
  await page.locator('#time-start-fix').click();
  for (const m of ['5 min ago', '10 min ago', '15 min ago']) {
    await expect(page.getByRole('button', { name: m, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: '10 min ago', exact: true }).click();
  const shown = (await page.locator('#time-start').textContent()) ?? '';
  const clock = /(\d{1,2}):(\d{2})/.exec(shown);
  const expected = await page.evaluate(() => {
    const d = new Date(Date.now() - 10 * 60_000);
    return d.getHours() * 60 + d.getMinutes();
  });
  const got = Number(clock?.[1]) * 60 + Number(clock?.[2]);
  expect(Math.abs(got - expected)).toBeLessThanOrEqual(1);
});

test('until she touches it, the time follows the clock every minute', async ({ page, net }) => {
  setup(net);
  await page.clock.install({ time: new Date(2026, 9, 19, 9, 4, 30) });
  await openBefore(page);
  await expect(page.locator('#time-start')).toHaveText('Starting · 9:04. Right?');
  await page.clock.fastForward(61_000);
  await expect(page.locator('#time-start')).toHaveText('Starting · 9:05. Right?');
  // once touched, it stays
  await page.locator('#time-start-ok').click();
  await page.clock.fastForward(5 * 60_000);
  await expect(page.locator('#time-start')).toHaveText(/^Started 9:0[56] ✓$/);
  expect(await page.locator('#time-start').textContent()).not.toContain('9:10');
});

test('Start saves the answers and the confirmed time with the session', async ({ page, net }) => {
  setup(net, { checkLabel: 'Test check' });
  await openBefore(page);
  await page.locator('#before-body [data-value="3"]').click();
  await page.locator('#before-mood [data-value="8"]').click();
  await page.locator('#before-check [data-value="2"]').click();
  await page.locator('#time-start-fix').click();
  await page.locator('#time-start-input').fill('07:30');
  await page.locator('#time-start-ok').click();
  await page.locator('#before-start').click();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as {
    started_at: string;
    readings: { before: unknown };
    lite: boolean;
  };
  expect(s.readings.before).toEqual({ body: 3, mood: 8, check: 2 });
  const at730 = await page.evaluate(() => {
    const d = new Date();
    d.setHours(7, 30, 0, 0);
    return d.toISOString();
  });
  expect(s.started_at).toBe(at730);
});

test('unanswered chips are sent as null, and only when something was answered', async ({
  page,
  net,
}) => {
  setup(net, { checkLabel: 'Test check' });
  await openBefore(page);
  await page.locator('#before-mood [data-value="6"]').click();
  await page.locator('#before-start').click();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { before: unknown } };
  expect(s.readings.before).toEqual({ body: null, mood: 6, check: null });
});

test('nothing answered: no "before" readings at all', async ({ page, net }) => {
  setup(net);
  await openBefore(page);
  await page.locator('#before-start').click();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: Record<string, unknown> };
  expect(s.readings.before).toBeUndefined();
});

test('a reload on the Before screen keeps what was tapped', async ({ page, net }) => {
  setup(net);
  await openBefore(page);
  await page.locator('#before-body [data-value="5"]').click();
  await page.locator('#lite-chip').click();
  await page.locator('#time-start-ok').click();
  await page.reload();
  await expect(page.locator('#before-start')).toBeVisible();
  await expect(pressed(page, '#before-body')).toHaveText('5');
  await expect(page.locator('#lite-chip')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#time-start')).toHaveText(/^Started /);
});

test('‹ Home leaves without starting anything', async ({ page, net }) => {
  setup(net);
  await openBefore(page);
  await page.getByRole('button', { name: '‹ Home' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aw.progress'))).toBeNull();
});

for (const width of [320, 390, 402, 430]) {
  test(`the Before screen has no sideways scroll at ${width}px, and every button is 44px`, async ({
    page,
    net,
  }) => {
    setup(net, { checkLabel: 'Test check' });
    await page.setViewportSize({ width, height: 844 });
    await openBefore(page);
    await page.locator('#time-start-fix').click(); // the longest version of the screen
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button').all()) {
      if (!(await b.isVisible())) continue;
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
