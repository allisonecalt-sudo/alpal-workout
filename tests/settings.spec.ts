import { readFileSync } from 'node:fs';
import {
  CODE,
  expect,
  makeGuest,
  makeHoldProgram,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  withRest,
  type Net,
} from './fixtures';

const version = JSON.parse(readFileSync('package.json', 'utf8')).appVersion as string;

type Win = { __tones: number[]; __spoken: string[] };

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

function holdGuest(net: Net): void {
  net.guest = makeGuest({ program: makeHoldProgram(), sessions: [] });
}

test('the gear is in the header on Home, opens Settings, and ‹ Home comes back', async ({
  page,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  await openSettings(page);
  await page.getByRole('button', { name: '‹ Home' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
});

test('no gear on the unlock screen and none in the middle of a workout', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#settings-btn')).toBeHidden();
  await page.addInitScript((c) => localStorage.setItem('aw.code', c), CODE);
  await openUnlocked(page);
  await expect(page.locator('#settings-btn')).toBeVisible();
  await startWorkout(page);
  await expect(page.locator('#settings-btn')).toBeHidden();
});

test('About shows the version and the build time', async ({ page }) => {
  await openUnlocked(page);
  await openSettings(page);
  await expect(page.locator('#about')).toHaveText(
    new RegExp(`^${version.replace('.', '\\.')} · [A-Z][a-z]{2} \\d{1,2} · \\d{2}:\\d{2}$`)
  );
});

test('Voice: off at first, on when turned on, remembered, and it reads the moves', async ({
  page,
}) => {
  await openUnlocked(page);
  await openSettings(page);
  await expect(page.locator('#set-voice')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#set-voice').click();
  await expect(page.locator('#set-voice')).toHaveText('On');
  await page.reload();
  await openSettings(page);
  await expect(page.locator('#set-voice')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '‹ Home' }).click();
  await startWorkout(page);
  const spoken = await page.evaluate(() => (window as unknown as Win).__spoken);
  expect(spoken).toEqual(['Move one. Line one']);
  // and the voice button on the workout screen agrees
  await expect(page.locator('#voice-btn')).toHaveAttribute('aria-pressed', 'true');
});

test('Beeps: on at first; off means a hold makes no sound; remembered', async ({ page, net }) => {
  holdGuest(net);
  await openUnlocked(page);
  await openSettings(page);
  await expect(page.locator('#set-beeps')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#set-beeps').click();
  await expect(page.locator('#set-beeps')).toHaveText('Off');
  await page.reload();
  await openSettings(page);
  await expect(page.locator('#set-beeps')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '‹ Home' }).click();
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#held')).toHaveText('✓ held 6 s', { timeout: 14_000 });
  expect(await page.evaluate(() => (window as unknown as Win).__tones)).toEqual([]);
});

test('Rest: the plan’s own value is the first chip; her choice replaces it and is remembered', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({ program: withRest(makeRoundsProgram(), 20), sessions: [] });
  await openUnlocked(page);
  await openSettings(page);
  const chips = page.locator('#set-rest .chip');
  await expect(chips).toHaveText(["Plan's (20 s)", '0 s', '15 s', '30 s', '45 s', '60 s', '90 s']);
  await expect(page.locator('#set-rest [aria-pressed="true"]')).toHaveText("Plan's (20 s)");
  // 0 means no rest at all, even though the plan has one
  await chips.filter({ hasText: /^0 s$/ }).click();
  await page.reload();
  await openSettings(page);
  await expect(page.locator('#set-rest [aria-pressed="true"]')).toHaveText('0 s');
  await page.getByRole('button', { name: '‹ Home' }).click();
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#rest-screen')).toHaveCount(0);
  await expect(page.locator('#move-name')).toHaveText('Main two');
});

test('Rest: a chosen 45 s rest is used when the plan has none', async ({ page, net }) => {
  net.guest = makeGuest({ program: makeRoundsProgram(), sessions: [] });
  await openUnlocked(page);
  await openSettings(page);
  await expect(page.locator('#set-rest .chip').first()).toHaveText("Plan's (none)");
  await page
    .locator('#set-rest .chip')
    .filter({ hasText: /^45 s$/ })
    .click();
  await page.getByRole('button', { name: '‹ Home' }).click();
  await startWorkout(page);
  for (let k = 0; k < 3; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#rest-count')).toHaveText(/^(44|45)$/);
});

test('Get-ready: 3 s at first, 0 s goes straight to the hold, remembered', async ({
  page,
  net,
}) => {
  holdGuest(net);
  await openUnlocked(page);
  await openSettings(page);
  await expect(page.locator('#set-ready .chip')).toHaveText(['0 s', '3 s', '5 s', '10 s']);
  await expect(page.locator('#set-ready [aria-pressed="true"]')).toHaveText('3 s');
  await page.locator('#set-ready .chip').filter({ hasText: /^0 s$/ }).click();
  await page.reload();
  await openSettings(page);
  await expect(page.locator('#set-ready [aria-pressed="true"]')).toHaveText('0 s');
  await page.getByRole('button', { name: '‹ Home' }).click();
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#get-ready')).toHaveCount(0);
  await expect(page.locator('#timer-btn')).toHaveText('Stop');
});

test('Get-ready 5 s counts 5 down first', async ({ page, net }) => {
  holdGuest(net);
  await openUnlocked(page);
  await openSettings(page);
  await page.locator('#set-ready .chip').filter({ hasText: /^5 s$/ }).click();
  await page.getByRole('button', { name: '‹ Home' }).click();
  await startWorkout(page);
  await page.locator('#timer-btn').click();
  await expect(page.locator('#get-ready')).toBeVisible();
  await expect(page.locator('#timer')).toHaveText(/^[45]$/);
});

test('Export downloads one JSON file named with the date, holding the sessions', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({
    sessions: [
      { done_at: '2026-10-12T08:00:00Z', week: 1, workout: 'A', feel: 'easy', check_0_10: 1 },
    ],
  });
  await openUnlocked(page);
  await openSettings(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export my data' }).click(),
  ]);
  const today = await page.evaluate(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  expect(download.suggestedFilename()).toBe(`my-workouts-${today}.json`);
  const path = await download.path();
  const body = JSON.parse(readFileSync(path, 'utf8'));
  expect(body.app_version).toBe(version);
  expect(body.sessions).toHaveLength(1);
  expect(body.sessions[0]).toMatchObject({ workout: 'A', check_0_10: 1 });
  expect(body.settings).toMatchObject({ voice: false, beeps: true, getReadySeconds: 3 });
  expect(body.not_sent_yet).toEqual([]);
});

test('Use a different code: asks first; Cancel changes nothing', async ({ page }) => {
  await openUnlocked(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'Use a different code' }).click();
  await expect(page.getByRole('heading', { name: 'Use a different code?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#confirm-code')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBe(CODE);
});

test('Use a different code: Yes clears the saved code and goes to the unlock screen', async ({
  page,
  net,
}) => {
  await openUnlocked(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'Use a different code' }).click();
  await page.getByRole('button', { name: 'Yes, use a different code' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('aw.cache'))).toBeNull();
  await expect(page.locator('#settings-btn')).toBeHidden();
  // a reload stays on the unlock screen (no code left)
  await page.addInitScript(() => localStorage.removeItem('aw.code'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  void net;
});

test('Use a different code warns about anything not sent yet', async ({ page, net }) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#unsent-line')).toBeVisible();
  await openSettings(page);
  await page.getByRole('button', { name: 'Use a different code' }).click();
  await expect(page.locator('#confirm-unsent')).toHaveText(
    '1 not sent yet will be removed from this phone.'
  );
  await page.getByRole('button', { name: 'Yes, use a different code' }).click();
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
});

for (const width of [320, 390, 402, 430]) {
  test(`Settings has no sideways scroll at ${width}px, and every control is 44px`, async ({
    page,
    net,
  }) => {
    net.guest = makeGuest({ program: withRest(makeRoundsProgram(), 20), sessions: [] });
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await openSettings(page);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button').all()) {
      if (!(await b.isVisible())) continue;
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Use a different code' }).click();
    const over2 = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over2).toBeLessThanOrEqual(0);
  });
}
