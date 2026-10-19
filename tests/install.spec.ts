import type { Page } from '@playwright/test';
import { expect, openUnlocked, test } from './fixtures';

const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const SAFARI_STEPS = [
  'Tap the Share button (the square with an arrow pointing up) at the bottom of the screen.',
  'Scroll down and tap "Add to Home Screen".',
  'Tap "Add".',
];
const IOS_CHROME_STEPS = [
  'Tap the Share button (the square with an arrow pointing up) next to the address bar.',
  'Tap "Add to Home Screen".',
  'Tap "Add".',
];
const ANDROID_STEPS = [
  'Tap the ⋮ menu at the top right.',
  'Tap "Add to Home screen" (or "Install app").',
  'Tap "Add" / "Install".',
];
const IPHONE_LINE =
  'When you open it from your home screen, enter your code once more. The home-screen app keeps its own storage.';
const FULL_SCREEN = 'Then it opens full screen, like a real app, and works even without internet.';

/** In a browser tab, not opened from the home screen. */
async function inBrowser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
  });
}

/** Opened from the home screen: the display-mode query says standalone. */
async function standaloneByMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => {
      const m = real(q);
      return q.includes('display-mode: standalone')
        ? ({
            matches: true,
            media: q,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            onchange: null,
            dispatchEvent: () => true,
          } as unknown as MediaQueryList)
        : m;
    };
  });
}

async function unlockScreen(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Welcome!');
}

const firstSteps = (page: Page) => page.locator('#install-first li');

test.describe('the unlock screen in a browser tab (Safari on an iPhone)', () => {
  test.use({ userAgent: SAFARI });

  test('the home-screen steps come first, the code box waits behind a link', async ({
    page,
    net,
  }) => {
    await inBrowser(page);
    await unlockScreen(page);
    await expect(page.locator('.unlock-step h2')).toHaveText([
      'Step 1: Put the app on your home screen',
      'Step 2: Open it from your home screen and enter your code.',
    ]);
    await expect(firstSteps(page)).toHaveText(SAFARI_STEPS);
    await expect(page.locator('#install-storage')).toHaveText(
      "The home-screen app keeps its own storage, so you'll enter your code there."
    );
    await expect(page.locator('#install-fullscreen')).toHaveText(FULL_SCREEN);
    // the code box is not there yet
    await expect(page.locator('#code-input')).toBeHidden();
    await expect(page.locator('#unlock-btn')).toBeHidden();
    await expect(page.locator('#show-code')).toHaveText('Or enter your code here for now');
    // the steps are above the link, and the link is above where the code box will be
    const s1 = await page.locator('.unlock-step').first().boundingBox();
    const link = await page.locator('#show-code').boundingBox();
    expect((s1?.y ?? 0) + (s1?.height ?? 0)).toBeLessThanOrEqual((link?.y ?? 0) + 1);
    // the link reveals the code box, and the code still works from here
    await page.locator('#show-code').click();
    await expect(page.locator('#code-input')).toBeVisible();
    await expect(page.locator('#show-code')).toBeHidden();
    await page.locator('#code-input').fill('A0B1-1C2D');
    await page.locator('#unlock-btn').click();
    await expect(page.locator('#greeting')).toBeVisible();
    expect(net.loads).toEqual(['A0B11C2D']);
  });

  test('another browser fold holds the other two sets of steps', async ({ page }) => {
    await inBrowser(page);
    await unlockScreen(page);
    const fold = page.locator('#install-other');
    await expect(fold.locator('summary')).toHaveText('Using another browser?');
    await expect(fold).not.toHaveAttribute('open', '');
    await fold.locator('summary').click();
    await expect(fold.locator('h3')).toHaveText(['Chrome (iPhone)', 'Chrome (Android)']);
    await expect(fold.locator('ol').nth(0).locator('li')).toHaveText(IOS_CHROME_STEPS);
    await expect(fold.locator('ol').nth(1).locator('li')).toHaveText(ANDROID_STEPS);
  });

  test('a wrong saved code shows the code box at once, with the message', async ({ page, net }) => {
    await inBrowser(page);
    net.code = 'ZZZZZZZZ';
    await page.addInitScript(() => localStorage.setItem('aw.code', 'A0B11C2D'));
    await page.goto('/');
    await expect(page.locator('#code-input')).toBeVisible();
    await expect(page.locator('#unlock-error')).toHaveText(
      "That code didn't work. Check it with Allison."
    );
  });
});

