// Draws the placeholder icons (a soft circle with a simple mark) and writes the PNGs.
// Run: npm run icons   (uses Playwright's Chromium; no external assets)
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The mark: a small circle (a head) over a gentle arc (arms lifted). Keep it inside the
// central 60% so the maskable version survives any crop.
function svg({ rounded }) {
  const bg = rounded
    ? '<rect width="512" height="512" rx="112" fill="#f7f1e8"/>'
    : '<rect width="512" height="512" fill="#f7f1e8"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${bg}
  <circle cx="256" cy="256" r="150" fill="#3f7d5c"/>
  <circle cx="256" cy="212" r="26" fill="#fffaf2"/>
  <path d="M184 300 Q256 236 328 300" fill="none" stroke="#fffaf2" stroke-width="22" stroke-linecap="round"/>
</svg>
`;
}

writeFileSync(join(root, 'icon.svg'), svg({ rounded: true }));

const jobs = [
  { out: 'icon-192.png', size: 192, rounded: true },
  { out: 'icon-512.png', size: 512, rounded: true },
  { out: 'icon-maskable-512.png', size: 512, rounded: false },
  { out: 'apple-touch-icon.png', size: 180, rounded: false },
];

const browser = await chromium.launch();
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.size, height: job.size } });
    await page.setContent(
      `<!doctype html><style>*{margin:0}svg{display:block;width:${job.size}px;height:${job.size}px}</style>${svg(job)}`
    );
    await page.screenshot({
      path: join(root, job.out),
      clip: { x: 0, y: 0, width: job.size, height: job.size },
    });
    await page.close();
    console.log(`wrote ${job.out}`);
  }
} finally {
  await browser.close();
}
