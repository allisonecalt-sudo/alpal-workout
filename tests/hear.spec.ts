import type { Page } from '@playwright/test';
import {
  CODE,
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  test,
  type Net,
} from './fixtures';

type Win = {
  __audio: { plays: string[]; el: HTMLMediaElement | null };
  __advance: (s: number) => void;
};

/** Workout A: Warm one (video + audio), Warm two (audio only), Main one (video only), Cool one (audio). */
function setup(net: Net, version?: string): void {
  const program = makeRoundsProgram();
  const a = (
    program.workouts as {
      warmup: Record<string, unknown>[];
      main: Record<string, unknown>[];
      cooldown: Record<string, unknown>[];
    }[]
  )[0];
  a.warmup[0].audio = true;
  a.warmup[1].audio = true;
  a.main[0].video = 'https://youtu.be/abcdefghijk';
  a.cooldown[0].audio = true;
  a.cooldown[0].video = 'https://youtu.be/abcdefghijk';
  if (version) program.audioVersion = version;
  net.guest = makeGuest({ program, sessions: [] });
}

const hearPlays = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__audio.plays.length);

test('Hear how and Watch how are two pills in the same row, right above More about this move', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  const hear = page.locator('#hear-btn');
  const watch = page.locator('#video-btn');
  await expect(hear).toHaveText('🔊 Hear how');
  await expect(watch).toHaveText('▶ Watch how');
  const a = await hear.boundingBox();
  const b = await watch.boundingBox();
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThan(2);
  expect((a?.x ?? 0) + (a?.width ?? 0)).toBeLessThanOrEqual((b?.x ?? 0) + 1);
  expect(a?.height ?? 0).toBeGreaterThanOrEqual(44);
  const more = await page.locator('#more').boundingBox();
  expect(more?.y ?? 0).toBeGreaterThan((a?.y ?? 0) + (a?.height ?? 0));
  // a move with only audio: one pill; with only a video: one pill; with neither: no row
  await page.locator('#done-btn').click();
  await expect(page.locator('#hear-btn')).toBeVisible();
  await expect(page.locator('#video-btn')).toHaveCount(0);
  await page.locator('#done-btn').click();
  await expect(page.locator('#video-btn')).toBeVisible();
  await expect(page.locator('#hear-btn')).toHaveCount(0);
  await page.locator('#done-btn').click();
  await expect(page.locator('#pills')).toHaveCount(0);
});

test('the Home move sheet and the cool-down rows have it too', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await page.locator('#parts summary').first().click();
  await page.locator('.move-link').first().click();
  await expect(page.locator('.sheet #hear-btn')).toBeVisible();
  await expect(page.locator('.sheet #video-btn')).toBeVisible();
  await page.locator('#sheet-close').click();
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.locator('#next-round-btn').click();
  for (let k = 0; k < 2; k++) await page.locator('#done-btn').click();
  await page.locator('#cooldown .cd-row summary').first().click();
  await expect(page.locator('#hear-btn-0')).toBeVisible();
  await expect(page.locator('#video-btn-0')).toBeVisible();
});

test('a tap fetches once (the code in the body), shows the player, and it plays', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player')).toBeVisible();
  expect(net.audioCalls).toHaveLength(1);
  expect(net.audioCalls[0].url).not.toContain(CODE);
  expect(net.audioCalls[0].body).toEqual({ p_code: CODE, p_name: 'Warm one' });
  await expect(page.locator('.player-time')).toHaveText('0:00 / 0:38');
  await expect(page.locator('.player-btn')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => (window as unknown as Win).__advance(12));
  await expect(page.locator('.player-time')).toHaveText('0:12 / 0:38');
  await expect(page.locator('.player-bar')).toHaveAttribute('aria-valuenow', '32');
  await page.locator('.player-btn').click();
  await expect(page.locator('.player-btn')).toHaveAttribute('aria-label', 'Play');
  await page.locator('.player-btn').click();
  await expect(page.locator('.player-btn')).toHaveAttribute('aria-label', 'Pause');
  expect(await hearPlays(page)).toBe(2);
});

