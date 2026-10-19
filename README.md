# alpal-workout

A small guided workout app for one person at a time. Open it on a phone, enter an access code once, and it walks through today's moves one screen at a time.

## What it is

- Installable PWA (works offline after the first open), English, left to right.
- Screens: unlock (first open only), Home, Workout, After, Questions.
- Several workouts a week, each with an optional warm-up, main moves repeated for a number of rounds, and an optional cool-down. Home shows the next one not yet done this week, with the others as chips.
- Every move can carry a video (shown only after a tap, in the no-cookie player) and a few lines of extra info.
- A list of questions can be answered whenever the person likes, one at a time.
- Looking back: a list of past sessions (with an editable note), a weekly review, and a Progress page written in words first (no chart under five points, no streaks).
- Extras: a jump list of steps, a cardio choice, walks outside a workout (never counted toward the week), settings (beeps, rest, get-ready, tips, export, her notes), and a Done card with the moves done for the first time.
- A note to the person who made the app, on every screen: a voice note recorded in the app, or a written one. It is sent from a bottom sheet and carries the name of the screen it was sent from; waiting notes are kept on the phone (IndexedDB) until they can be sent.
- A move can have a spoken explanation ("Hear how", an inline player, kept on the phone after the first play). There is no automatic voice.
- Every move page has a quiet "How was this one?" row (Easy, Right, Hard), saved per move and per round.
- The After screen has a "Tell Allison" card and, while any remain, one inline question.
- First-time tips: one small bubble at a time, each with a Got it; Settings can hide or reset them.
- Everything personal (the person's name, the program, a contact number) is **not in this repo**. It is loaded at runtime from a locked store.

## Why it is built this way

The repo is public, so it holds no names, no program content and no phone numbers. Tests use neutral fixtures ("Test User", "Move one"). The store is locked so that the public key in `config.ts` can only do a handful of things for a valid code: load the program, save a session, an answer or a note, and fetch a spoken explanation.

## What is decided

- **Store access:** only a few public functions (`guest_load`, `guest_save_session`, `guest_save_answer`, `guest_update_note`, `guest_save_message`, `guest_get_audio`), called with `POST` over `/rest/v1/rpc/`. The code travels in the JSON body, never in a URL. All calls live in `store.ts`; if the privacy design changes, that is the one file to change (the schema the functions live in is one constant there).
- **Tables:** six, in a private schema with row level security on, no policies and no grants for the public roles: four from `setup.sql` (users, program, sessions, attempts, which is the brute-force throttle) and two from `migrations/` (questions, answers). The migrations also add the workout column and the distinct lockout reply. These files are a record of what was run; this repo never runs them.
- **Program shape:** workouts with rounds (the older flat list of moves still works and is read as one workout with one round).
- **Offline:** the last good copy of the program is kept on the phone. A finished workout or an answer that cannot be sent is queued (each has a client id, so a retry never duplicates) and sent on the next open. A refused save (`ok:false`) is not retried.
- **Timer:** wall-clock based, so it survives the screen locking and reloads.
- **Look:** warm light palette, one accent colour used only for the Start button, nothing red, no streaks.

## Layout

| File                                           | What                                                            |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `app.ts`                                       | shell: picks the screen, saves, flushes the queue               |
| `screens/`                                     | unlock, home, workout, after, not-loaded                        |
| `store.ts`                                     | the only code that talks to the store                           |
| `storage.ts`                                   | everything kept on the phone (localStorage)                     |
| `idb.ts`, `notes.ts`, `recorder.ts`            | notes to Allison: IndexedDB queue, send, recording              |
| `explain.ts`, `audio.ts`, `tips.ts`, `feel.ts` | spoken explanations, one sound at a time, tips, how a move felt |
| `program.ts`                                   | checks the shape of what the store sends                        |
| `timer.ts`, `queue.ts`, `steps.ts`, `video.ts` | pure logic with unit tests                                      |
| `copy.ts`                                      | every word the app shows                                        |
| `sw.js`, `manifest.webmanifest`                | offline shell                                                   |
| `setup.sql`, `migrations/`                     | the locked store as run (not run by this repo)                  |

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

## Pictures

The two-frame pictures in `assets/moves/` come from the public-domain [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense). A move's data names them in `images`; with none, a video's preview picture is used.

## Versioning

`package.json` `appVersion` is the one source. The build injects it into the visible header tag and into the service worker cache name, so they always match. Bump it on every deploy.

## Deploy

CI (`.github/workflows/ci.yml`): format, lint, build, tests, then GitHub Pages on a push to `main`.

## What is next

The store is created from `setup.sql` and then the files in `migrations/`, in date order. Add the first user and week, then share the link and code.
