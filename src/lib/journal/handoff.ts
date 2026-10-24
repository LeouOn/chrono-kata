/**
 * Handing a text file to the person (roadmap Wave 12's markdown export).
 *
 * The same order the calendar and error-log exports use, for the same reasons:
 * a native share sheet when the platform has one (Android/WebView), a plain
 * download when it does not, and the clipboard as the last resort. The caller
 * gets back which one happened so it can say so in one calm sentence.
 *
 * Two distinctions matter:
 * - **A dismissed share sheet is not a failure.** `navigator.share` rejects with
 *   an `AbortError` when the person closes the sheet; that is a decision, so it
 *   is reported as `cancelled` and the caller says nothing.
 * - **A share that fails for a real reason must not strand the export.** Any
 *   other share error falls through to the download, and only if every hand-off
 *   fails does the caller hear the calm "could not be handed over".
 */
export type HandoffResult = 'shared' | 'downloaded' | 'copied' | 'cancelled';

type ShareCapableNavigator = Navigator & {
  canShare?: (data: { files?: File[] }) => boolean;
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
};

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export async function offerTextFile(
  filename: string,
  text: string,
  mimeType = 'text/markdown;charset=utf-8',
): Promise<HandoffResult> {
  const blob = new Blob([text], { type: mimeType });
  const nav = navigator as ShareCapableNavigator;
  const file = new File([blob], filename, { type: mimeType });
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      // A real share failure: try the next hand-off instead of failing here.
    }
  }
  if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return 'downloaded';
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
