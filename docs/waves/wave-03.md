# Wave 3 — Next-action decomposition ("Break it down")

**Shipped:** 2026-10-24 · **PRs:** #20 (pure contract, part 1), #43 (UI + wired call, part 2) · **Lane:** C

## What shipped (part 2)

- **Wired call** (`src/lib/decomposition/service.ts`): `runDecomposition` resolves the routed
  provider for `DECOMPOSITION_FEATURE` (per-feature routing from W5), enforces private mode
  before any fetch, applies the shared 30s timeout, and returns the exact wire text so the UI
  can show it. Provider/network errors propagate untouched — a failed call writes nothing
  (there is no write on the call path at all).
- **The sheet** (`DecomposeSheet` + `useDecomposition`): "Break it down" and "This feels heavy"
  triggers on inbox rows (break-it-down), in process mode (both) and on plan-screen picks
  (break-it-down). Phases: privacy panel → running → result.
- **What leaves the device**, before the first call: the exact user-side text (built by the one
  prompt builder — title, next action, estimate, project name; the input type has no note or
  history fields, and a snapshot test fails if the builder ever grows one), the shared system
  instruction behind a disclosure, and the routed provider with a local/remote label.
  Default is to show it every time; "never ask again" was deliberately NOT added (see Choices).
- **Result UI**: first physical action prominent with its minutes; needs / pitfalls /
  what-you-can-skip lists; steps collapsed by default (max 7 per the contract); checkboxes pick
  which steps become subtasks (`parentId`, `source: 'ai'`, status `inbox`, estimate from the
  step); a checkbox for using the first action as the task's next action. **Nothing is written
  before the Confirm click** — proven by spies in the tests and by "Save nothing".
- **Fallback path**: after one repair round, an invalid reply renders as plain text, clearly
  marked, with no Confirm — unstructured output is never saved as structure.
- **Calm failures**: per-kind copy (timeout, rate limit, offline, auth, unreachable,
  privacy-blocked, unknown) with retry; no stack traces; no "failed" wording (tested).
- **Guards**: in-flight and Confirm guards live in refs; double-click-in-one-act tested for
  both; unmount/close aborts the call through the captured signal and the hook sets no state
  after unmount.

## Choices where the roadmap was silent

- **"Never ask again for this provider"**: not built. A safe version needs a per-provider
  consent record with revocation UX; the brief allowed it only if safe, and "show every time"
  is the privacy-preserving default. Deferred.
- **Subtasks land in `inbox`** (not `next`): they rest until triaged, like any capture —
  AI proposes, the user disposes, and disposal is triage's job.
- **Next-action checkbox defaults ON**: the whole point of the flow is that first move, and the
  Confirm click is the explicit consent. One checkbox away from off.
- **Repair round flattening**: the single-turn provider adapter (`completeSingle`) receives the
  repair conversation as labelled turns inside the user text ("Your previous reply: …"),
  because none of the v1 adapters implement multi-turn `chatWithTools`. The wire snapshot in
  the panel shows the first-round text; the repair text is derived from it.
- **Context budget**: not applied — the payload is one task (tens of tokens), not a list. The
  W5 budget function is for list surfaces; noted for W6/W14 if they ever send long lists.
- **Provider label in error copy**: the pre-call resolve knows the provider, the post-call
  rejection does not (LLMException carries no provider), so error copy says "The provider".

## Tests and evidence

- Unit (service): valid / repair / fallback / empty-reply / timeout / 429 / privacy-blocked
  paths with injected provider fakes; exact-wire `toMatchInlineSnapshot` (a note leaking into
  the payload fails); calm-copy table with a forbidden-word matcher.
- Unit (sheet): trigger accessible names; exact privacy text incl. "no other field" equality;
  double-send and double-Confirm in one `act()` write exactly once; nothing written before
  Confirm or on "Save nothing"; fallback has no Confirm; retry after error; unmount aborts the
  captured signal.
- Mutants: 20 attempted, 19 killed, 1 resolved by deletion (full ledger below).

### Mutation ledger (fix push)

First push, 8/8 killed: confirm-guard removal · in-flight-guard removal · wire-field
leak · unmount-abort removal · subtask parent/source drop · steps-default-open ·
calm-copy wording · repair-round removal.

Review round (dev-lead found 5 survivors + new-fix mutants), all now killed:
m2 Send-enabled-before-resolve → 'Send is disabled until the provider is resolved';
m5 next-action-checkbox-ignored → toggle-OFF test waits for the subtask write first
(deterministic ordering) then asserts the old next action;
m8 close-disarms-confirm → the disarm was defense-in-depth with NO observable path
(the guard resets in openFor, which is tested) — removed the dead line and the claim
instead of keeping an unkillable mutant;
m10 close-does-not-abort → 'closing the sheet aborts the in-flight call';
m12 aborted-call-shows-error → hook-level renderHook test asserts error stays idle
after a user cancel (component-level was unobservable: reopen clears error);
B1 transaction-removed → apply.test rollback test; B1 guard-never-reset → retry
must land the subtask (children === 1);
B2 old-hotkey-handler → ProcessMode test (keys 1-6/s inert under the sheet) + E2E;
B2 confirm-targets-live-prop → rerender-with-different-task test asserts run.taskId;
R3 repair-line-missing; R5 stale-preview-on-reopen; R5 LAN-host-called-on-this-device
→ 192.168.x provider test expects 'on your local network'.
- E2E (`w3-decompose.spec.ts`, 390×844): provider mocked at the HTTP boundary — happy path
  with confirm + subtask visible after reload; two-invalid-replies fallback with exactly 2
  calls and no Confirm. Full Playwright suite ×2 exit 0. Screenshots in /tmp/qa-w3-shots/.

## Deferred / known gaps

- No triangulation (W4) and no estimate comparison — by scope.
- The repair round cannot use a true multi-turn history until an adapter implements
  `chatWithTools`; the flattening is equivalent on the wire.
- Keyboard shortcut for the sheet is not in this wave (the capture sheet owns Ctrl/Cmd+K).
