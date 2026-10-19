import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  test,
  type Net,
  startWorkout,
} from './fixtures';

const EMBED =
  'https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1&rel=0&modestbranding=1';

function setup(net: Net, program: Record<string, unknown> = makeRoundsProgram()): void {
  net.guest = makeGuest({ program, sessions: [] });
}

async function startA(page: import('@playwright/test').Page): Promise<void> {
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#move-name')).toHaveText('Warm one');
}

test('the video is not loaded until she taps Watch how; the player is the no-cookie inline one', async ({
  page,
  net,
}) => {
  setup(net);
  await startA(page);
  const btn = page.locator('#video-btn');
  await expect(btn).toHaveText('▶ Watch how');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(net.frames).toEqual([]);

  await btn.click();
  const frame = page.locator('#video-holder iframe');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', EMBED);
  expect(EMBED).toContain('playsinline=1');
  await expect(btn).toHaveText('▼ Hide video');
  await expect.poll(() => net.frames.length).toBeGreaterThan(0);
  expect(net.frames[0]).toBe(EMBED);
  // 16:9
  const box = await frame.boundingBox();
  expect(Math.abs((box?.width ?? 0) / (box?.height ?? 1) - 16 / 9)).toBeLessThan(0.05);
});

test('Hide video removes the player, and it can be opened again', async ({ page, net }) => {
  setup(net);
  await startA(page);
  await page.locator('#video-btn').click();
  await expect(page.locator('iframe')).toHaveCount(1);
  await page.locator('#video-btn').click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('#video-btn')).toHaveText('▶ Watch how');
  await page.locator('#video-btn').click();
  await expect(page.locator('iframe')).toHaveCount(1);
});

test('the player is gone on the next move', async ({ page, net }) => {
  setup(net);
  await startA(page);
  await page.locator('#video-btn').click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#move-name')).toHaveText('Warm two');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('#video-btn')).toHaveCount(0); // that move has no video
});

test('opening a video stops the voice, and the voice does not start over it', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.evaluate(() => {
    const w = window as unknown as { __cancels: number; speechSynthesis: { cancel: () => void } };
    w.__cancels = 0;
    const orig = w.speechSynthesis.cancel;
    w.speechSynthesis.cancel = () => {
      w.__cancels++;
      orig();
    };
  });
  await startWorkout(page);
  await expect(page.locator('#video-btn')).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
  const spokenBefore = await page.evaluate(
    () => (window as unknown as { __spoken: string[] }).__spoken.length
  );
  await page.locator('#video-btn').click();
  expect(await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels)).toBe(
    before + 1
  );
  expect(
    await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)
  ).toBe(spokenBefore);
});

test('a link it cannot read shows no button', async ({ page, net }) => {
  const program = makeRoundsProgram();
  const first = (program.workouts as { warmup: { video: string }[] }[])[0].warmup[0];
  first.video = 'https://example.com/clip';
  setup(net, program);
  await startA(page);
  await expect(page.locator('#video-btn')).toHaveCount(0);
});

test('More about this move is closed at first and shows Why, Tips and Watch out', async ({
  page,
  net,
}) => {
  setup(net);
  await startA(page);
  const more = page.locator('#more');
  await expect(more).toHaveJSProperty('open', false);
  await expect(page.getByText('A reason')).toBeHidden();
  await more.locator('summary').click();
  await expect(more).toHaveJSProperty('open', true);
  await expect(more.getByRole('heading', { name: 'Why' })).toBeVisible();
  await expect(more.getByText('A reason')).toBeVisible();
  await expect(more.getByRole('heading', { name: 'Tips' })).toBeVisible();
  await expect(more.locator('li')).toHaveText(['Tip one', 'Tip two', 'Careful one']);
  await expect(more.getByRole('heading', { name: 'Watch out' })).toBeVisible();
});

test('a move with no extra info has no More block, and only the parts present show', async ({
  page,
  net,
}) => {
  const program = makeRoundsProgram();
  const w = (program.workouts as Record<string, unknown>[])[0];
  w.warmup = [{ name: 'Warm two', how: ['Loosen up'], seconds: 20 }];
  setup(net, program);
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#more')).toHaveCount(0);
  await expect(page.locator('#video-btn')).toHaveCount(0);
});

test('Home: tapping a move opens a read-only sheet with the same info and a Close button', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#parts summary', { hasText: 'Warm-up' }).click();
  await page.locator('.move-link', { hasText: 'Warm one' }).click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('#sheet-name')).toHaveText('Warm one');
  await expect(sheet.locator('#sheet-amount')).toHaveText('5 times');
  await expect(sheet.locator('#how li')).toHaveText(['Easy start']);
  await expect(sheet.locator('iframe')).toHaveCount(0);
  await sheet.locator('#video-btn').click();
  await expect(sheet.locator('iframe')).toHaveAttribute('src', EMBED);
  await sheet.locator('#more summary').click();
  await expect(sheet.getByText('A reason')).toBeVisible();
  // read-only: no Done, Skip or Start inside it
  await expect(sheet.getByRole('button', { name: /Done|Skip|Start/ })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('#greeting')).toBeVisible();
  // nothing was started
  expect(await page.evaluate(() => localStorage.getItem('aw.progress'))).toBeNull();
});

test('the sheet works for a timed move too', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#parts summary', { hasText: 'Warm-up' }).click();
  await page.locator('.move-link', { hasText: 'Warm two' }).click();
  await expect(page.locator('#sheet-amount')).toHaveText('20 s');
  await expect(page.locator('#video-btn')).toHaveCount(0);
});

for (const width of [320, 390, 430]) {
  test(`no sideways scroll at ${width}px on the sheet or the workout with the video open`, async ({
    page,
    net,
  }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    const overflow = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    await openUnlocked(page);
    await page.locator('#parts summary', { hasText: 'Warm-up' }).click();
    await page.locator('.move-link', { hasText: 'Warm one' }).click();
    await page.locator('.sheet #video-btn').click();
    await page.locator('.sheet #more summary').click();
    await expect(page.locator('.sheet iframe')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    const sheetOver = await page
      .locator('.sheet')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(sheetOver).toBeLessThanOrEqual(0);
    for (const b of await page.locator('.sheet button, .sheet summary').all()) {
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Close' }).click();
    await startWorkout(page);
    await page.locator('#video-btn').click();
    await expect(page.locator('#video-holder iframe')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}

test('very long unbroken words in how, why, tips, watch-out and the move name wrap at 320px', async ({
  page,
  net,
}) => {
  const long = 'x'.repeat(120);
  const program = makeRoundsProgram();
  const first = (program.workouts as Record<string, unknown>[])[0];
  first.warmup = [
    {
      name: `Name${long}`,
      how: [`How${long}`],
      reps: '5 times',
      why: `Why${long}`,
      tips: [`Tip${long}`],
      watchOut: [`Out${long}`],
    },
  ];
  setup(net, program);
  await page.setViewportSize({ width: 320, height: 640 });
  const overflow = (): Promise<number> =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
  await openUnlocked(page);
  await page.locator('#parts summary', { hasText: 'Warm-up' }).click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.locator('.move-link').first().click();
  await page.locator('.sheet #more summary').click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(
    await page.locator('.sheet').evaluate((el) => el.scrollWidth - el.clientWidth)
  ).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await startWorkout(page);
  await page.locator('#more summary').click();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
