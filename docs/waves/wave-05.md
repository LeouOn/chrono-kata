# Wave 05 — Local LLM backbone

Roadmap: `chrono-kata-roadmap.md` → **Wave 5**. Status doc: `docs/ROADMAP_STATUS.md` (section W5).

The point of this wave is that the app can run **fully offline**, either with a local model or with
AI switched off entirely — and that when the user asks for privacy, the app honours it without
asking them to remember.

## What shipped

### PR 1 — LM Studio as a first-class provider

- **`lmstudio` provider preset** (`src/lib/llm/provider-defaults.ts`), default
  `http://localhost:1234/v1`, served by the existing OpenAI-compatible adapter — no new adapter
  class, no new wire format.
- **A host field** in the provider editor (`src/components/llm/ProviderEditor.tsx`): local presets
  are addressed by `host:port` (`localhost:1234` for the machine itself, `192.168.1.5:1234` for a
  LAN host a phone can reach). The derived base URL is shown next to it.
- **A model picker** fed by `GET {baseUrl}/models`, with the free-text model field as the fallback
  when the host serves no models.
- **A health check** ("Check host") next to the existing "Test connection": it asks the same
  `/models` endpoint, so it proves the host is up without spending an inference.
- **One definition of "local"** (`src/lib/llm/local-provider.ts`): a provider is local when its
  preset is local (`ollama`, `lmstudio`) **or** its base URL points at loopback, an RFC1918
  address, a link-local address, or an mDNS `.local` name.
- **Actionable failures** (`src/lib/llm/local-models.ts`): unreachable host, wrong port, wrong
  path, a host that answers with an error, a host with no models, and the browser's mixed-content
  block each produce their own message saying what was tried and what to check.

### PR 2 — Private mode, routing, and a context budget

- **Private mode is enforced once, at the seam.** `src/lib/llm/app-state.ts` reads the app
  settings row (the same row that holds the feature flags), and `src/lib/llm/llm-service.ts`
  resolves the provider for each AI surface through it. A non-local provider is refused with
  `LLMExceptionKind.PrivacyBlocked` **before any fetch happens**. The provider factory
  (`src/lib/llm/provider-factory.ts`) checks the same rule, so a caller that bypasses the service
  cannot get around it either.
  - The check is on the *provider*, not the URL, so it also covers the desktop-key path where the
    request is proxied through the loopback server.
  - If the privacy state cannot be read, the request is **not sent** (fail closed).
- **Per-feature provider routing** (`settings.llmRouting`): a default plus per-feature overrides
  for the surfaces that exist today (daily briefing, session coach comment, weekly reflection,
  coach conversation reply, label suggestion) with named slots for roadmap W3 (`decomposition`)
  and W4 (`estimate`). Stored on the settings row — optional and non-indexed, so **no Dexie
  version**. Precedence: an explicit caller override, then the feature's route, then the routing
  default, then the active provider.
- **A context budget** (`src/lib/llm/context-budget.ts`): a pure function that keeps as many whole
  items as fit in a token budget. Items are never cut in half — a half session is worse than no
  session — so an item that does not fit is dropped and counted. The token estimate is
  deliberately conservative: **one token ≈ four characters**.
- **"What gets sent" now says where it goes**: the daily briefing's provider and the private-mode
  state are shown next to the payload that leaves the device.
- **AI-off and offline degrade quietly**: with no provider configured, or with private mode
  refusing the coach, the practice loop still saves the session and nothing is sent.

## What was deliberately not built

