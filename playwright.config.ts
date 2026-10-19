import { defineConfig, devices } from '@playwright/test';

// The app's "this week" maths is calendar based; pin the zone so CI matches the laptop.
process.env.TZ = 'Asia/Jerusalem';

const PORT = process.env.PW_PORT ?? '4173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // A worker would sit between the page and the stubbed store; only tests/offline.spec.ts opts in.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
    // Her phone (iPhone 17): the closest built-in descriptor, with the viewport overridden.
    {
      name: 'iphone17',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 402, height: 874 },
        screen: { width: 402, height: 874 },
      },
    },
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx serve -l ${PORT} .`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI && !process.env.PW_FRESH_SERVER,
    timeout: 120_000,
  },
});
