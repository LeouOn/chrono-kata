/**
 * A local, on-device error log (roadmap Wave 20 part 1). No telemetry: the
 * log lives in localStorage and never leaves the device except when the
 * user explicitly exports it.
 *
 * Privacy: nothing leaves the device unless the user exports the log. An
 * entry holds the error's name, message, stack, the route it happened on
 * (pathname only, never the query) and a timestamp. Message and stack are
 * TRUNCATED, not redacted: a short message that interpolates the user's own
 * text (a task title, say) is stored whole and is not flagged. So an entry can
 * contain short fragments of the user's own text. The Settings card says so
 * next to Export. A message cut at 200 characters is flagged "trimmed".
 *
 * Robustness rule: localStorage can throw or be unavailable (private
 * windows, quota). Every operation is wrapped: the app must work perfectly
 * without this log.
 */

export const ERROR_LOG_KEY = 'chrono-kata-error-log';
export const ERROR_LOG_MAX_ENTRIES = 50;
const MAX_MESSAGE_CHARS = 200;
const MAX_STACK_CHARS = 2000;

export interface ErrorLogEntry {
  /** Epoch ms. */
  at: number;
  /** Route path, e.g. "/inbox" (pathname only, never the query). */
  route: string;
  name: string;
  message: string;
  /** True when the message was cut at the limit. A short message is stored whole, flagged or not. */
  messageTruncated: boolean;
  stack: string;
}

function trim(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}…`, truncated: true };
}

/** Build a bounded entry (truncated, not redacted). Pure; exported for tests. */
export function scrubError(error: unknown, route: string, at: number = Date.now()): ErrorLogEntry {
  const name = error instanceof Error ? error.name : typeof error;
  const rawMessage =
    error instanceof Error ? error.message : error === undefined ? 'undefined' : String(error);
  const rawStack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';
  const message = trim(rawMessage, MAX_MESSAGE_CHARS);
  const stack = trim(rawStack, MAX_STACK_CHARS);
  // Pathname only: a query string can carry user state.
  let safeRoute = route;
  try {
    safeRoute = route.split('?')[0] ?? route;
  } catch {
    safeRoute = String(route).slice(0, 200);
  }
  return {
    at,
    route: safeRoute.slice(0, 200),
    name: name.slice(0, 100),
    message: message.text,
    messageTruncated: message.truncated,
    stack: stack.text,
  };
}

function readRaw(): ErrorLogEntry[] | null {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolerate anything: keep only structurally-valid entries.
    return parsed.filter(
      (e): e is ErrorLogEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as ErrorLogEntry).at === 'number' &&
        typeof (e as ErrorLogEntry).route === 'string' &&
        typeof (e as ErrorLogEntry).message === 'string'
    );
  } catch {
    return null; // storage unavailable or corrupt: callers ignore
  }
}

/** Record one error. Never throws; returns false when storage refused it. */
export function recordError(error: unknown, route: string): boolean {
  try {
    const existing = readRaw() ?? [];
    const next = [...existing, scrubError(error, route)];
    const bounded = next.slice(-ERROR_LOG_MAX_ENTRIES);
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(bounded));
    return true;
  } catch {
    return false;
  }
}

/** The current log, newest last. Empty array when unavailable. */
export function getErrorLog(): ErrorLogEntry[] {
  return [...(readRaw() ?? [])];
}

export function clearErrorLog(): void {
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
  } catch {
    // Unavailable storage: nothing to clear.
  }
}

/** Plain-text export, one entry per block, newest first. */
export function exportErrorLogText(entries: ErrorLogEntry[] = getErrorLog()): string {
  const lines = entries
    .slice()
    .reverse()
    .map((e) => {
      const when = new Date(e.at).toISOString();
      const flagged = e.messageTruncated ? ' (message trimmed)' : '';
      return `[${when}] ${e.route}\n${e.name}: ${e.message}${flagged}` + (e.stack ? `\n${e.stack}` : '');
    });
  return ['chrono-kata error log (kept on this device only)', '', ...lines].join('\n\n');
}