test.describe('opened from the home screen', () => {
  test('navigator.standalone: only the code box, no steps', async ({ page }) => {
    // (the default for every test: see fixtures)
    await unlockScreen(page);
    await expect(page.locator('#code-input')).toBeVisible();
    await expect(page.locator('#unlock-steps')).toHaveCount(0);
    await expect(page.locator('#install-first')).toHaveCount(0);
    await expect(page.locator('#show-code')).toHaveCount(0);
  });

  test('display-mode: standalone: the same', async ({ page }) => {
    await standaloneByMedia(page);
    await unlockScreen(page);
    await expect(page.locator('#code-input')).toBeVisible();
    await expect(page.locator('#unlock-steps')).toHaveCount(0);
  });

  test('Home has no card either way', async ({ page }) => {
    await openUnlocked(page);
    await expect(page.locator('#greeting')).toBeVisible();
    await expect(page.locator('#install-card')).toHaveCount(0);
  });

  test('display-mode: standalone: Home has no card', async ({ page }) => {
    await standaloneByMedia(page);
    await openUnlocked(page);
    await expect(page.locator('#greeting')).toBeVisible();
    await expect(page.locator('#install-card')).toHaveCount(0);
  });
});

const KINDS = [
  {
    name: 'Safari on an iPhone',
    ua: SAFARI,
    title: 'Safari (iPhone)',
    steps: SAFARI_STEPS,
    iphone: true,
  },
  {
    name: 'Chrome on an iPhone',
    ua: IOS_CHROME,
    title: 'Chrome (iPhone)',
    steps: IOS_CHROME_STEPS,
    iphone: true,
  },
  {
    name: 'Chrome on Android',
    ua: ANDROID,
    title: 'Chrome (Android)',
    steps: ANDROID_STEPS,
    iphone: false,
  },
];

for (const k of KINDS) {
  test.describe(`${k.name}: the card on Home`, () => {
    test.use({ userAgent: k.ua });

    test('shows this browser first, then the fold with the others', async ({ page }) => {
      await inBrowser(page);
      await openUnlocked(page);
      const card = page.locator('#install-card');
      await expect(card).toBeVisible();
      await expect(card.locator('h2')).toHaveText('Add to your Home Screen');
      await expect(page.locator('#install-first h3')).toHaveText(k.title);
      await expect(firstSteps(page)).toHaveText(k.steps);
      if (k.iphone) await expect(page.locator('#install-storage')).toHaveText(IPHONE_LINE);
      else await expect(page.locator('#install-storage')).toHaveCount(0);
      await expect(page.locator('#install-fullscreen')).toHaveText(FULL_SCREEN);
      const others = KINDS.filter((o) => o.name !== k.name).map((o) => o.title);
      await page.locator('#install-other summary').click();
      await expect(page.locator('#install-other h3')).toHaveText(others);
      // under the greeting, not above it
      const g = await page.locator('#greeting').boundingBox();
      const c = await card.boundingBox();
      expect(c?.y ?? 0).toBeGreaterThan((g?.y ?? 0) + (g?.height ?? 0) - 1);
    });

    test('the same steps in the first-screen unlock list', async ({ page }) => {
      await inBrowser(page);
      await unlockScreen(page);
      await expect(page.locator('#install-first h3')).toHaveText(k.title);
      await expect(firstSteps(page)).toHaveText(k.steps);
    });
  });
}

