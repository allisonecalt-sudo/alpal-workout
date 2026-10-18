#!/usr/bin/env node
// scripts/pw-run.mjs - Playwright launcher.
//  - --fast runs only the unit tests (tests/*.test.ts) on one project (pre-commit hook).
//  - Otherwise runs everything on both projects.
//  - Port: asks the OS for a free port unless PW_PORT is set, and never reuses a stale server.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export function fastFiles() {
  return readdirSync(join(root, 'tests'))
    .filter((f) => f.endsWith('.test.ts'))
    .sort()
    .map((f) => `tests/${f}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const fast = args[0] === '--fast';
  const rest = fast ? args.slice(1) : args;
  const env = { ...process.env };
  if (!env.PW_PORT) {
    env.PW_PORT = String(await freePort());
    env.PW_FRESH_SERVER = '1';
  }
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const files = fast ? fastFiles() : [];
  const projectArgs = fast ? ['--project=chromium'] : [];
  console.log(`[pw-run] port ${env.PW_PORT}${fast ? `, ${files.length} files` : ''}`);
  const r = spawnSync(process.execPath, [cli, 'test', ...files, ...projectArgs, ...rest], {
    stdio: 'inherit',
    cwd: root,
    env,
  });
  process.exit(r.status ?? 1);
}
