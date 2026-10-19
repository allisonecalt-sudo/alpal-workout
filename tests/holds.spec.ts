import {
  expect,
  makeGuest,
  makeHoldProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

// One workout: a 6 second hold, then a rep move. The get-ready count is 3 seconds.
function setup(net: Net, over: Record<string, unknown> = {}): void {
  net.guest = makeGuest({ program: makeHoldProgram(over), sessions: [] });
}

type Win = { __tones: number[]; __osc: number };
const tones = (page: import('@playwright/test').Page): Promise<number[]> =>
  page.evaluate(() => (window as unknown as Win).__tones);

test('a hold starts Ready: the full time and a Start button', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#move-name')).toHaveText('Hold one');
  await expect(page.locator('#timer')).toHaveText('6 s');
  await expect(page.locator('#timer-btn')).toHaveText('Start');
  await expect(page.locator('#held')).toHaveCount(0);
});

test('Start gives a get-ready 3-2-1, then the hold counts down, then "held" with a chime', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  // get-ready: the words and the numbers 3, 2, 1
  await expect(page.locator('#get-ready')).toHaveText('Get ready');
  const seen = new Set<string>();
  for (let k = 0; k < 12; k++) {
    seen.add((await page.locator('#timer').textContent()) ?? '');
    if ((await page.locator('#timer-btn').count()) > 0) break;
    await page.waitForTimeout(250);
  }
  expect([...seen]).toEqual(expect.arrayContaining(['3', '2', '1']));
  // the hold: counting down, with Stop
  await expect(page.locator('#timer-btn')).toHaveText('Stop', { timeout: 5000 });
  await expect(page.locator('#timer')).toHaveText(/^[1-6] s$/);
  // it finishes by itself
  await expect(page.locator('#held')).toHaveText('✓ held 6 s', { timeout: 10_000 });
  await expect(page.locator('#hold-redo')).toBeVisible();
  // sounds: counts on the last 3 seconds of both countdowns, a go beep, one finish chime
  const t = await tones(page);
  expect(t.filter((hz) => hz === 660).length).toBeGreaterThanOrEqual(5); // 3 + 3
  expect(t.filter((hz) => hz === 990)).toHaveLength(1); // go
  expect(t.filter((hz) => hz === 523)).toHaveLength(1); // the chime's first note
  // order: counts, then go, then counts, then the chime
  expect(t.indexOf(990)).toBeGreaterThan(t.indexOf(660));
  expect(t.indexOf(523)).toBeGreaterThan(t.indexOf(990));
});

test('no sound at all before the first tap', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.waitForTimeout(700);
  expect(await tones(page)).toEqual([]);
});

test('Stop keeps the real seconds held, and that counts', async ({ page, net }) => {
  setup(net, { workouts: undefined });
  const program = makeHoldProgram();
  (program.workouts as { main: { seconds?: number }[] }[])[0].main[0].seconds = 20;
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer-btn')).toHaveText('Stop', { timeout: 6000 });
  await page.waitForTimeout(2200);
  await page.locator('#timer-btn').click();
  const held = page.locator('#held');
  await expect(held).toHaveText(/^✓ held [1-4] s$/);
  const text = (await held.textContent()) ?? '';
  const seconds = Number(/(\d+) s/.exec(text)?.[1]);
  // finish the workout and save: the seconds are in the readings
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { holds: Record<string, number[]> } };
  expect(s.readings.holds).toEqual({ 'Hold one': [seconds] });
});

test('Redo restarts that hold; the redone seconds are the ones kept', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer-btn')).toHaveText('Stop', { timeout: 6000 });
  await page.waitForTimeout(1200);
  await page.locator('#timer-btn').click(); // Stop: a short hold
  await expect(page.locator('#held')).toBeVisible();
  await page.locator('#hold-redo').click();
  await expect(page.locator('#held')).toHaveCount(0);
  await expect(page.locator('#timer')).toHaveText('6 s');
  await expect(page.locator('#timer-btn')).toHaveText('Start');
  await page.locator('#timer-btn').click();
  await expect(page.locator('#held')).toHaveText('✓ held 6 s', { timeout: 14_000 });
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { holds: Record<string, number[]> } };
  expect(s.readings.holds).toEqual({ 'Hold one': [6] });
});

test('a reload during the get-ready starts the count over from Ready', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#get-ready')).toBeVisible();
  await page.reload();
  await expect(page.locator('#move-name')).toHaveText('Hold one');
  await expect(page.locator('#timer')).toHaveText('6 s');
  await expect(page.locator('#timer-btn')).toHaveText('Start');
});

/** Start a 30 s hold, get into the hold itself, and let it run for a moment. */
async function runningHold(page: import('@playwright/test').Page, net: Net): Promise<void> {
  const program = makeHoldProgram();
  (program.workouts as { main: { seconds?: number }[] }[])[0].main[0].seconds = 30;
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer-btn')).toHaveText('Stop', { timeout: 6000 });
  await page.waitForTimeout(1500);
}

/** Pretend the hold started `seconds` earlier (the page was away that long). */
async function shiftHoldStart(
  page: import('@playwright/test').Page,
  seconds: number
): Promise<void> {
  await page.evaluate((ms) => {
    const p = JSON.parse(localStorage.getItem('aw.progress') as string);
    p.hold.run.startedAt -= ms;
    localStorage.setItem('aw.progress', JSON.stringify(p));
  }, seconds * 1000);
}