- **No flagged feature.** `settings.flags.privateMode` is read, but the flags mechanism (PR #15)
  ships no behaviour of its own.
- **No `android/` changes.** The cleartext-LAN question is written up below as a proposal, because
  it is the human's decision, not a code detail.
- **No change to `src/lib/llm/provider-fetch.ts` or `src/lib/db/llm-settings.repo.ts`** — those are
  T9's files (Android hardening: native HTTP, Keystore keys). Nothing in this wave needed them.
- **No per-feature budget yet.** The context budget is a pure function with tests; which surfaces
  use it (and with what budget) is left to the waves that have long lists to send — W3's
  decomposition and W6's plan.
- **No host auto-discovery.** The host is typed in; scanning the LAN for an LM Studio server is a
  different feature with different privacy questions.

## Known issues and boundaries

1. **Private mode is about LLM traffic, not about every byte leaving the device.** It refuses a
   non-local *provider*; it does not touch Google Calendar sync (which sends sessions to Google),
   exports (which write a file wherever you choose), or anything else the app does on purpose. The
   LLM tab says so in the same words, next to the switch.
2. **A redirect from a local host is refused, not followed.** While private mode is on, every
   provider request is sent with `redirect: 'error'`, so a "local" server that answers `307` to a
   public URL cannot carry the request body off the machine — the request fails at the first hop
   and says so. Outside private mode the redirect behaviour is untouched, so a user's own
   http→https reverse proxy keeps working. (`src/lib/llm/provider-fetch.ts` is T9's file and was
   not touched: the option travels in the request the adapter builds.)
3. **The loopback AI proxy is outside the app's privacy guarantee.** `src/app/api/local-ai/route.ts`
   injects desktop environment keys and proxies the request server-side. That route serves the
   **environment-key cloud providers** (DeepSeek, ZAI, OpenRouter) — and private mode already
   refuses every one of them, because their addresses are public, so the route is never reached
   while private mode is on. A caller that talks to the route directly, bypassing the app, is
   outside the app's guarantee: the route is loopback-only and only exists in `npm run dev:local`.
   Making that boundary airtight belongs with T9's native HTTP work.
4. **Browsers block plain HTTP from an HTTPS page.** A hosted build (HTTPS) cannot reach
   `http://<lan-host>:1234` — the browser refuses mixed content. The app says so explicitly rather
   than showing a generic failure. The practical answers are a TLS reverse proxy in front of the
   local server, or running the app on `http://localhost` on the machine that hosts the model.
5. **CORS is the host's business.** LM Studio and Ollama both allow browser calls today; a
   self-hosted server that does not will fail with a CORS error, which surfaces as the generic
   "could not reach" message.
6. **Private mode is about the provider, not the payload.** Nothing in this wave sends health data
   — the coach payload is the minimized one built in T5 (aggregates only, no notes). Decision Q2
   still governs: any new AI surface that would send task or journal data must show what leaves
   the device and ask the human first.
7. **The routing table names providers, it does not check them.** A route pointing at a provider
   that was removed fails with a message that says which surface was routed where.

## Proposal: reaching a LAN model from Android (decision needed)

Android blocks cleartext HTTP by default. Reaching `http://192.168.x.x:1234` from the phone needs
one of these — the trade-off is the human's to make, and this wave changes nothing in `android/`.

**Option A — cleartext for the LAN, via a network security config.**
Add a `network_security_config.xml` that allows cleartext for private address ranges only, and
point the app's manifest at it.
- *For*: the simplest path; the request never leaves the household.
- *Against*: traffic is readable on the LAN; anyone on that network can act as the model server;
  the config is easy to get wrong (a too-broad domain rule silently opens every host); it is a
  per-platform exception that has to be maintained.

**Option B — a TLS reverse proxy in front of the local server.**
Run the local model behind a proxy with a certificate the phone trusts (or a tunnel such as
Tailscale/Cloudflare Tunnel) and point the host field at the `https://` address.
- *For*: one rule for all platforms; the traffic is encrypted and authenticated; the app needs no
  Android exception at all.
- *Against*: more moving parts for the person to run; certificate trust has to be arranged on the
  phone; a proxy that is down looks like an unreachable model.

**Recommendation:** Option B for anything beyond a single home network, Option A only as a
deliberate, narrowly-scoped exception. Either way the app's current behaviour is already correct
for the common case: a model on the same machine as the app (`http://localhost:1234`), which needs
no cleartext exception at all.

## Tests

| Area | Where |
|---|---|
| Local predicate (presets, loopback, RFC1918, mDNS, junk) | `tests/unit/llm/local-provider.test.ts` |
| Model discovery and health check (unreachable, wrong status, timeout, invalid URL, mixed content, no models) | `tests/unit/llm/local-models.test.ts` |
| Private mode (refused before any fetch; local allowed; factory guard) | `tests/unit/llm/privacy.test.ts` |
| Routing (per feature, default, fallback, unconfigured route, routing + private mode together) | `tests/unit/llm/routing.test.ts` |
| Context budget (empty, exactly at budget, one huge item, truncation) | `tests/unit/llm/context-budget.test.ts` |
| AI-off / private mode without a local host: the practice loop still works and nothing is sent | `tests/unit/llm/ai-off.test.tsx` |
