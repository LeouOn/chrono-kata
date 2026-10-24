# Optional device sync: the decision

**Status:** a decision document. Nothing in this file is built, and Wave 18 stops here on purpose.
**Question:** if a person wants the same Chrono Kata data on two devices, how should that work without
giving up what the app is: local-first, private, no account, nothing talking to a server?
**Decision:** if sync is ever built, build the **file-based encrypted change log** (option A) and do not
adopt a CRDT library (option B). Both are explained below, with what each would cost, so the choice can be
revisited when a person actually asks for it.

## What the app already has (and what that is not)

- A versioned backup file, an import that can **add what is missing** or **replace everything**, an
  encrypted form of the file (AES-256-GCM, PBKDF2), and a test that proves a round trip loses nothing
  (the completeness oracle).
- That is **transfer**, not sync. "Add what is missing" never updates a row that is already here and never
  deletes; two devices that both edit a task end up with two different tasks. Sync needs three things the
  backup path deliberately does not have: *updates*, *deletes*, and *a rule for who wins*.

## Requirements (from the product, not from a technology)

1. **No server, no account.** The app must not need to reach anything on the network to sync. A person may
   bring their own transport (a synced folder, a USB stick); the app never talks to it as a service.
2. **Private by construction.** Whatever travels is encrypted with a key the person's passphrase makes; the
   transport (a cloud drive, say) sees only ciphertext.
3. **Works offline, for weeks.** Devices drift apart and merge later. No "must be online together".
4. **Never silently loses writing.** The journal and the notes are irreplaceable. A conflict must keep both
   versions rather than choose one quietly.
5. **No new schema for the person to understand**, and the completeness oracle still has to hold: whatever
   sync adds, "everything comes back identically" stays testable.
6. **Small.** No large dependency in a static-export Android app.

## Option A: a file-based encrypted change log

Each device appends to its own log file in a folder the person chooses and some other tool (Syncthing, a
cloud drive, a file share) keeps in step. Devices read each other's logs and replay what they have not seen.

- **What a log holds.** Row-level changes: `{ table, key, op: "put" | "delete", row?, at, device }`, where
  `at` is a **hybrid logical clock** (wall time plus a counter plus the device id), so order is stable even
  when two clocks disagree. Deletes are **tombstones** (a `delete` entry that wins over older puts).
- **Capture.** One place records the changes: the repositories already funnel every write, and Dexie has
  table hooks (`creating` / `updating` / `deleting`) for the rest. The import and restore paths write with a
  flag so they are not echoed back as new changes.
- **Merging.** Per row, the entry with the highest clock wins (last writer wins). That is right for almost
  everything here (a task's status, a project's cadence, a setting). It is **not** right for free text that
  two devices both edited: for `journal`, `shutdownNote`, `breadcrumb` and review `notes` the rule is
  **keep both**: the loser is saved as a visibly named conflict copy beside the winner, never dropped.
- **Encryption.** The same container as the encrypted backup (`encrypted.ts`): a log is a sequence of small
  sealed chunks, each with its own random IV, the header bound as additional data. The folder holds nothing
  readable.
- **Size and cleanup.** A log grows. **Compaction** writes a sealed snapshot (the encrypted backup, already
  built) and starts a new log; a device that has applied everything up to the snapshot may delete the old logs.
- **Transport per platform.** On the web, the File System Access API (Chromium only) or a manual
  "export / import this folder"; on Android a folder picker (the Storage Access Framework), which needs
  native work in `android/` that Wave 18 is not allowed to touch. This is the main unknown.

**For it:** fits the data model exactly (rows in tables); no dependency; each piece reuses something already
tested (encryption, the oracle, the merge report); the person controls where the files live; failure is
visible (a file is there or it is not).
**Against it:** it is a real project (change capture, tombstones, clocks, compaction, a conflict UI); the
transport is only as good as the folder-sync tool the person chooses; last-writer-wins can still surprise on
fields that are not free text.

## Option B: a CRDT

Store each record (or each table) as a conflict-free replicated document (Automerge or Yjs style), so two
devices merge automatically with no clock and no tombstone rules, and even free text merges character by
character.

**For it:** merging is automatic and mathematically safe; free text merges well.
**Against it:** it changes the data model. The app stores plain rows in Dexie and every repository, schema,
index and test assumes that; a CRDT stores operations and history, so the rows become a *view* of a
document and every query path changes. It adds a large dependency (a WebAssembly core in several of the
libraries) to a static-export Android app. History grows without bound and needs its own garbage
collection. The completeness oracle would have to be rebuilt around documents. And it **still needs a
transport**: a CRDT says how to merge, not how the bytes get from one device to the other. It solves the
smaller half of the problem and moves the whole app to do it.

## Not considered: a relay server

A hosted relay would be the easiest transport and breaks requirement 1. If it is ever wanted it should be
optional, self-hostable, and carry the same sealed chunks as option A, so it is a transport and not a new
design.

## Recommendation and order of work, if it is built

1. Keep shipping the manual path (backup file, add-or-replace, encrypted file, automatic copies). Most people
   with two devices need "move my data once", which this already does.
2. If sync is wanted: **change capture** first, behind a flag, writing a local journal and nothing else, so
   its cost can be measured on real data.
3. Then the **folder transport** on one platform (web, File System Access) with a manual fallback.
4. Then **compaction**, then the **conflict copies** UI for text.
5. Each step keeps the oracle: seed two devices, make edits on each, exchange files, and assert both end up
   with the same rows (and that no text was lost).

## Open questions (for whoever builds it)

- Does a person with two devices want *merge* or *one device is the main one*? The second is much simpler:
  a one-way "copy from this device" is already what Replace does.
- How are deletes shown, given the app's rule that nothing is ever called "dropped" with blame?
- Which of the Android folder options is acceptable without the native work being done in this wave?
