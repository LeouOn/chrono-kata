# T9: Android hardening

**Depends on:** T1, for the backup envelope v2. **Coordinate with:** T5. T9 owns `src/lib/llm/provider-fetch.ts` and `src/lib/db/llm-settings.repo.ts`; T5 owns prompts, `llm-service.ts`, and coaches.

Split this into sub-PRs (a–d) if one is too large. Each part stands alone.

## (a) API keys in the Android Keystore
- Evaluate secure-storage Capacitor plugins that support **Capacitor 8** and store in the Android Keystore/EncryptedSharedPreferences. Note the choice and the reason in the PR.
- On native, keep a key reference in `llmSettings.providers[name]` rather than the key itself, and read the key from secure storage when a request is made.
- Add a one-time migration: on native, move any existing `apiKey` values out of IndexedDB into secure storage and blank them in Dexie.
- Web: unchanged storage, plus a clear warning in the LLM tab on hosted (non-localhost) builds, e.g. "Your key is stored in this browser. Any script on this page could read it. Use a key with a spending limit."

## (b) Native HTTP for coach requests
- In `provider-fetch.ts`, when `Capacitor.isNativePlatform()`, route requests through `CapacitorHttp` (built into `@capacitor/core`) instead of WebView `fetch`. This avoids CORS.
- Streaming (SSE, see `sse-parser.ts`) may not work through CapacitorHttp. If it doesn't, fall back to a non-streaming request on native and document that.
- Check each provider's current browser/CORS policy against its docs. For example, Anthropic requires the `anthropic-dangerous-direct-browser-access` header for browser calls. Record the findings in a short comment table in `provider-config.ts`.

## (c) Automatic backups on device
- Add `@capacitor/filesystem`. On native app start/resume, if the last backup is more than 24 hours old, write the export envelope (v2, from T1) to `Documents/ChronoKata/chrono-kata-YYYY-MM-DD.json` and keep the newest 7.
- Settings: show the last backup time and a "Back up now" button. Keys are never included (the export already blanks them).
- Confirm that the file survives an app uninstall on Android 13+, given scoped storage. If Documents doesn't survive, document the alternative (a share-sheet export).

## (d) E2E test against the static export
- Add a Playwright project that runs `npm run build:android`, serves `out/` with a static server, and runs the smoke specs (onboarding, session flow, settings). The point is to catch problems that only appear in the exported build, such as Suspense or routing.

## Acceptance
- On a device or emulator, keys aren't visible in WebView IndexedDB after migration (inspect via chrome://inspect).
- A coach request succeeds on native with no CORS error.
- The backup file appears and rotates.
- The export E2E project passes in CI/local.