test.describe('Not now, and the Settings row', () => {
  test.use({ userAgent: SAFARI });

  test('Not now hides the card for 7 days, and it stays hidden after a reload', async ({
    page,
  }) => {
    await inBrowser(page);
    await openUnlocked(page);
    const btn = page.locator('#install-notnow');
    await expect(btn).toHaveText('Not now');
    expect((await btn.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    const before = Date.now();
    await btn.click();
    await expect(page.locator('#install-card')).toHaveCount(0);
    const until = Number(await page.evaluate(() => localStorage.getItem('aw.installHidden')));
    const days = (until - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    await page.reload();
    await expect(page.locator('#greeting')).toBeVisible();
    await expect(page.locator('#install-card')).toHaveCount(0);
  });

  test('after the 7 days are over the card is back', async ({ page }) => {
    await inBrowser(page);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__old')) {
        sessionStorage.setItem('__old', '1');
        localStorage.setItem('aw.installHidden', String(Date.now() - 1000));
      }
    });
    await openUnlocked(page);
    await expect(page.locator('#install-card')).toBeVisible();
  });

  test('still hidden one second before the 7 days are over', async ({ page }) => {
    await inBrowser(page);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__old')) {
        sessionStorage.setItem('__old', '1');
        localStorage.setItem('aw.installHidden', String(Date.now() + 1000 * 60 * 60));
      }
    });
    await openUnlocked(page);
    await expect(page.locator('#greeting')).toBeVisible();
    await expect(page.locator('#install-card')).toHaveCount(0);
  });

  test('the Settings row opens the same card any time, even installed', async ({ page }) => {
    await openUnlocked(page); // installed (the test default)
    await page.locator('#settings-btn').click();
    const row = page.locator('#install-row');
    await expect(row).toContainText('Put the app on your home screen');
    expect((await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#install-card')).toHaveCount(0);
    await row.click();
    await expect(page.locator('#install-card')).toBeVisible();
    await expect(firstSteps(page)).toHaveText(SAFARI_STEPS);
    await expect(page.locator('#install-notnow')).toHaveCount(0); // no Not now in Settings
    await row.click();
    await expect(page.locator('#install-card')).toHaveCount(0);
  });

  test('the Settings row works when not installed, even after Not now', async ({ page }) => {
    await inBrowser(page);
    await openUnlocked(page);
    await page.locator('#install-notnow').click();
    await page.locator('#settings-btn').click();
    await page.locator('#install-row').click();
    await expect(page.locator('#install-card')).toBeVisible();
  });
});

test.describe('the browser offers its own install (Android Chrome)', () => {
  test.use({ userAgent: ANDROID });

  test('an Install button calls the browser prompt', async ({ page }) => {
    await inBrowser(page);
    await openUnlocked(page);
    await expect(page.locator('#install-card')).toBeVisible();
    await expect(page.locator('#install-btn')).toHaveCount(0); // nothing offered yet
    await page.evaluate(() => {
      const w = window as unknown as { __prompted: number };
      w.__prompted = 0;
      const e = new Event('beforeinstallprompt') as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      };
      e.prompt = async () => {
        w.__prompted++;
      };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    const btn = page.locator('#install-btn');
    await expect(btn).toHaveText('Install');
    await btn.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted))
      .toBe(1);
    await expect(page.locator('#install-btn')).toHaveCount(0);
  });
});

for (const width of [320, 390, 402, 430]) {
  test.describe(`no sideways scroll at ${width}px`, () => {
    test.use({ userAgent: SAFARI });

    test('unlock steps (code box shown), Home card with the fold open, Settings card', async ({
      page,
    }) => {
      await inBrowser(page);
      await page.setViewportSize({ width, height: 800 });
      const over = (): Promise<number> =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
      await unlockScreen(page);
      await page.locator('#install-other summary').click();
      expect(await over()).toBeLessThanOrEqual(0);
      await page.locator('#show-code').click();
      expect(await over()).toBeLessThanOrEqual(0);
      await page.locator('#code-input').fill('A0B1-1C2D');
      await page.locator('#unlock-btn').click();
      await expect(page.locator('#install-card')).toBeVisible();
      await page.locator('#install-other summary').click();
      expect(await over()).toBeLessThanOrEqual(0);
      for (const b of await page.locator('#install-card button, #install-card summary').all()) {
        expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await page.locator('#settings-btn').click();
      await page.locator('#install-row').click();
      expect(await over()).toBeLessThanOrEqual(0);
    });
  });
}
