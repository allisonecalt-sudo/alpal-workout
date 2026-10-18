import { readFileSync } from 'node:fs';
import { expect, openUnlocked, test } from './fixtures';

// This file lets the service worker run (the config blocks it everywhere else).
test.use({ serviceWorkers: 'allow' });

const version = JSON.parse(readFileSync('package.json', 'utf8')).appVersion as string;

test('the worker caches the shell under the app version and the app opens offline', async ({
  page,
  context,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toHaveText('Hi Test User 👋');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  // the shell cache is named after the same version the header shows
  await expect(page.locator('#app-version')).toHaveText(version);
  const names = await page.evaluate(() => caches.keys());
  expect(names.some((n) => n.startsWith(`alpal-workout-${version}-`) && n.endsWith('-shell'))).toBe(
    true
  );

  // wait until the worker controls the page, then go offline and reopen
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#greeting')).toHaveText('Hi Test User 👋'); // shell + last good copy
  await expect(page.locator('#app-version')).toHaveText(version);
});