test('a reload mid-hold counts what the timer would have shown: held 1.5 s, gone 8 s, about 9 to 11 s', async ({
  page,
  net,
}) => {
  await runningHold(page, net);
  await shiftHoldStart(page, 8);
  await page.reload();
  const held = page.locator('#held');
  await expect(held).toHaveText(/^✓ held (9|10|11|12) s$/);
  const first = await held.textContent();
  const seconds = Number(/(\d+) s/.exec(first ?? '')?.[1]);
  // finish and save: those are the seconds in the readings
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { holds: Record<string, number[]> } };
  expect(s.readings.holds).toEqual({ 'Hold one': [seconds] });
});

test('the count after a reload is capped at the hold length', async ({ page, net }) => {
  await runningHold(page, net);
  await shiftHoldStart(page, 600);
  await page.reload();
  await expect(page.locator('#held')).toHaveText('✓ held 30 s');
});

test('after the first moment back, idle time never counts, and two reloads add nothing', async ({
  page,
  net,
}) => {
  await runningHold(page, net);
  await shiftHoldStart(page, 5);
  await page.reload();
  const held = page.locator('#held');
  await expect(held).toHaveText(/^✓ held \d+ s$/);
  const first = await held.textContent();
  await page.waitForTimeout(2500); // idle time after the page is back
  expect(await held.textContent()).toBe(first);
  await page.reload();
  await expect(page.locator('#held')).toHaveText(first as string);
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.locator('#held')).toHaveText(first as string);
});

test('Done on a hold goes on; leaving a running hold keeps the seconds so far', async ({
  page,
  net,
}) => {
  const program = makeHoldProgram();
  (program.workouts as { main: { seconds?: number }[] }[])[0].main[0].seconds = 30;
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#timer-btn')).toHaveText('Stop', { timeout: 6000 });
  await page.waitForTimeout(2200);
  await page.locator('#done-btn').click(); // leave while it is still running
  await expect(page.locator('#move-name')).toHaveText('Move two');
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { holds: Record<string, number[]> } };
  expect(s.readings.holds['Hold one']).toHaveLength(1);
  expect(s.readings.holds['Hold one'][0]).toBeGreaterThanOrEqual(1);
  expect(s.readings.holds['Hold one'][0]).toBeLessThanOrEqual(4);
});

test('a hold with no seconds held leaves no entry in the readings', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click(); // never started
  await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: Record<string, unknown> };
  expect(s.readings.holds).toBeUndefined();
});

test('one hold entry per round, in order', async ({ page, net }) => {
  const program = makeHoldProgram();
  const w = (program.workouts as { main: { seconds?: number }[]; rounds: number }[])[0];
  w.rounds = 2;
  w.main[0].seconds = 3;
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await startWorkout(page);
  for (let round = 1; round <= 2; round++) {
    await page.locator('#timer-btn').click();
    await expect(page.locator('#held')).toHaveText('✓ held 3 s', { timeout: 10_000 });
    await page.locator('#done-btn').click(); // the hold
    await page.locator('#done-btn').click(); // the rep move
    if (round === 1) await page.getByRole('button', { name: 'Next round' }).click();
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  const s = net.saves[0].p_session as { readings: { holds: Record<string, number[]> } };
  expect(s.readings.holds).toEqual({ 'Hold one': [3, 3] });
});

for (const width of [320, 390, 402, 430]) {
  test(`the hold card has no sideways scroll at ${width}px`, async ({ page, net }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await startWorkout(page);
    const over = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    expect(await over()).toBeLessThanOrEqual(0);
    await page.locator('#timer-btn').click();
    await expect(page.locator('#get-ready')).toBeVisible();
    expect(await over()).toBeLessThanOrEqual(0);
  });
}

// ---- the pain-rule line ----

test('the pain rule shows on every move card, quiet and not in a fold', async ({ page, net }) => {
  setup(net, { painRule: 'Stop if it hurts, then tell someone.' });
  await openUnlocked(page);
  await startWorkout(page);
  const rule = page.locator('#pain-rule');
  // a hold card
  await expect(rule).toHaveText('Stop if it hurts, then tell someone.');
  await expect(rule).toBeVisible();
  expect(await rule.evaluate((el) => !el.closest('details'))).toBe(true);
  // a reps card: under the reps
  await page.locator('#done-btn').click();
  await expect(page.locator('#reps')).toBeVisible();
  await expect(rule).toBeVisible();
  const reps = (await page.locator('#reps').boundingBox())?.y ?? 0;
  const line = (await rule.boundingBox())?.y ?? 0;
  expect(line).toBeGreaterThan(reps);
  // small and quiet
  expect(await rule.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(
    parseFloat(await page.locator('#reps').evaluate((el) => getComputedStyle(el).fontSize))
  );
});

test('no pain rule in the data means no line', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#move-name')).toBeVisible();
  await expect(page.locator('#pain-rule')).toHaveCount(0);
});

test('the pain rule is shown as text, never as markup, and wraps at 320px', async ({
  page,
  net,
}) => {
  setup(net, { painRule: '<b>x</b> ' + 'w'.repeat(120) });
  await page.setViewportSize({ width: 320, height: 640 });
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#pain-rule b')).toHaveCount(0);
  await expect(page.locator('#pain-rule')).toContainText('<b>x</b>');
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(over).toBeLessThanOrEqual(0);
});
