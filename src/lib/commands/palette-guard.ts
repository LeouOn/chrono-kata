/**
 * Should the palette open for a Ctrl/Cmd+K press right now?
 *
 * The palette is a `Modal`, and a `Modal` keeps its `role="dialog"` node in the
 * DOM while it animates out (~0.5 s). Counting every dialog therefore counted
 * the palette's own exiting panel, and "Ctrl+K, Escape, Ctrl+K" - a normal
 * "oops, closed it" - did nothing. The palette's panel is marked, so it is not
 * a reason to stay shut; any OTHER dialog is.
 */
export const PALETTE_DIALOG_ATTRIBUTE = 'data-command-palette';

export function isForeignDialogOpen(root: ParentNode = document): boolean {
  return Array.from(root.querySelectorAll('[role="dialog"]')).some(
    (dialog) => !dialog.hasAttribute(PALETTE_DIALOG_ATTRIBUTE),
  );
}

/** The palette toggles shut when open; otherwise it opens unless a dialog owns the keyboard. */
export function nextPaletteOpen(currentlyOpen: boolean, root: ParentNode = document): boolean {
  if (currentlyOpen) return false;
  return !isForeignDialogOpen(root);
}
