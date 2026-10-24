# Wave 19 — UX, accessibility, performance

**Status:** in progress · **PRs:** (1) the in-house a11y sweep and the fixes it found, (2) high
contrast, (3) command palette and shortcut sheet, (4) performance on a 10k-task dataset, (5) empty
states and first-run · **Roadmap:** Wave 19 · **Lane:** B

## What shipped (part 1)

- **`tests/e2e/w19-a11y-sweep.spec.ts`**: an in-house sweep over every route at 390x844, with no new
  dependency (no axe). Four tests:
  1. **The sweep**: every interactive control has an accessible name and, where it shows text, has
     that text inside its name (label-in-name, compared whitespace-insensitively so "15 m" from two
     inline spans is not a false positive); every visible target is at least 44x44 (a checkbox is
     measured by its label, the real tap target; a visually hidden file input is exempt because the
     visible button next to it is the control); no horizontal scroll; exactly one `<h1>` and no skipped
     heading levels; one `<main>` and at least one `<nav>`; every `<svg>` is `aria-hidden` or named.
  2. **Theme-token contrast** computed in the browser from the CSS variables the app really uses,
     in both theme paths (explicit light/dark and the OS-driven System theme, measured on the
     computed colours of a body background, a `text-accent` link and a primary button):
     text/base, text/surface, text/surface-2, text-muted/surface, text-muted/base and the accent in
     both directions (accent as text, and base text on the accent as a button) at AA 4.5:1, for dark
     and light and for all four accent colours.
  3. **Visible focus**: Tab reaches a control on every route and the focused control has an outline or
     a shadow.
  4. **Reduced motion**: with `prefers-reduced-motion: reduce`, no CSS animation or transition runs
     and the modal is in place two frames after it opens (a spring would still be mid-flight), so the
     person who asked for less motion gets none.
- **The fixes the sweep found** (each was red first, with the named element in the failure):
  - `<main>` landmark added once in the root layout (every route had zero).
  - The Home journal and weekly-review links named themselves with an `aria-label` that hid their
    visible text; the visible text is the name now (label-in-name).
  - The insights year arrows' glyphs are `aria-hidden` behind their named buttons; the three chart
    `<svg>`s are `role="img"` with a label.
  - Targets raised to 44x44: the settings/kata icon buttons, the settings segmented chips, the
    checkbox rows (label `min-h-11`), the LLM provider actions, the insights load-response toggles,
    the sessions "New" button, and the plan screen's small links.
  - **Light-theme accent variants**: the bright accents are tuned for a dark surface; on the light
    base amber was 1.9:1 as text and behind the button text. Each accent now has a darker variant in
    the light theme (same hue, same meaning) that clears 4.5:1 both as text and as a button
    background. Dark magenta was also 4.36:1 on the card surface; one shade lighter clears it. The
    values live once as custom properties and are wired into **both light paths** - explicit
    `data-theme="light"` and the default "System" theme resolving to light through
    `prefers-color-scheme` (where no `data-theme` attribute exists, which is the common light-mode
    case and the one the first version missed; found by the lead looking at the built app).
  - **Reduced motion**: a `prefers-reduced-motion` media query in `globals.css` (no CSS animation,
    transition or smooth scrolling) and `MotionProvider` (`MotionConfig reducedMotion="user"`) in the
    root layout, so motion/react skips transform animations too.

## What shipped (part 2)

- **High-contrast mode** as an Appearance setting (`settings.highContrast`, off by default): applied as
  `data-contrast="high"` next to `data-theme`, by the same inline script and `ThemeApplier` that apply
  the theme, so there is no flash and no second source of truth. It works on top of the light or dark
  theme and on the System theme, resolved through `prefers-color-scheme`.
- The palette: black/white text and quiet text at **AAA (≥7:1)**, borders and accents at **AA
  (≥4.5:1)** both as text and behind the button text, with each of the four accent hues in a shade
  that clears those numbers on its surface.
- **`settingsRepo.get()` reads first, and writes only when the row is missing.** A plain
  read-then-write could put the defaults back over a setting written during the same first paint (the
  new test starts several reads of a missing row and a write together, and the old code loses it), so
  the creation is one transaction - but the common path is still a plain read, because a read that
  always opened a read-write transaction cannot run inside a caller's read-only transaction and takes
  a write lock on every screen. The transaction re-checks for the row before writing.
- Screenshots at 390x844 of high contrast in light and dark: `/tmp/qa-w19-shots/` (`home-hc-light.png`,
  `appearance-hc-light.png`, `home-hc-dark.png`, `appearance-hc-dark.png`). The accent swatches under
  Appearance keep the four canonical hues (they identify the hue, not the effective shade).
- Tests: a unit suite for the toggle (applies/removes the attribute from the stored row, the labelled
  control saves, a backup round trip keeps it, a row from before the field imports cleanly), the
  default-row race, `get()` inside a read-only transaction and `get()` not opening a read-write
  transaction when the row exists, and a
  sweep case over 24 combinations (OS light/dark × System/light/dark theme × four accents) asserting the
  token ratios and the computed colours of a `text-accent` link and a primary button.
