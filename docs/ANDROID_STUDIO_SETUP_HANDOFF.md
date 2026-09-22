# Android Studio Setup & Handoff Briefing

**Project:** `chrono-kata`  
**Date:** September 21, 2026  
**Status:** In Progress (Investigation complete, dependencies installed, roadmap ready)

---

## 1. Executive Summary & Objective

The user requested setting up this project for **Android Studio**.
- **Crucial Requirement:** The resulting Android app **must be able to run standalone on Android without connecting to a laptop/desktop** (offline APK containing all web assets), while optionally supporting live-reload from a local dev server when desired.
- **Approach Selected:** **Capacitor** (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`). This creates a standard native `android/` Gradle project that Android Studio natively opens, builds, debugs, and deploys.

---

## 2. Environment & System Findings

All necessary prerequisites are already present on the user's Windows machine:
- **Android SDK:** `C:\Users\llama\AppData\Local\Android\Sdk`
  - Platforms installed: `android-35`
  - Build-tools installed: `35.0.1`, `36.0.0`
  - ADB: `C:\Users\llama\AppData\Local\Android\Sdk\platform-tools\adb.exe`
  - Attached physical device detected: `RFCY222BGBV` (device is currently unauthorized / needs USB debugging accepted on phone screen).
- **Android Studio:** `C:\Program Files\Android\Android Studio\bin\studio64.exe`
  - Bundled JDK (JBR 21): `C:\Program Files\Android\Android Studio\jbr`
  - System JRE: Eclipse Adoptium JRE 21 (`C:\Program Files\Eclipse Adoptium\jre-21.0.3.9-hotspot`)
- **Existing Android Studio Project State:**
  - Android Studio was previously opened on the root directory (`.idea/` contains `chrono-kata.iml`, `studiobot.xml`, `workspace.xml`).
  - Because the root has no Gradle files, Android Studio opened it as a plain generic directory rather than an Android Gradle project.
  - Adding the `android/` directory (via Capacitor) allows opening `chrono-kata/android` in Android Studio with full Gradle sync, run configurations, device deployment, and Logcat.

---

## 3. Capacitor Setup Progress

The required Capacitor packages have already been installed in `package.json`:
- `@capacitor/core`: `^8.5.2`
- `@capacitor/android`: `^8.5.2`
- `@capacitor/cli`: `^8.5.2` (devDependency)

---

## 4. Technical Hurdles & Verified Solutions

For the app to run **without connecting to a laptop**, Next.js must export static files to the `out/` directory (`output: 'export'`) so Capacitor can bundle them inside the APK (`android_asset`).

During static export verification (`npx next build` with `NEXT_EXPORT=true`), two specific roadblocks were discovered:

### Roadblock 1: Server Route Handler `/api/local-ai`
- **Error:** `export const dynamic = "force-dynamic" on page "/api/local-ai" cannot be used with "output: export"`.
- **Finding:** Next.js static export disallows dynamic API route handlers.
- **Context:** In `chrono-kata`, `/api/local-ai` is **only** used for the desktop local dev server (`scripts/local-dev.mjs`) to read environment keys from the desktop shell.
  - `src/lib/llm/local-discovery.ts` (line 13) explicitly skips calling `/api/local-ai` when not on `localhost`/`127.0.0.1`.
  - On Android, users paste their API keys directly in the app (stored in IndexedDB).
- **Solution:** In the Android build script (`scripts/build-android.mjs`), temporarily rename `src/app/api` to `src/app/_api` during the static export build, and restore it in a `finally` block. This keeps normal desktop dev (`npm run dev:local`) 100% intact while allowing clean static builds.

### Roadblock 2: Dynamic Client Route `/sessions/[id]`
- **Error:** `Page "/sessions/[id]" is missing "generateStaticParams()" so it cannot be used with "output: export" config`.
- **Finding:** In Next.js App Router, dynamic folder parameters (`[id]`) cannot be statically exported without `generateStaticParams()`. Because sessions are created dynamically by the user and stored in client-side IndexedDB (Dexie), session IDs cannot be known at build time.
- **Context:** `/sessions/[id]` is only navigated to from two places:
  1. `src/app/(main)/page.tsx` (`router.push('/sessions/' + id)`)
  2. `src/app/(main)/sessions/page.tsx` (`router.push('/sessions/' + id)`)
- **Recommended Solution:**
  Refactor session detail navigation from path parameter (`/sessions/[id]`) to search query parameter (`/sessions/detail?id=...` or `/sessions?id=...`) using `useSearchParams()`.
  - Query parameters are 100% supported by Next.js static export without any `generateStaticParams()`.
  - Solves WebView deep linking and reload 404s cleanly on Android.

### Roadblock 3: Headers in `next.config.ts`
- **Error:** Next.js static export rejects custom `headers()`.
- **Status:** Already updated in `next.config.ts`:
  ```ts
  const isExport = process.env.NEXT_EXPORT === 'true';
  const nextConfig: NextConfig = {
    output: isExport ? 'export' : undefined,
    headers: isExport ? undefined : async () => [ ... ],
    ...
  }
  ```

---

## 5. Step-by-Step Implementation Roadmap for Next Agent

1. **Refactor `/sessions/[id]` to query param (or static placeholder):**
   - Create `src/app/(main)/sessions/detail/page.tsx` (using `useSearchParams()`), or update `sessions/[id]` so static export succeeds.
   - Update navigation in `src/app/(main)/page.tsx` and `src/app/(main)/sessions/page.tsx`.

2. **Create `scripts/build-android.mjs`:**
   - Temporarily stashes `src/app/api`.
   - Runs `next build` with `NEXT_EXPORT=true` (outputs to `out/`).
   - Restores `src/app/api` in `finally`.

3. **Initialize Capacitor:**
   - Run `npx cap init chrono-kata com.chronokata.app --web-dir out`
   - Run `npx cap add android` (this creates the `android/` directory with `build.gradle`, `settings.gradle`, `app/`, etc.).

4. **Configure `capacitor.config.ts`:**
   - Default: offline static bundle from `out`.
   - Optional live-reload toggle via environment variable (`CAPACITOR_LIVE_RELOAD=true` -> `server: { url: 'http://10.0.2.2:3000', cleartext: true }`).

5. **Sync Web Assets to Android:**
   - Run `npx cap sync android` (copies `out/` into `android/app/src/main/assets/public`).

6. **Add NPM Scripts to `package.json`:**
   - `"build:android": "node scripts/build-android.mjs"`
   - `"cap:sync": "npm run build:android && npx cap sync android"`
   - `"cap:open": "npx cap open android"`

7. **Verification:**
   - Run `./android/gradlew.bat assembleDebug` in PowerShell to ensure Gradle builds `app-debug.apk` without errors.
   - Test opening in Android Studio via `npx cap open android` or `File -> Open -> chrono-kata/android`.
