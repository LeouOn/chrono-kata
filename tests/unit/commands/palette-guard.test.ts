import { afterEach, describe, expect, it } from 'vitest';
import {
  PALETTE_DIALOG_ATTRIBUTE,
  isForeignDialogOpen,
  nextPaletteOpen,
} from '@/lib/commands/palette-guard';

/**
 * The guard behind the one global shortcut. A Modal keeps its dialog node in the
 * DOM while it animates out, so "is any dialog open" is not the same question as
 * "does something else own the keyboard".
 */
afterEach(() => {
  document.body.innerHTML = '';
});

function dialog(attributes: Record<string, string> = {}): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('role', 'dialog');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.appendChild(element);
  return element;
}

describe('the palette guard', () => {
  it('ignores the palette\'s own closing panel', () => {
    dialog({ [PALETTE_DIALOG_ATTRIBUTE]: 'true' });
    expect(isForeignDialogOpen()).toBe(false);
    expect(nextPaletteOpen(false)).toBe(true);
  });

  it('stays shut while another dialog owns the keyboard', () => {
    dialog();
    expect(isForeignDialogOpen()).toBe(true);
    expect(nextPaletteOpen(false)).toBe(false);
  });

  it('treats a foreign dialog as foreign even next to its own closing panel', () => {
    dialog({ [PALETTE_DIALOG_ATTRIBUTE]: 'true' });
    dialog();
    expect(nextPaletteOpen(false)).toBe(false);
  });

  it('toggles shut when it is already open', () => {
    expect(nextPaletteOpen(true)).toBe(false);
  });

  it('opens when nothing is in the way', () => {
    expect(nextPaletteOpen(false)).toBe(true);
  });
});