- A note on the measurement itself: the page background is the `base` token; `body` is transparent, and
  measuring against it compared every colour with black (found and fixed while writing the case).

## What shipped (part 3)

- **The command palette** (Ctrl/Cmd+K): one registry (`src/lib/commands/registry.ts`) of navigation
  commands (Home, Sessions, Reflect, Insights, LLM, Settings; and with the flag on: Inbox, Plan,
  Timeline, Projects, Journal, Weekly review) and three actions (capture a task, start a session,
  keyboard shortcuts). The dialog is the shared `Modal` (focus trap, Escape, focus restore), the list
  is a `listbox` driven by `aria-activedescendant`, arrows move and Enter runs, and typing filters on
  the title, group and keywords.
- **The palette is a shortcut layer, never the only path**: every navigation command targets a route
  that exists in the tab bar or a screen, capture opens the sheet the FAB already opens (a window event
  the launcher listens for), and "start a session" opens the existing form. Running a command performs
  no write of its own, so it cannot bypass a confirmation.
- **The shortcut sheet** is a Settings card generated from the SAME registry (only commands with a
  shortcut appear there), reachable at `/settings#shortcuts` without the palette, and rendered per
  platform (⌘ on Apple).
- **Existing global key handlers, listed so they cannot collide**: `CaptureLauncher` used to bind
  Ctrl/Cmd+K and now listens for the palette's capture request; `ProcessMode` owns keys 1–6 and `s` for
  triage (inert while another dialog is open, and while typing); `Timeline` owns Escape for a live
  drag; `Modal` owns Escape and the Tab cycle for the topmost dialog. The palette adds exactly one
  binding (Ctrl/Cmd+K) and is inert while any other dialog is open.
- **The launcher's key lives in the registry** (`PALETTE_SHORTCUT` in
  `src/lib/commands/registry.ts`): the provider matches it, the palette shows it and the cheat sheet
  lists it as the first row ("Open the command palette"), so the three cannot drift. That entry is
  flag-independent because the launcher is: with the flag off it is the only row on the sheet.
- **The sheet tells the truth about capture**: capturing is Ctrl+K, a query, Enter - or the button -
  so `act.capture` carries no shortcut label. The sheet previously claimed "Capture a task - Ctrl+K",
  which is a key that opens the palette.
- **The sheet is generated, and gated like the app**: the "keys 1-6 / s" line comes from the same flag
  the inbox does, so a flag-off user is not told about keys on a screen they do not have. Escape is
  always listed.
- **The launcher's own exiting panel is not "another dialog"**. The palette is a `Modal`, and a
  `Modal` keeps its `role="dialog"` node while it animates out (~0.5 s), so the old guard
  (`querySelectorAll('[role="dialog"]').length === 0`) counted the palette itself: Ctrl+K, Escape,
  Ctrl+K - the normal "oops, closed it" - did nothing for half a second. The panel is now marked
  (`data-command-palette`) and the guard (`src/lib/commands/palette-guard.ts`) ignores it while still
  treating any other dialog as a reason to stay shut.
- **Decision**: the launcher is **Ctrl+K off Apple and ⌘K on Apple**, and it opens even while focus is in
  a text field. It is the app's one global launcher and making it depend on the cursor is how a shortcut
  starts to feel unreliable; the alternative (inert in inputs) would leave a text field as a dead zone
  for the only global shortcut. On Apple it is Meta-only on purpose: Ctrl+K is the native kill-line in a
  text field, and hijacking it there would be a real loss — so the shortcut keeps the platform's
  convention instead of fighting it. Modals do suppress it, and the sheet states the platform's key.
- **Search ranks, it does not just filter**: a title that starts with the query beats one that contains
  it, which beats a group match, which beats a keyword hit. Without that, typing "capture" listed Inbox
  first (its keyword says captured tasks land there) and put the capture action second — the one word a
  person types to capture would run the wrong command.

### Part 3 tests

- `tests/unit/commands/registry.test.ts` (7): unique ids, flag filtering, case/whitespace-insensitive
  search over title/group/keywords, ranking (prefix > contains > group > keyword), the sheet = exactly
  the shortcut-bearing commands, per-platform labels, and that running a command goes through the
  caller's context.
- `tests/unit/commands/CommandPalette.test.tsx` (8): opens on Ctrl+K and runs the filtered command;
  arrow movement updates `aria-activedescendant`/`aria-selected`; "no command matches"; inert while
  another dialog is on screen; Escape closes; opens from inside a text field (the documented decision);
  the capture action requests the sheet rather than writing anything; flag-off hides gated commands;
  the sheet lists the registry's shortcuts.
- `tests/e2e/w19-palette.spec.ts` (5): Ctrl+K → filter → Enter navigates to the journal; arrows and
  Escape; Ctrl+K 50 ms after Escape opens it again; inert while the capture sheet is open; the Settings
  sheet is in view at `#shortcuts` and lists the palette's own key. The inbox spec's capture helper now goes through the palette, and
  the sweep opens the capture sheet with its button (the shortcut moved).
