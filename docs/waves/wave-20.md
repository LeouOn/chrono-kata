# Wave 20 — Hardening and release (part 1: error boundaries and a local error log)

**Status:** part 1 · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 20
**Status map:** `docs/ROADMAP_STATUS.md` W20

A render error must never end in a blank screen or a lost afternoon. Part 1 adds
error boundaries on every route, a calm shared screen for them, and a local,
on-device error log with a Settings viewer. No telemetry, nothing is sent
anywhere. (The integrity checker and the loop E2E are later parts.)

## Shipped

- Boundaries: `src/app/error.tsx` (root segment), `src/app/(main)/error.tsx`,
  `src/app/onboarding/error.tsx`, and `src/app/global-error.tsx` for the case
  where the root layout itself throws (it renders its own `<html>`/`<body>`).
- `RouteErrorScreen`: the one calm screen all of them use. No stack on screen,
  no red; it says what happened, that the data is safe, and offers **Try again**
  and **Home** (44 px, the visible text is the accessible name).
- `src/lib/errors/error-log.ts`: a `localStorage` ring buffer (50 entries) that
  never throws, with the route kept as a pathname only (never the query).
- `useRecordError`: one error is one entry. It records in an effect, never during
  render, and once per error object even under StrictMode (which runs effects
  twice in development). A new error object after "Try again" is a new entry.
- `ErrorLogSettings`, behind the `taskInbox` preview flag like the other new
  cards: list, **Export error log**, **Reload error log**, **Clear error log**
  (behind a confirm). The buttons say what they act on because Settings already
  has other Export and Refresh buttons, and existing specs match a name as a
  case-insensitive *substring*: a button named "Refresh error log" would still
  match `{ name: 'Refresh' }` and break `w8-calendar-interop.spec.ts`, so the
  reload button is "Reload error log".

## Privacy, stated as the code behaves

Nothing leaves the device unless the user exports the log. An entry holds the
error's name, message, stack, the route (pathname) and a time. Message and stack
are **truncated, not redacted**: a short message that interpolates the user's own
text (a task title, say) is stored whole and is not flagged. So an entry can
contain short fragments of the user's own text; the card says so beside Export
("Entries can include short fragments of your own text. Read them before you
share the file."). A message cut at 200 characters is flagged "trimmed".

## Checking the boundary in the static (Android) export

The Android build is a static export, so the boundary has to be shown to work
there, not only under `next start`. That check is an opt-in spec,
`tests/e2e/w20-static-export-check.spec.ts`, skipped unless `W20_STATIC_EXPORT=1`
(the normal suite has no server on `:3049`):

```bash
npm run build:android                 # NEXT_EXPORT=true build into out/ (it moves src/app/api aside and back)
python3 -m http.server 3049 -d out &  # plain HTTP, no Next server
W20_STATIC_EXPORT=1 npx playwright test tests/e2e/w20-static-export-check.spec.ts
```

A bare `NEXT_EXPORT=true next build` fails on the pre-existing `/api` route; use
`build:android`. A local build rewrites `public/sw.js`: restore it before
committing. Set `PLAYWRIGHT_PORT` to a free port if 3008 is taken.

## What was actually run (2026-10-24, after round 1 of the review)

- `next build`: exit 0.
- `PLAYWRIGHT_PORT=3058 npx playwright test tests/e2e/w8-calendar-interop.spec.ts
  tests/e2e/w20-error-boundary.spec.ts tests/e2e/w6-planning-settings.spec.ts
  --repeat-each=3`: exit 0, **21 passed**. That includes
  `w8-calendar-interop.spec.ts › rejects a non-https address calmly`, the
  `{ name: 'Refresh' }` locator that the second "Refresh" had broken.
- `npx playwright test tests/e2e/w20-static-export-check.spec.ts` *without* the
  env var: exit 0, **1 skipped**.
- `npm run build:android`: exit 0 (`out/index.html`, `out/settings.html`,
  `out/inbox.html` present); `python3 -m http.server 3049 -d out`; then
  `W20_STATIC_EXPORT=1 npx playwright test tests/e2e/w20-static-export-check.spec.ts`:
  exit 0, **1 passed**: the corrupt-row scenario triggers the boundary in the
  static export, and following its Home link renders the Home screen.

## Not covered

- A real Android WebView / device: the export is served over plain HTTP in
  desktop Chromium, which is the closest thing available here.
- The corrupt-row path is exercised through the inbox; a throw in the root
  layout (the `global-error.tsx` case) has unit tests but no end-to-end path
  without a test-only route.
