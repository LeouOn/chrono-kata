/**
 * Handing a text file to the person (roadmap Wave 12's markdown export).
 *
 * The same order the calendar and error-log exports use, for the same reasons:
 * a native share sheet when the platform has one (Android/WebView), a plain
 * download when it does not, and the clipboard as the last resort. The caller
 * gets back which one happened so it can say so in one calm sentence.
 */
export type HandoffResult = 'shared' | 'downloaded' | 'copied';

export async function offerTextFile(
  filename: string,
  text: string,
  mimeType = 'text/markdown;charset=utf-8',
): Promise<HandoffResult> {
  const blob = new Blob([text], { type: mimeType });
  const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };
  const file = new File([blob], filename, { type: mimeType });
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title: filename });
    return 'shared';
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