- `tests/unit/commands/capture-path.test.tsx` (2) is the path that used to be one keystroke, end to end:
  Ctrl+K → palette → type "capture" → Enter leaves the **capture sheet as the only open dialog** and the
  palette closed; the second case reaches the same command with arrows and no query. That is the new
  keystroke count: Ctrl+K, a query (or arrows), Enter — plus the button, which stays one click.
- `tests/unit/tasks/CaptureSheet.test.tsx` moved to the new contract: the launcher opens on the palette's
  capture request and **not** on a bare Ctrl/Cmd+K keydown, the flag-off case listens for nothing (both
  the event and the key), and the stacking/Escape test requests the sheet instead of pressing a key.
- `tests/unit/commands/palette-guard.test.ts` (5): its own closing panel is ignored, a foreign dialog
  still blocks, a foreign dialog beside its own closing panel blocks, toggle-shut, open when clear.
  An integration case presses Ctrl+K 50 ms after Escape and the palette opens. Two mutants: the guard
  counting every dialog → red; the capture row regaining a `Ctrl+K` label → the sheet test red.
- **Flake hunt (the lead's unnamed Helsinki failure)**: 20 runs of `tests/unit/commands` + `tests/unit/tasks`
  under four-way parallel load. Two real nondeterminisms, both now fixed and both named: the palette
  tests searched for flag-gated commands before the settings query had resolved (they now wait for a
  gated option), and the stacking test waited for a dialog to disappear with `waitFor`'s 1 s default
  while the exit animation can outlast that under load (3 s now). 20/20 green after the fix.
- Other mutants: the dialog guard removed → the inert test red; flag filtering removed → the flag test red.

## Decisions where the roadmap was silent

- **No axe-core or any new dependency** (the lead's constraint): every rule is computed from the DOM in
  the page. The trade-off is that this sweep checks a curated set of rules, not axe's whole catalogue;
  it is the project's tripwire, extended rather than replaced.
- **A dense data-visualisation grid is exempt from the 44px rule**: a year heatmap cell is 7px at
  390px wide, and making each cell 44px would destroy the view. The cells are marked
  `data-a11y-exempt="dense-grid"`, keep their `aria-label` and `title`, and the exemption is one
  named attribute, not a blanket rule.
- **The dense year grid carries a text alternative**: a visible summary line ("N sessions this year ·
  busiest month June (4h 30m)") and a visually hidden month table, so a screen-reader user reads the
  year in words instead of 371 squares; the grid itself is `aria-hidden` and its cells are out of the
  tab order, because 371 stops is not navigation.
- **The `/timeline` "Plan" link is fixed, not allow-listed** (44px wide as well as tall). It was the
  one blocking defect in a file that was frozen while Wave 7 settled; the lead lifted that for the one
  link, and the sweep's temporary `KNOWN_BLOCKED` list is gone.
- **Subtle 1px dividers are not treated as UI-component boundaries**: WCAG 1.4.11 asks 3:1 for
  boundaries needed to identify a control, and a decorative card divider is not one. The sweep checks
  the text and accent pairs that carry meaning.
- **The light accent is a different hex, not a different colour**: the hue is kept (amber stays amber),
  so nothing the person learned ("amber means X") changes.

## Evidence on main before the fixes

The same sweep on the pre-fix tree failed with 400+ named violations: `0 <main> elements` on every
route, the two Home links' label-in-name, the insights year arrows, the chart `<svg>`s, and target
sizes from 7x7 (heatmap) through 16x16 (checkboxes) to 28px-tall toolbar buttons; the reduced-motion
test reported `animation/transition still running` and the modal mid-slide. Theme contrast was green
in dark and red in light for the accent pairs.

## Mutants (each reverted to the real pre-fix code, each red)

- `<main>` removed → sweep red (`landmark-main`).
- Journal link's `aria-label` restored → sweep red (`label-in-name`).
- The reduced-motion media query neutered → reduced-motion test red.
- The light amber accent restored to the bright value → contrast test red.
- The system-light accent block deleted → the System-theme test red, naming amber at 1.91:1.
- The heatmap exemption removed → sweep red (371 target-size failures).
- The `/timeline` "Plan" link back to 25px wide → sweep red (`target-size`, the named link).

## Gates (part 1)

- `tsc --noEmit` 0, `eslint src tests` 0, `npm run build` 0.
- The sweep spec: 4/4 exit 0 (and `--repeat-each=10 --workers=2` run solo, reported with the PR).
- Unit: `tests/unit/a11y/contrast.test.ts` (the WCAG arithmetic on known pairs, symmetry, rejection of
  nonsense) and the existing theme-token tests.

## Deferred / known gaps

- High-contrast mode (part 2), the command palette and cheat sheet (part 3), virtualisation and the
  10k-task budget (part 4), empty states and first-run (part 5).
- The sweep covers the routes that need no seeded data; `/sessions/detail` and `/projects/detail`
  (which need an id) are covered by their own specs, not by this sweep.
- The sweep's name computation is an approximation of the accessibility tree (aria-label,
  aria-labelledby, labels, wrapping label, title, text); it is deliberately conservative and errs
  toward reporting.
