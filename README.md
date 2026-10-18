# alpal-workout

A small guided workout app for one person at a time. Open it on a phone, enter an access code once, and it walks through today's moves one screen at a time.

## What it is

- Installable PWA (works offline after the first open), English, left to right.
- Four screens: unlock (first open only), Home, Workout, After.
- Everything personal (the person's name, the program, a contact number) is **not in this repo**. It is loaded at runtime from a locked store.

## Why it is built this way

The repo is public, so it holds no names, no program content and no phone numbers. Tests use neutral fixtures ("Test User", "Move one"). The store is locked so that the public key in `config.ts` can do exactly two things: load the program for a valid code, and save a finished session for a valid code.

## What is decided

- **Store access:** only two functions, `guest_load` and `guest_save_session`, called with `POST` over `/rest/v1/rpc/`. The code travels in the JSON body, never in a URL. All calls live in `store.ts`; if the privacy design changes, that is the one file to change (the schema the functions live in is one constant there).
- **Tables:** `setup.sql` creates three tables with row level security on, no policies and no grants for the public roles. It is a file only; this repo never runs it.
- **Offline:** the last good copy of the program is kept on the phone. A finished workout that cannot be sent is queued (each has a client id, so a retry never duplicates) and sent on the next open. A refused save (`ok:false`) is not retried.
- **Timer:** wall-clock based, so it survives the screen locking and reloads.
- **Look:** warm light palette, one accent colour used only for the Start button, nothing red, no streaks.

## Layout

| File                            | What                                              |
| ------------------------------- | ------------------------------------------------- |
| `app.ts`                        | shell: picks the screen, saves, flushes the queue |
| `screens/`                      | unlock, home, workout, after, not-loaded          |
| `store.ts`                      | the only code that talks to the store             |
| `storage.ts`                    | everything kept on the phone (localStorage)       |
| `program.ts`                    | checks the shape of what the store sends          |
| `timer.ts`, `queue.ts`          | pure logic with unit tests                        |
| `copy.ts`                       | every word the app shows                          |
| `sw.js`, `manifest.webmanifest` | offline shell                                     |
| `setup.sql`                     | the locked store (not run by this repo)           |

## Commands

```
npm ci
npm run build        # tsc type check + esbuild bundle dist/app.<hash>.js
npm run lint
npm run format:check
npm run test:fast    # unit tests only (also the pre-commit hook)
npm test             # unit + browser tests, WebKit (iPhone 13) and Chromium (Pixel 7)
npm run icons        # redraw the placeholder icons
```

Browser tests stub every store request; nothing reaches the network. Install the browsers once with `npx playwright install webkit chromium`.

## Versioning

`package.json` `appVersion` is the one source. The build injects it into the visible header tag and into the service worker cache name, so they always match. Bump it on every deploy.

## Deploy

CI (`.github/workflows/ci.yml`): format, lint, build, tests, then GitHub Pages on a push to `main`.

## What is next

Create the store with `setup.sql`, add the first user and week, then share the link and code.
