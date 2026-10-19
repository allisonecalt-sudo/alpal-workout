import {
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

const START = 'assets/moves/m01-start.jpg';
const END = 'assets/moves/m01-end.jpg';

type Program = { workouts: { warmup: Record<string, unknown>[] }[] };

function setup(net: Net, mutate: (first: Record<string, unknown>) => void): void {
  const program = makeRoundsProgram();
  mutate((program as unknown as Program).workouts[0].warmup[0]);
  net.guest = makeGuest({ program, sessions: [] });
}

const loaded = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(sel).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);

test('a move with two images shows both frames, start and end, above the how-to lines', async ({
  page,
  net,
}) => {
  setup(net, (m) => (m.images = [START, END]));
  await openUnlocked(page);
  await startWorkout(page);
  const imgs = page.locator('#frames img');
  await expect(imgs).toHaveCount(2);
  await expect(imgs.nth(0)).toHaveAttribute('src', START);
  await expect(imgs.nth(1)).toHaveAttribute('src', END);
  await expect(page.locator('#frames figcaption')).toHaveText(['Start', 'End']);
  await expect(imgs.nth(0)).toHaveAttribute('alt', 'Start position');
  await expect.poll(() => loaded(page, '#frames img >> nth=0')).toBe(true);
  await expect.poll(() => loaded(page, '#frames img >> nth=1')).toBe(true);
  // above the how-to lines
  const frames = (await page.locator('#frames').boundingBox())?.y ?? 0;
  const how = (await page.locator('#how').boundingBox())?.y ?? 0;
  expect(frames).toBeLessThan(how);
  // side by side
  const a = await imgs.nth(0).boundingBox();
  const b = await imgs.nth(1).boundingBox();
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThan(2);
  expect(b?.x ?? 0).toBeGreaterThan((a?.x ?? 0) + (a?.width ?? 0) - 1);
});

test('images win over the video thumbnail, and no thumbnail is requested', async ({
  page,
  net,
}) => {
  setup(net, (m) => {
    m.images = [START, END];
    m.video = 'https://youtu.be/abcdefghijk';
  });
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#frames img')).toHaveCount(2);
  await page.waitForTimeout(300);
  expect(net.thumbs).toEqual([]);
});

test('with a video and no images, the video thumbnail is the picture', async ({ page, net }) => {
  setup(net, (m) => (m.video = 'https://youtu.be/abcdefghijk'));
  await openUnlocked(page);
  await startWorkout(page);
  const img = page.locator('#frames img');
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute('src', 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
  await expect.poll(() => net.thumbs).toEqual(['https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg']);
  // the video itself still waits for the tap
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('no images and no video: no picture box at all', async ({ page, net }) => {
  setup(net, (m) => delete m.video);
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#move-name')).toBeVisible();
  await expect(page.locator('#frames')).toHaveCount(0);
});

test('a picture that cannot load is left out, never a broken box', async ({ page, net }) => {
  setup(net, (m) => (m.images = ['assets/moves/not-there.jpg', END]));
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#frames img')).toHaveCount(1);
  await expect(page.locator('#frames img')).toHaveAttribute('src', END);
});

test('only our own pictures or https links are accepted from the data', async ({ page, net }) => {
  setup(net, (m) => (m.images = ['javascript:alert(1)', 'http://example.com/a.jpg', START]));
  await openUnlocked(page);
  await startWorkout(page);
  await expect(page.locator('#frames img')).toHaveCount(1);
  await expect(page.locator('#frames img')).toHaveAttribute('src', START);
});

test('the move sheet on Home shows the same pictures', async ({ page, net }) => {
  setup(net, (m) => (m.images = [START, END]));
  await openUnlocked(page);
  await page.locator('#parts summary', { hasText: 'Warm-up' }).click();
  await page.locator('.move-link', { hasText: 'Warm one' }).click();
  await expect(page.locator('.sheet #frames img')).toHaveCount(2);
  await expect.poll(() => loaded(page, '.sheet #frames img >> nth=0')).toBe(true);
});

test('a hold move shows its pictures too, above the timer', async ({ page, net }) => {
  const program = makeRoundsProgram();
  (program as unknown as Program).workouts[0].warmup[1].images = [START, END];
  net.guest = makeGuest({ program, sessions: [] });
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#done-btn').click();
  await expect(page.locator('#timer')).toBeVisible();
  await expect(page.locator('#frames img')).toHaveCount(2);
});

for (const width of [320, 390, 402, 430]) {
  test(`pictures have no sideways scroll at ${width}px`, async ({ page, net }) => {
    setup(net, (m) => (m.images = [START, END]));
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await startWorkout(page);
    await expect(page.locator('#frames img')).toHaveCount(2);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
  });
}