test('the second play comes from the phone, and works offline after a reload', async ({
  page,
  net,
}) => {
  setup(net, 'v2');
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player')).toBeVisible();
  await page.locator('#hear-btn').click(); // hide
  await expect(page.locator('.player')).toHaveCount(0);
  await page.locator('#hear-btn').click(); // again
  await expect(page.locator('.player')).toBeVisible();
  expect(net.audioCalls).toHaveLength(1);
  // the cache key carries the audio version
  const keys = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('alpal');
        open.onsuccess = () => {
          const req = open.result.transaction('audio').objectStore('audio').getAllKeys();
          req.onsuccess = () => resolve(req.result.map(String));
        };
      })
  );
  expect(keys).toEqual(['Warm one|v2']);
  // offline, after a reload, the explanation still plays
  net.online = false;
  await page.reload();
  await expect(page.locator('#move-name')).toHaveText('Warm one');
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player')).toBeVisible();
  expect(net.audioCalls).toHaveLength(1);
});

test('offline with nothing saved: the plain message, and it can be tried again', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  net.online = false;
  await page.locator('#hear-btn').click();
  await expect(page.locator('#audio-msg')).toHaveText(
    'The explanation needs internet the first time.'
  );
  net.online = true;
  await page.locator('#hear-btn').click(); // hides the message
  await expect(page.locator('#audio-msg')).toHaveCount(0);
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player')).toBeVisible();
});

test('missing: the button goes away and stays away for this visit', async ({ page, net }) => {
  setup(net);
  net.audioMode['Warm one'] = 'missing';
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#hear-btn').click();
  await expect(page.locator('#hear-btn')).toHaveCount(0);
  await expect(page.locator('#video-btn')).toBeVisible(); // the video pill is untouched
  await page.locator('#done-btn').click();
  await page.locator('#back-btn').click();
  await expect(page.locator('#move-name')).toHaveText('Warm one');
  await expect(page.locator('#hear-btn')).toHaveCount(0);
  expect(net.audioCalls).toHaveLength(1);
});

test('one sound at a time: the video pauses the audio, the audio removes the video', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player-btn')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('#video-btn').click();
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.locator('.player-btn')).toHaveAttribute('aria-label', 'Play');
  // pressing ▶ on the player removes the open video, by itself
  await page.locator('.player-btn').click();
  await expect(page.locator('.player-btn')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('#video-btn')).toHaveText('▶ Watch how');
  await expect(page.locator('#video-btn')).toHaveAttribute('aria-expanded', 'false');
  // and the other way round: the video pauses it again
  await page.locator('#video-btn').click();
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.locator('.player-btn')).toHaveAttribute('aria-label', 'Play');
  // a new Hear how (hide, then open) removes the video too
  await page.locator('#hear-btn').click();
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('leaving the move stops the audio: Done, Back, Pause and Exit', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  const stopped = async (): Promise<boolean> =>
    page.evaluate(() => {
      const w = window as unknown as Win;
      return w.__audio.el === null || w.__audio.el.paused;
    });
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player')).toBeVisible();
  await page.locator('#done-btn').click();
  expect(await stopped()).toBe(true);
  await expect(page.locator('.player')).toHaveCount(0);
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player')).toBeVisible();
  await page.locator('#back-btn').click();
  expect(await stopped()).toBe(true);
  await page.locator('#hear-btn').click();
  await page.getByRole('button', { name: 'Pause workout' }).click();
  expect(await stopped()).toBe(true);
  await page.locator('#resume-btn').click();
  await page.locator('#hear-btn').click();
  await page.locator('#exit-btn').click();
  expect(await stopped()).toBe(true);
});

test('starting a recording pauses the audio', async ({ page, net }) => {
  setup(net);
  await openUnlocked(page);
  await startWorkout(page);
  await page.locator('#hear-btn').click();
  await expect(page.locator('.player-btn')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('#note-btn').click();
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-time')).toBeVisible();
  const paused = await page.evaluate(() => (window as unknown as Win).__audio.el?.paused ?? true);
  expect(paused).toBe(true);
});

for (const width of [320, 390, 402, 430]) {
  test(`no sideways scroll at ${width}px: the pill row and the player`, async ({ page, net }) => {
    setup(net);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await startWorkout(page);
    await page.locator('#hear-btn').click();
    await expect(page.locator('.player')).toBeVisible();
    await page.locator('#video-btn').click();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    const row = await page.locator('#pills').boundingBox();
    expect((row?.x ?? 0) + (row?.width ?? 0)).toBeLessThanOrEqual(width);
  });
}
