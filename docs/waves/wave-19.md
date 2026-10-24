# Wave 19 — UX, accessibility, performance

**Status:** in progress · **PRs:** (1) the in-house a11y sweep and the fixes it found, (2) high
contrast, (3) command palette and cheat sheet, (4) performance on a 10k-task dataset, (5) empty states
and first-run · **Roadmap:** Wave 19 · **Lane:** B

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
