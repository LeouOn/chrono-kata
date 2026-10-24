# Wave 19 — UX, accessibility, performance

**Status:** in progress · **PRs:** (1) the in-house a11y sweep and the fixes it found, (2) theming and
high contrast, (3) command palette and cheat sheet, (4) performance on a 10k-task dataset, (5) empty
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
  2. **Theme-token contrast** computed in the browser from the CSS variables the app really uses:
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
    background. Dark magenta was also 4.36:1 on the card surface; one shade lighter clears it.
  - **Reduced motion**: a `prefers-reduced-motion` media query in `globals.css` (no CSS animation,
    transition or smooth scrolling) and `MotionProvider` (`MotionConfig reducedMotion="user"`) in the
    root layout, so motion/react skips transform animations too.

## Decisions where the roadmap was silent

- **No axe-core or any new dependency** (the lead's constraint): every rule is computed from the DOM in
  the page. The trade-off is that this sweep checks a curated set of rules, not axe's whole catalogue;
  it is the project's tripwire, extended rather than replaced.
- **A dense data-visualisation grid is exempt from the 44px rule**: a year heatmap cell is 7px at
  390px wide, and making each cell 44px would destroy the view. The cells are marked
  `data-a11y-exempt="dense-grid"`, keep their `aria-label` and `title`, and the exemption is one
  named attribute, not a blanket rule.
- **One known defect is allow-listed, not fixed**: the `/timeline` header's "Plan" link is 25px wide
  and lives in `src/components/timeline/**`, which is frozen while Wave 7 settles. The sweep lists it
  explicitly (`KNOWN_BLOCKED`) so it fails if anything else regresses, and the entry is removed when
  the freeze lifts.
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
- The heatmap exemption removed → sweep red (371 target-size failures).

## Gates (part 1)

- `tsc --noEmit` 0, `eslint src tests` 0, `npm run build` 0.
- The sweep spec: 4/4 exit 0 (and `--repeat-each=10 --workers=2` run solo, reported with the PR).
- Unit: `tests/unit/a11y/contrast.test.ts` (the WCAG arithmetic on known pairs, symmetry, rejection of
  nonsense) and the existing theme-token tests.

## Deferred / known gaps

- High-contrast mode (part 2), the command palette and cheat sheet (part 3), virtualisation and the
  10k-task budget (part 4), empty states and first-run (part 5).
- The `/timeline` "Plan" link stays 25px wide until Wave 7's freeze lifts (allow-listed above).
- The sweep covers the routes that need no seeded data; `/sessions/detail` and `/projects/detail`
  (which need an id) are covered by their own specs, not by this sweep.
- The sweep's name computation is an approximation of the accessibility tree (aria-label,
  aria-labelledby, labels, wrapping label, title, text); it is deliberately conservative and errs
  toward reporting.
