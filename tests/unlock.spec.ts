import { CODE, expect, test } from './fixtures';

test('first open asks for the code, with the right words and an iOS-safe input', async ({
  page,
  net,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  await expect(page.getByText('Enter the code Allison sent you.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open my app' })).toBeVisible();
  const input = page.locator('#code-input');
  await expect(input).toHaveAttribute('autocapitalize', 'characters');
  await expect(input).toHaveAttribute('autocorrect', 'off');
  const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
  // nothing is asked of the store before a code is typed
  expect(net.loads).toEqual([]);
  // the tell button is not shown before unlock
  await expect(page.locator('#tell')).toBeHidden();
});

test('a good code opens Home and is remembered', async ({ page, net }) => {
  await page.goto('/');
  await page.locator('#code-input').fill('A0B1-1C2D');
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#greeting')).toHaveText('Hi Test User 👋');
  expect(net.loads).toEqual([CODE]);
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBe(CODE);
  // storage is asked to persist once after a successful unlock
  expect(await page.evaluate(() => (window as unknown as { __persist: number }).__persist)).toBe(1);

  // second open goes straight to Home
  await page.reload();
  await expect(page.locator('#greeting')).toHaveText('Hi Test User 👋');
  await expect(page.locator('#code-input')).toHaveCount(0);
});

test('typed codes are normalised before they are sent', async ({ page, net }) => {
  await page.goto('/');
  // lower case, a space, a dash, O for 0, I for 1, L for 1
  await page.locator('#code-input').fill('aob1 -ic2d');
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.loads).toEqual(['A0B11C2D']);
});

test('a code pasted with an en-dash opens the app', async ({ page, net }) => {
  await page.goto('/');
  await page.locator('#code-input').fill('a0b1\u20131c2d');
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.loads).toEqual(['A0B11C2D']);
});

test('a wrong code gets the gentle message and nothing is saved', async ({ page, net }) => {
  await page.goto('/');
  await page.locator('#code-input').fill('ZZZZ-ZZZZ');
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#unlock-error')).toHaveText(
    "That code didn't work. Check it with Allison."
  );
  expect(net.loads).toEqual(['ZZZZZZZZ']);
  expect(await page.evaluate(() => localStorage.getItem('aw.code'))).toBeNull();
  await expect(page.locator('#greeting')).toHaveCount(0);
});

test('a code that cannot be a code is refused without asking the store', async ({ page, net }) => {
  await page.goto('/');
  await page.locator('#code-input').fill('123');
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#unlock-error')).toHaveText(
    "That code didn't work. Check it with Allison."
  );
  expect(net.loads).toEqual([]);
});

test('no connection at unlock says so, and keeps the code field', async ({ page, net }) => {
  net.online = false;
  await page.goto('/');
  await page.locator('#code-input').fill(CODE);
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#unlock-error')).toContainText("Can't reach the app");
  await expect(page.locator('#code-input')).toBeVisible();
});

test('a saved code the store no longer knows sends her back to the code screen', async ({
  page,
  net,
}) => {
  await page.addInitScript(() => localStorage.setItem('aw.code', 'ZZZZZZZZ'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  await expect(page.locator('#unlock-error')).toHaveText(
    "That code didn't work. Check it with Allison."
  );
  expect(net.loads).toEqual(['ZZZZZZZZ']);
});

test('a failed unlock does not ask to persist storage', async ({ page }) => {
  await page.goto('/');
  await page.locator('#code-input').fill('ZZZZ-ZZZZ');
  await page.getByRole('button', { name: 'Open my app' }).click();
  await expect(page.locator('#unlock-error')).toContainText("didn't work");
  expect(await page.evaluate(() => (window as unknown as { __persist: number }).__persist)).toBe(0);
});

test('the version tag is shown on every screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-version')).toContainText('v1.2');
});

test('the header shows the version and the build date and time', async ({ page }) => {
  await page.goto('/');
  // for example "v1.2 · Oct 19 · 08:40"
  await expect(page.locator('#app-version')).toHaveText(
    /^v1\.2 · [A-Z][a-z]{2} \d{1,2} · \d{2}:\d{2}$/
  );
});
