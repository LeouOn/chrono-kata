import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offerTextFile } from '@/lib/journal/handoff';

/**
 * The hand-off order and its two distinctions: a dismissed share sheet is a
 * decision (cancelled, not a failure), and a share that fails for a real reason
 * falls through to the download instead of stranding the export.
 */
const originalShare = Object.getOwnPropertyDescriptor(Navigator.prototype, 'share');
const originalCanShare = Object.getOwnPropertyDescriptor(Navigator.prototype, 'canShare');

function stubShare(behaviour: { canShare: boolean; share?: () => Promise<void> }) {
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    value: () => behaviour.canShare,
  });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: behaviour.share ?? (async () => undefined),
  });
}

/** A download in jsdom: capture the anchor click and the file name. */
function captureDownload(): { clicked: () => string[] } {
  const clicked: string[] = [];
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => 'blob:journal') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    clicked.push(this.download);
  };
  afterEachRestore.push(() => {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    HTMLAnchorElement.prototype.click = realClick;
  });
  return { clicked: () => clicked };
}

const afterEachRestore: (() => void)[] = [];

afterEach(() => {
  while (afterEachRestore.length > 0) afterEachRestore.pop()!();
  if (originalShare) Object.defineProperty(Navigator.prototype, 'share', originalShare);
  else delete (navigator as { share?: unknown }).share;
  if (originalCanShare) Object.defineProperty(Navigator.prototype, 'canShare', originalCanShare);
  else delete (navigator as { canShare?: unknown }).canShare;
});

describe('offerTextFile', () => {
  it('reports a dismissed share sheet as cancelled, with no download behind it', async () => {
    stubShare({
      canShare: true,
      share: async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      },
    });
    const download = captureDownload();
    expect(await offerTextFile('journal.md', 'text')).toBe('cancelled');
    expect(download.clicked()).toEqual([]);
  });

  it('falls back to the download when the share fails for a real reason', async () => {
    stubShare({
      canShare: true,
      share: async () => {
        throw new TypeError('share is not allowed here');
      },
    });
    const download = captureDownload();
    expect(await offerTextFile('journal.md', 'text')).toBe('downloaded');
    expect(download.clicked()).toEqual(['journal.md']);
  });

  it('uses the share sheet when it works, and the download when there is none', async () => {
    stubShare({ canShare: true });
    expect(await offerTextFile('journal.md', 'text')).toBe('shared');

    stubShare({ canShare: false });
    const download = captureDownload();
    expect(await offerTextFile('journal.md', 'text')).toBe('downloaded');
    expect(download.clicked()).toEqual(['journal.md']);
  });
});
